const { LoCoreService } = require('../../src/main/lo-core.cjs');

/** 构造 mock 客户端工厂 */
function makeMockClient(overrides = {}) {
  const client = {
    login: jest.fn(),
    logout: jest.fn(),
    health: { stats: jest.fn() },
    notes: { list: jest.fn(), get: jest.fn(), update: jest.fn() },
    operations: { execute: jest.fn(), list: jest.fn(), undo: jest.fn() },
    relations: { list: jest.fn() },
    events: { subscribe: jest.fn(), history: jest.fn() },
    ...overrides,
  };
  return client;
}

describe('LoCoreService', () => {
  it('configure 使用默认值与自定义配置', () => {
    const service = new LoCoreService({});
    const res = service.configure();
    expect(res.ok).toBe(true);
    expect(res.config).toMatchObject({
      host: '127.0.0.1',
      port: 8765,
      protocol: 'http',
    });
    expect(service.configured).toBe(true);

    const custom = service.configure({ host: '10.0.0.2', port: 9000, protocol: 'https' });
    expect(custom.config.port).toBe(9000);
    expect(custom.config.protocol).toBe('https');
  });

  it('configure 会创建 LoClient 客户端', () => {
    const LoClientMock = jest.fn();
    const service = new LoCoreService({ LoClient: LoClientMock });
    service.configure({ host: 'h', port: 1 });
    expect(LoClientMock).toHaveBeenCalledWith({
      host: 'h',
      port: 1,
      protocol: 'http',
      timeout: 15000,
    });
  });

  it('load 读取注入的 loadConfig', () => {
    const service = new LoCoreService({ loadConfig: () => ({ host: 'x' }) });
    expect(service.load()).toEqual({ host: 'x' });
    expect(service.config).toEqual({ host: 'x' });
  });

  it('未配置时 login/status/listNotes 报错提示先 configure', async () => {
    const service = new LoCoreService({});
    const loginRes = await service.login();
    expect(loginRes.ok).toBe(false);
    expect(loginRes.message).toContain('configure');

    const statusRes = await service.getStatus();
    expect(statusRes.ok).toBe(false);
    expect(statusRes.message).toContain('configure');

    const listRes = await service.listNotes();
    expect(listRes.ok).toBe(false);
    expect(listRes.message).toContain('configure');
  });

  it('login 成功返回 token/fingerprint', async () => {
    const client = makeMockClient();
    client.login.mockResolvedValue({ token: 'tok', fingerprint: 'fp1', label: 'l' });
    const service = new LoCoreService({ LoClient: jest.fn(() => client) });
    service.configure({});
    const res = await service.login({ privateKeyPath: '/k' });
    expect(client.login).toHaveBeenCalledWith({ privateKeyPath: '/k' });
    expect(res).toEqual({ ok: true, token: 'tok', fingerprint: 'fp1' });
  });

  it('login 业务错误转 { error: "api", status, message }', async () => {
    const client = makeMockClient();
    client.login.mockRejectedValue(
      Object.assign(new Error('未注册的公钥指纹: x'), {
        name: 'LoApiError',
        status: 400,
      }),
    );
    const service = new LoCoreService({
      LoClient: class {
        constructor() {}
      },
    });
    // 注入 true LoApiError 实例
    const { LoApiError } = require('@lo/client');
    client.login.mockRejectedValue(new LoApiError('未注册', { status: 400 }));
    service.configure({});
    service.client = client;
    const res = await service.login({ fingerprint: 'x' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('api');
    expect(res.status).toBe(400);
  });

  it('连接层错误映射为 { error:http, code }', async () => {
    const { LoHttpError } = require('@lo/client');
    const client = makeMockClient();
    client.health.stats.mockRejectedValue(new LoHttpError('连接拒绝', { code: 'ECONNREFUSED' }));
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.getStatus();
    expect(res.ok).toBe(false);
    expect(res.error).toBe('http');
    expect(res.code).toBe('ECONNREFUSED');
  });

  it('未知错误映射为 unknown', async () => {
    const client = makeMockClient();
    client.notes.list.mockRejectedValue(new Error('boom'));
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.listNotes();
    expect(res.ok).toBe(false);
    expect(res.error).toBe('unknown');
  });

  it('getStatus 与 listNotes 成功路径', async () => {
    const client = makeMockClient();
    client.health.stats.mockResolvedValue({ totalResources: 5 });
    client.notes.list.mockResolvedValue({
      total: 2,
      data: [{ rid: 'r1' }, { rid: 'r2' }],
    });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;

    expect(await service.getStatus()).toEqual({ ok: true, stats: { totalResources: 5 } });
    const list = await service.listNotes({ limit: 10 });
    expect(list).toEqual({ ok: true, total: 2, data: [{ rid: 'r1' }, { rid: 'r2' }] });
    expect(client.notes.list).toHaveBeenCalledWith({ limit: 10 });
  });

  it('logout 清除 token', () => {
    const client = makeMockClient();
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = service.logout();
    expect(client.logout).toHaveBeenCalled();
    expect(res.ok).toBe(true);
  });

  it('未配置时 getNote/updateNote 报错提示先 configure', async () => {
    const service = new LoCoreService({});
    const getRes = await service.getNote('r1');
    expect(getRes.ok).toBe(false);
    expect(getRes.message).toContain('configure');
    const updateRes = await service.updateNote('r1');
    expect(updateRes.ok).toBe(false);
    expect(updateRes.message).toContain('configure');
  });

  it('getNote 返回单个资源', async () => {
    const client = makeMockClient();
    client.notes.get.mockResolvedValue({ rid: 'r1', content: 'hi' });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.getNote('r1');
    expect(res).toEqual({ ok: true, data: { rid: 'r1', content: 'hi' } });
    expect(client.notes.get).toHaveBeenCalledWith('r1');
  });

  it('updateNote 经 Operation 语义执行并返回更新结果', async () => {
    const client = makeMockClient();
    client.operations.execute.mockResolvedValue({
      operationId: 'op_1',
      result: { rid: 'r1', content: 'edited' },
    });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.updateNote('r1', { content: 'edited' });
    expect(res.ok).toBe(true);
    expect(res.operationId).toBe('op_1');
    expect(client.operations.execute).toHaveBeenCalledWith(
      'resource.update',
      { rid: 'r1', updates: { content: 'edited' } },
      {},
    );
    expect(res.data.content).toBe('edited');
  });

  it('getNote/updateNote 业务错误映射为 api', async () => {
    const { LoApiError } = require('@lo/client');
    const client = makeMockClient();
    client.notes.get.mockRejectedValue(new LoApiError('not found', { status: 404 }));
    client.operations.execute.mockRejectedValue(new LoApiError('bad request', { status: 400 }));
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const getRes = await service.getNote('r1');
    expect(getRes.ok).toBe(false);
    expect(getRes.error).toBe('api');
    expect(getRes.status).toBe(404);
    const updateRes = await service.updateNote('r1', { content: 'x' });
    expect(updateRes.ok).toBe(false);
    expect(updateRes.error).toBe('api');
    expect(updateRes.status).toBe(400);
  });

  it('configure 通过 saveConfig 持久化配置', () => {
    const saved = {};
    const service = new LoCoreService({
      loadConfig: () => ({}),
      saveConfig: (cfg) => Object.assign(saved, cfg),
    });
    service.configure({ host: '10.0.0.2', port: 9000, protocol: 'https' });
    expect(saved).toMatchObject({
      host: '10.0.0.2',
      port: 9000,
      protocol: 'https',
      timeout: 15000,
    });
  });

  it('login 成功后持久化 privateKeyPath', async () => {
    const saved = {};
    const client = makeMockClient();
    client.login.mockResolvedValue({ token: 'tok', fingerprint: 'fp' });
    const service = new LoCoreService({
      LoClient: jest.fn(() => client),
      saveConfig: (cfg) => Object.assign(saved, cfg),
    });
    service.configure({ host: 'h' });
    await service.login({ privateKeyPath: '/k' });
    expect(saved.privateKeyPath).toBe('/k');
  });

  it('logout 从持久化配置移除 privateKeyPath', () => {
    let saved = { host: 'h', port: 1, privateKeyPath: '/k' };
    const service = new LoCoreService({
      loadConfig: () => ({ ...saved }),
      saveConfig: (cfg) => {
        saved = { ...cfg };
      },
    });
    service.configure({});
    const res = service.logout();
    expect(res.ok).toBe(true);
    expect(saved.privateKeyPath).toBeUndefined();
    expect(saved.host).toBe('h');
  });

  it('logout 保留非私钥字段', () => {
    let saved = { host: 'h', port: 1, privateKeyPath: '/k', fingerprint: 'fp' };
    const service = new LoCoreService({
      loadConfig: () => ({ ...saved }),
      saveConfig: (cfg) => {
        saved = { ...cfg };
      },
    });
    service.configure({});
    service.logout();
    expect(saved.fingerprint).toBe('fp');
    expect(saved.host).toBe('h');
  });

  describe('关联关系', () => {
    it('getRelations 委托 client.relations.list({rid})', async () => {
      const client = makeMockClient();
      client.relations.list.mockResolvedValue({
        outgoing: [{ id: 1, to_rid: 'res_2', type: 'reference' }],
        incoming: [],
      });
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;
      const res = await service.getRelations('res_1');
      expect(res.ok).toBe(true);
      expect(res.data.outgoing).toHaveLength(1);
      expect(client.relations.list).toHaveBeenCalledWith({ rid: 'res_1' });
    });

    it('getRelations 错误映射为 api', async () => {
      const { LoApiError } = require('@lo/client');
      const client = makeMockClient();
      client.relations.list.mockRejectedValue(new LoApiError('bad', { status: 500 }));
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;
      const res = await service.getRelations('res_1');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('api');
    });

    it('未配置时 getRelations 报错', async () => {
      const service = new LoCoreService({});
      const res = await service.getRelations('res_1');
      expect(res.ok).toBe(false);
      expect(res.message).toContain('configure');
    });
  });

  describe('操作历史与撤销', () => {
    it('listOperations 委托 client.operations.list', async () => {
      const client = makeMockClient();
      client.operations.list.mockResolvedValue({
        total: 2,
        data: [{ operation_id: 'op_1', type: 'resource.create' }],
      });
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;
      const res = await service.listOperations({ limit: 10 });
      expect(res.ok).toBe(true);
      expect(res.total).toBe(2);
      expect(client.operations.list).toHaveBeenCalledWith({ limit: 10 });
    });

    it('undoOperation 委托 client.operations.undo', async () => {
      const client = makeMockClient();
      client.operations.undo.mockResolvedValue({ undoOperationId: 'op_2' });
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;
      const res = await service.undoOperation('op_1');
      expect(res.ok).toBe(true);
      expect(res.data.undoOperationId).toBe('op_2');
      expect(client.operations.undo).toHaveBeenCalledWith('op_1');
    });

    it('未配置时 listOperations/undoOperation 报错', async () => {
      const service = new LoCoreService({});
      const listRes = await service.listOperations();
      expect(listRes.ok).toBe(false);
      expect(listRes.message).toContain('configure');
      const undoRes = await service.undoOperation('op_1');
      expect(undoRes.ok).toBe(false);
      expect(undoRes.message).toContain('configure');
    });

    it('listOperations 错误映射为 api', async () => {
      const { LoApiError } = require('@lo/client');
      const client = makeMockClient();
      client.operations.list.mockRejectedValue(new LoApiError('bad', { status: 500 }));
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;
      const res = await service.listOperations();
      expect(res.ok).toBe(false);
      expect(res.error).toBe('api');
    });
  });

  describe('事件订阅(SSE)', () => {
    it('subscribeEvents 委托 client.events.subscribe 并回调', async () => {
      const client = makeMockClient();
      const close = jest.fn();
      client.events.subscribe.mockImplementation((types, handler) => {
        return { close };
      });
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;

      const received = [];
      const res = service.subscribeEvents(['resource.created'], (ev) => received.push(ev));
      expect(res.ok).toBe(true);
      expect(client.events.subscribe).toHaveBeenCalledWith(
        ['resource.created'],
        expect.any(Function),
      );
      // 触发回调
      const handler = client.events.subscribe.mock.calls[0][1];
      handler({ event: 'resource.created', data: { rid: 'r1' } });
      expect(received).toHaveLength(1);
      expect(received[0].event).toBe('resource.created');
    });

    it('重复 subscribeEvents 会关闭旧订阅', () => {
      const client = makeMockClient();
      const close1 = jest.fn();
      const close2 = jest.fn();
      client.events.subscribe
        .mockReturnValueOnce({ close: close1 })
        .mockReturnValueOnce({ close: close2 });
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;

      service.subscribeEvents(['a'], () => {});
      service.subscribeEvents(['b'], () => {});
      expect(close1).toHaveBeenCalled();
      expect(close2).not.toHaveBeenCalled();
    });

    it('unsubscribeEvents 关闭订阅', () => {
      const client = makeMockClient();
      const close = jest.fn();
      client.events.subscribe.mockReturnValue({ close });
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;
      service.subscribeEvents(['a'], () => {});
      const res = service.unsubscribeEvents();
      expect(res.ok).toBe(true);
      expect(close).toHaveBeenCalled();
    });

    it('logout 关闭事件订阅', () => {
      const client = makeMockClient();
      const close = jest.fn();
      client.events.subscribe.mockReturnValue({ close });
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;
      service.subscribeEvents(['a'], () => {});
      service.logout();
      expect(close).toHaveBeenCalled();
    });

    it('未配置时 subscribeEvents 报错', async () => {
      const service = new LoCoreService({});
      const res = service.subscribeEvents(['a'], () => {});
      expect(res.ok).toBe(false);
      expect(res.message).toContain('configure');
    });
  });
});
