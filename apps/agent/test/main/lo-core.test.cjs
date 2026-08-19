const { LoCoreService } = require('../../src/main/lo-core.cjs');

/** 构造 mock 客户端工厂 */
function makeMockClient(overrides = {}) {
  const client = {
    login: jest.fn(),
    logout: jest.fn(),
    health: { stats: jest.fn() },
    notes: { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn(), upload: jest.fn() },
    operations: { execute: jest.fn(), list: jest.fn(), undo: jest.fn() },
    views: { list: jest.fn(), get: jest.fn(), run: jest.fn() },
    relations: { list: jest.fn() },
    events: { subscribe: jest.fn(), history: jest.fn() },
    repository: { info: jest.fn(), resolveLocation: jest.fn() },
    resources: { import: jest.fn(), binary: jest.fn() },
    admin: { graph: jest.fn(), graphPath: jest.fn() },
    modes: { list: jest.fn(), resolve: jest.fn() },
    viewers: { list: jest.fn(), resolve: jest.fn() },
    search: { search: jest.fn() },
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

  it('getRepositoryInfo 透传 Core Repository Identity（不自行拼接路径）', async () => {
    const client = makeMockClient();
    client.repository.info.mockResolvedValue({
      repositoryId: 'repo_uuid',
      path: '/tmp/lo-demo',
    });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.getRepositoryInfo();
    expect(res).toEqual({
      ok: true,
      info: { repositoryId: 'repo_uuid', path: '/tmp/lo-demo' },
    });
  });

  it('resolveResourceLocation 透传 Core Resolver 三态', async () => {
    const client = makeMockClient();
    client.repository.resolveLocation.mockResolvedValue({
      kind: 'local',
      resolved: true,
      absolutePath: '/tmp/lo-demo/resources/a.md',
    });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.resolveResourceLocation('res_1');
    expect(res).toEqual({
      ok: true,
      resolved: { kind: 'local', resolved: true, absolutePath: '/tmp/lo-demo/resources/a.md' },
    });
    expect(client.repository.resolveLocation).toHaveBeenCalledWith('res_1');
  });

  it('未配置时 getRepositoryInfo/resolveResourceLocation 报错提示先 configure', async () => {
    const service = new LoCoreService({});
    const infoRes = await service.getRepositoryInfo();
    expect(infoRes.ok).toBe(false);
    expect(infoRes.message).toContain('configure');
    const locRes = await service.resolveResourceLocation('res_1');
    expect(locRes.ok).toBe(false);
    expect(locRes.message).toContain('configure');
  });

  it('getGraph 透传 SDK admin.graph（nodes/edges 原样返回）', async () => {
    const client = makeMockClient();
    client.admin.graph.mockResolvedValue({
      nodes: [{ id: 'res_1', label: 'A' }],
      edges: [{ id: 1, from: 'res_1', to: 'res_2', type: 'reference' }],
    });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.getGraph({ limit: 50 });
    expect(res).toEqual({
      ok: true,
      graph: {
        nodes: [{ id: 'res_1', label: 'A' }],
        edges: [{ id: 1, from: 'res_1', to: 'res_2', type: 'reference' }],
      },
    });
    expect(client.admin.graph).toHaveBeenCalledWith({ limit: 50 });
  });

  it('未配置时 getGraph 报错提示先 configure', async () => {
    const service = new LoCoreService({});
    const res = await service.getGraph();
    expect(res.ok).toBe(false);
    expect(res.message).toContain('configure');
  });

  describe('revealResource（A：系统资源管理器定位）', () => {
    function makeShell() {
      return { showItemInFolder: jest.fn() };
    }

    test('resolved → 调用 shell.showItemInFolder(absolutePath)', async () => {
      const shell = makeShell();
      const client = makeMockClient();
      client.repository.resolveLocation.mockResolvedValue({
        kind: 'local',
        resolved: true,
        absolutePath: '/tmp/lo-demo/resources/a.md',
      });
      const service = new LoCoreService({ LoClient: class {}, shell });
      service.client = client;

      const res = await service.revealResource('res_1');
      expect(res).toEqual({ ok: true });
      expect(shell.showItemInFolder).toHaveBeenCalledWith('/tmp/lo-demo/resources/a.md');
      expect(client.repository.resolveLocation).toHaveBeenCalledWith('res_1');
    });

    test('virtual（resolved 但无路径）→ ok:false + reason=virtual，不调 shell', async () => {
      const shell = makeShell();
      const client = makeMockClient();
      client.repository.resolveLocation.mockResolvedValue({
        kind: 'virtual',
        resolved: true,
        absolutePath: null,
      });
      const service = new LoCoreService({ LoClient: class {}, shell });
      service.client = client;

      const res = await service.revealResource('res_v');
      expect(res).toEqual({ ok: false, reason: 'virtual', message: expect.any(String) });
      expect(shell.showItemInFolder).not.toHaveBeenCalled();
    });

    test('unresolved（file-missing）→ ok:false + reason 透传，不调 shell', async () => {
      const shell = makeShell();
      const client = makeMockClient();
      client.repository.resolveLocation.mockResolvedValue({
        kind: 'local',
        resolved: false,
        reason: 'file-missing',
        absolutePath: null,
      });
      const service = new LoCoreService({ LoClient: class {}, shell });
      service.client = client;

      const res = await service.revealResource('res_1');
      expect(res).toEqual({ ok: false, reason: 'file-missing', message: expect.any(String) });
      expect(shell.showItemInFolder).not.toHaveBeenCalled();
    });

    test('external-unavailable → ok:false + reason 透传，不调 shell', async () => {
      const shell = makeShell();
      const client = makeMockClient();
      client.repository.resolveLocation.mockResolvedValue({
        kind: 'external',
        resolved: false,
        reason: 'external-unavailable',
        absolutePath: null,
      });
      const service = new LoCoreService({ LoClient: class {}, shell });
      service.client = client;

      const res = await service.revealResource('res_e');
      expect(res).toEqual({ ok: false, reason: 'external-unavailable', message: expect.any(String) });
      expect(shell.showItemInFolder).not.toHaveBeenCalled();
    });

    test('未配置 → 报错提示先 configure，不调 shell', async () => {
      const shell = makeShell();
      const service = new LoCoreService({ shell });
      const res = await service.revealResource('res_1');
      expect(res.ok).toBe(false);
      expect(res.message).toContain('configure');
      expect(shell.showItemInFolder).not.toHaveBeenCalled();
    });
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

  it('getResourceBinary 经 client.resources.binary 获取明文 base64（不本地读盘）', async () => {
    const client = makeMockClient();
    client.resources.binary.mockResolvedValue({
      rid: 'res_1',
      mime: 'image/png',
      buffer: 'aGVsbG8=',
      size: 5,
    });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.getResourceBinary('res_1');
    expect(res).toEqual({
      ok: true,
      data: { rid: 'res_1', mime: 'image/png', buffer: 'aGVsbG8=', size: 5 },
    });
    expect(client.resources.binary).toHaveBeenCalledWith('res_1');
    expect(client.repository.resolveLocation).not.toHaveBeenCalled();
    expect(client.notes.get).not.toHaveBeenCalled();
  });

  it('未配置时 getResourceBinary 报错提示先 configure', async () => {
    const service = new LoCoreService({});
    const res = await service.getResourceBinary('res_1');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('configure');
  });

  it('getResourceBinary 业务错误映射为 api', async () => {
    const { LoApiError } = require('@lo/client');
    const client = makeMockClient();
    client.resources.binary.mockRejectedValue(new LoApiError('not found', { status: 404 }));
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.getResourceBinary('res_1');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('api');
    expect(res.status).toBe(404);
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

  it('createNote 走 client.notes.create 并返回新建资源', async () => {
    const client = makeMockClient();
    client.notes.create.mockResolvedValue({ rid: 'r_new', type: 'note' });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.createNote({ content: '', title: '未命名笔记' });
    expect(res.ok).toBe(true);
    expect(res.data.rid).toBe('r_new');
    expect(client.notes.create).toHaveBeenCalledWith({ content: '', title: '未命名笔记' });
  });

  it('removeNote 经 resource.delete operation 执行', async () => {
    const client = makeMockClient();
    client.operations.execute.mockResolvedValue({
      operationId: 'op_del',
      result: { rid: 'r1', deleted: true },
    });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.removeNote('r1');
    expect(res.ok).toBe(true);
    expect(res.operationId).toBe('op_del');
    expect(client.operations.execute).toHaveBeenCalledWith('resource.delete', { rid: 'r1' }, {});
  });

  it('uploadNotes 走 client.notes.upload 透传文件与参数', async () => {
    const client = makeMockClient();
    client.notes.upload.mockResolvedValue({ uploaded: 2, data: [] });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const files = [{ name: 'a.md', data: Buffer.from('x') }];
    const res = await service.uploadNotes(files, { title: 't' });
    expect(res.ok).toBe(true);
    expect(res.data.uploaded).toBe(2);
    expect(client.notes.upload).toHaveBeenCalledWith(files, { title: 't' });
  });

  it('createNote/removeNote/uploadNotes 业务错误映射为 api', async () => {
    const { LoApiError } = require('@lo/client');
    const client = makeMockClient();
    client.notes.create.mockRejectedValue(new LoApiError('missing title', { status: 400 }));
    client.operations.execute.mockRejectedValue(new LoApiError('not found', { status: 404 }));
    client.notes.upload.mockRejectedValue(new LoApiError('bad multipart', { status: 400 }));
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const createRes = await service.createNote({});
    expect(createRes.ok).toBe(false);
    expect(createRes.status).toBe(400);
    const removeRes = await service.removeNote('r1');
    expect(removeRes.ok).toBe(false);
    expect(removeRes.status).toBe(404);
    const uploadRes = await service.uploadNotes([{ name: 'x', data: Buffer.from('') }]);
    expect(uploadRes.ok).toBe(false);
    expect(uploadRes.status).toBe(400);
  });

  it('listViews 返回视图列表', async () => {
    const client = makeMockClient();
    client.views.list.mockResolvedValue({ total: 1, data: [{ id: 'v1', name: 'V1' }] });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.listViews({ status: 'active' });
    expect(res.ok).toBe(true);
    expect(res.total).toBe(1);
    expect(res.data[0].id).toBe('v1');
    expect(client.views.list).toHaveBeenCalledWith({ status: 'active' });
  });

  it('getView 返回视图定义', async () => {
    const client = makeMockClient();
    client.views.get.mockResolvedValue({ id: 'v1', query: { conditions: [] } });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.getView('v1');
    expect(res.ok).toBe(true);
    expect(res.data.id).toBe('v1');
    expect(client.views.get).toHaveBeenCalledWith('v1');
  });

  it('runView 原样透传结构化结果', async () => {
    const client = makeMockClient();
    client.views.run.mockResolvedValue({
      presentation: { type: 'table' },
      columns: [{ name: 'title' }],
      rows: [{ rid: 'r1', title: 'T' }],
      total: 1,
    });
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const res = await service.runView('v1', { limit: 50 });
    expect(res.ok).toBe(true);
    expect(res.data.presentation.type).toBe('table');
    expect(res.data.rows[0].rid).toBe('r1');
    expect(client.views.run).toHaveBeenCalledWith('v1', { limit: 50 });
  });

  it('views 业务错误映射为 api', async () => {
    const { LoApiError } = require('@lo/client');
    const client = makeMockClient();
    client.views.list.mockRejectedValue(new LoApiError('bad', { status: 500 }));
    client.views.run.mockRejectedValue(new LoApiError('not found', { status: 404 }));
    const service = new LoCoreService({ LoClient: class {} });
    service.client = client;
    const listRes = await service.listViews();
    expect(listRes.ok).toBe(false);
    expect(listRes.status).toBe(500);
    const runRes = await service.runView('missing');
    expect(runRes.ok).toBe(false);
    expect(runRes.status).toBe(404);
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

    describe('search（编辑器 [[ 补全数据源）', () => {
    it('search(q) 透传 client.search.search(q)', async () => {
      const client = makeMockClient();
      client.search.search.mockResolvedValue({
        query: 'J',
        total: 2,
        data: [{ rid: 'res_1', name: 'JavaScript 笔记' }],
      });
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;
      const res = await service.search('J');
      expect(client.search.search).toHaveBeenCalledWith('J');
      expect(res.ok).toBe(true);
      expect(res.total).toBe(2);
      expect(res.data[0].name).toBe('JavaScript 笔记');
    });

    it('未配置时报错', async () => {
      const service = new LoCoreService({});
      const res = await service.search('J');
      expect(res.ok).toBe(false);
      expect(res.message).toContain('configure');
    });
  });

  describe('Usage Mode/Viewer（U1）', () => {    it('getModes 透传 client.modes.list', async () => {
      const client = makeMockClient();
      client.modes.list.mockResolvedValue({
        modes: [{ modeId: 'editing' }, { modeId: 'reading' }],
      });
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;
      const res = await service.getModes();
      expect(res.ok).toBe(true);
      expect(res.modes.map((m) => m.modeId)).toEqual(['editing', 'reading']);
    });

    it('resolveModes 透传 client.modes.resolve(rid)', async () => {
      const client = makeMockClient();
      client.modes.resolve.mockResolvedValue({
        resource: 'res_1',
        modes: [{ modeId: 'editing' }],
      });
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;
      const res = await service.resolveModes('res_1');
      expect(client.modes.resolve).toHaveBeenCalledWith('res_1');
      expect(res.resource).toBe('res_1');
      expect(res.modes[0].modeId).toBe('editing');
    });

    it('getViewers 无 modeId → client.viewers.list；有 modeId → resolve', async () => {
      const client = makeMockClient();
      client.viewers.list.mockResolvedValue({ viewers: [{ viewerId: 'viewer.generic-preview' }] });
      client.viewers.resolve.mockResolvedValue({
        viewers: [{ viewerId: 'viewer.markdown-editor' }],
      });
      const service = new LoCoreService({ LoClient: class {} });
      service.client = client;

      const all = await service.getViewers();
      expect(client.viewers.list).toHaveBeenCalled();
      expect(all.viewers[0].viewerId).toBe('viewer.generic-preview');

      const byMode = await service.getViewers('editing');
      expect(client.viewers.resolve).toHaveBeenCalledWith('editing');
      expect(byMode.viewers[0].viewerId).toBe('viewer.markdown-editor');
    });

    it('未配置时报错', async () => {
      const service = new LoCoreService({});
      const res = await service.getModes();
      expect(res.ok).toBe(false);
      expect(res.message).toContain('configure');
    });
  describe('loadLayout / saveLayout（P0：布局持久化）', () => {
    it('loadLayout：config 无 layout 时返回 null', () => {
      const service = new LoCoreService({ loadConfig: () => ({ host: 'h' }) });
      expect(service.loadLayout()).toEqual({ ok: true, layout: null });
    });

    it('loadLayout：返回 config.layout', () => {
      const layout = { version: 1, sidebar: { visible: false, size: 300 } };
      const service = new LoCoreService({ loadConfig: () => ({ host: 'h', layout }) });
      expect(service.loadLayout().layout).toEqual(layout);
    });

    it('saveLayout：合并写入 config 且不丢其他字段', () => {
      let saved = null;
      const service = new LoCoreService({
        loadConfig: () => ({ host: 'h', port: 8765 }),
        saveConfig: (cfg) => {
          saved = cfg;
        },
      });
      const layout = { version: 1, sidebar: { visible: true, size: 220 }, panels: {} };
      const res = service.saveLayout(layout);
      expect(res.ok).toBe(true);
      expect(saved.host).toBe('h');
      expect(saved.layout).toEqual(layout);
    });
  });

  });
});
