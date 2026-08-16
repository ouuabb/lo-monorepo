const { LoClient, LoApiError, LoHttpError } = require('../src/index.cjs');
const http = require('../src/http.cjs');
const httpServer = require('http');

/** 构造注入 mock transport 的 client */
function makeClient(handler, opts = {}) {
  const calls = [];
  const client = new LoClient({
    host: '127.0.0.1',
    port: 8765,
    transport: ({ method, url, requestOpts }) => {
      calls.push({ method, url, requestOpts });
      return handler(method, url, requestOpts);
    },
    ...opts,
  });
  return { client, calls };
}

/** 预置认证 token(绕过 SSH) */
function fakeAuthed(client) {
  client.auth._token = 'tok_123';
  client.auth._fingerprint = 'SHA256:abc';
}

describe('http.cjs buildQuery', () => {
  it('拼接查询参数', () => {
    expect(http.buildQuery({ a: 1, b: 'x y' })).toBe('?a=1&b=x%20y');
  });
  it('跳过 undefined/null', () => {
    expect(http.buildQuery({ a: undefined, b: null, c: 1 })).toBe('?c=1');
  });
  it('空参数返回空串', () => {
    expect(http.buildQuery({})).toBe('');
    expect(http.buildQuery()).toBe('');
  });
  it('数组参数展开为多个', () => {
    expect(http.buildQuery({ tag: ['a', 'b'] })).toBe('?tag=a&tag=b');
  });
});

describe('LoClient 基础', () => {
  it('baseUrl 默认 127.0.0.1:8765', () => {
    const { client } = makeClient({});
    expect(client.baseUrl).toBe('http://127.0.0.1:8765');
  });

  it('支持自定义 protocol/端口', () => {
    const c = new LoClient({
      protocol: 'https',
      host: '127.0.0.1',
      port: 9999,
      transport: () => Promise.resolve({ status: 200, body: {}, headers: {} }),
    });
    expect(c.baseUrl).toBe('https://127.0.0.1:9999');
  });

  it('GET 携带 token', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { ok: 1 }, headers: {} }),
    );
    fakeAuthed(client);
    const res = await client.health.ping();
    expect(res.ok).toBe(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/health');
    expect(calls[0].requestOpts.headers.Authorization).toBe('Bearer tok_123');
  });

  it('repository.info() 返回 Core 仓库信息(不自行拼接路径)', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({
        status: 200,
        body: { repositoryId: 'rid_abc', path: '/tmp/lo-demo' },
        headers: {},
      }),
    );
    fakeAuthed(client);
    const info = await client.repository.info();
    expect(info).toEqual({ repositoryId: 'rid_abc', path: '/tmp/lo-demo' });
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/repository');
  });

  it('repository.resolveLocation(rid) 透传 Core Resolver 三态', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({
        status: 200,
        body: { kind: 'local', resolved: true, absolutePath: '/tmp/lo-demo/resources/a.md' },
        headers: {},
      }),
    );
    fakeAuthed(client);
    const loc = await client.repository.resolveLocation('res_1');
    expect(loc).toEqual({
      kind: 'local',
      resolved: true,
      absolutePath: '/tmp/lo-demo/resources/a.md',
    });
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/resources/res_1/location');
  });

  it('GET 带 query 并 encode', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.search.search('hello world');
    expect(calls[0].url).toContain('/api/search?q=hello%20world');
  });

  it('POST json body', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.notes.create({ name: 'hi' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/notes');
    expect(calls[0].requestOpts.body).toEqual({ name: 'hi' });
  });

  it('PUT 与 DELETE', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.notes.update('res_a', { content: 'v2' });
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toContain('/api/notes/res_a');
    await client.notes.remove('res_a', { hard: true });
    expect(calls[1].method).toBe('DELETE');
    expect(calls[1].url).toContain('?hard=true');
  });

  it('未认证时不带 token,不抛错', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    await client.health.ping();
    expect(calls[0].requestOpts.headers.Authorization).toBeUndefined();
  });

  it('default transport 走真实 http(不注入 transport)', async () => {
    const server = httpServer.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ alive: true }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const client = new LoClient({
        host: '127.0.0.1',
        port,
        protocol: 'http',
      });
      const res = await client.get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ alive: true });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('validateStatus:false 不抛错直接返回原始响应', async () => {
    const { client, calls } = makeClient(
      () => Promise.resolve({ status: 500, body: { error: 'boom' }, headers: {} }),
      { validateStatus: false },
    );
    const res = await client.get('/api/x');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('boom');
    expect(calls).toHaveLength(1);
  });

  it('setAdminToken 后 admin 请求带 Admin header', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    client.setAdminToken('adm_2');
    await client.admin.stats();
    expect(calls[0].requestOpts.headers.Authorization).toBe('Bearer adm_2');
  });

  it('内部 _token 兜底注入(未认证时)', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    client._token = 'legacy_tok';
    await client.notes.list();
    expect(calls[0].requestOpts.headers.Authorization).toBe('Bearer legacy_tok');
  });

  it('login/logout 委托给 auth', async () => {
    const { client } = makeClient((method, url) =>
      Promise.resolve({
        status: 200,
        body: url.includes('/api/auth/login') ? { token: 'tok_l', fingerprint: 'f' } : {},
        headers: {},
      }),
    );
    // login 需要 signature/nonce 提供则直接走 request,否则 challenge
    // 这里直接验证委托:签名+指纹模式
    await client.login({ nonce: 'n', signature: 's', fingerprint: 'f' });
    expect(client.auth.authenticated).toBe(true);
    client.logout();
    expect(client.auth.authenticated).toBe(false);
  });

  it('无参构造使用默认配置', () => {
    const client = new LoClient();
    expect(client.baseUrl).toBe('http://127.0.0.1:8765');
  });
});

describe('错误 message 分支', () => {
  it('body 为空/null/非对象/无 error 时用 HTTP status', async () => {
    const cases = [
      { status: 404, headers: {} },
      { status: 404, body: 'not found text', headers: {} },
      { status: 502, body: { detail: 'x' }, headers: {} },
    ];
    for (const response of cases) {
      const { client } = makeClient(() => Promise.resolve(response));
      try {
        await client.notes.get('r');
        throw new Error('should throw');
      } catch (e) {
        expect(e.message).toContain(`HTTP ${response.status}`);
      }
    }
  });
});

describe('错误处理', () => {
  it('业务错误抛 LoApiError 并带 status', async () => {
    const { client } = makeClient(() =>
      Promise.resolve({
        status: 409,
        body: { error: 'already exists' },
        headers: {},
      }),
    );
    await expect(client.notes.create({})).rejects.toThrow(LoApiError);
    try {
      await client.notes.create({});
    } catch (e) {
      expect(e.status).toBe(409);
      expect(e.message).toContain('already exists');
    }
  });

  it('传输错误抛 LoHttpError', async () => {
    const handler = () => Promise.reject(new LoHttpError('连接失败', { code: 'ECONNREFUSED' }));
    const client = new LoClient({ transport: handler });
    await expect(client.health.ping()).rejects.toThrow(LoHttpError);
  });

  it('http 层 request/get/post/put/del 均可调用', () => {
    expect(typeof http.request).toBe('function');
    expect(typeof http.get).toBe('function');
    expect(typeof http.post).toBe('function');
    expect(typeof http.put).toBe('function');
    expect(typeof http.del).toBe('function');
  });
});

describe('端点覆盖', () => {
  it('notes list/get/create/update/remove', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.notes.list({ limit: 5 });
    await client.notes.get('res_1');
    await client.notes.create({ content: 'x' });
    await client.notes.update('res_1', { name: 't' });
    await client.notes.remove('res_1');
    expect(calls).toHaveLength(5);
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'POST', 'PUT', 'DELETE']);
  });

  it('search.schemas.views', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.search.search('q');
    await client.schemas.list();
    await client.schemas.attach('sch_1', 'res_1');
    await client.schemas.detach('sch_1', 'res_1');
    await client.views.create({ id: 'v1' });
    await client.views.run('v1');
    await client.views.export('v1');
    await client.views.importDef({ id: 'v2' });
    expect(calls).toHaveLength(8);
  });

  it('workflows/automations/evolution/sync', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.workflows.list();
    await client.workflows.transition('wf1', {
      resourceRid: 'r',
      targetState: 'done',
    });
    await client.workflows.instances({ wf: 'wf1' });
    await client.automations.list();
    await client.automations.run('auto_1', {});
    await client.evolution.status();
    await client.evolution.observe();
    await client.evolution.execute();
    await client.sync.sync();
    await client.sync.push({ remote: 'origin' });
    await client.sync.pull({ remote: 'origin' });
    expect(calls.length).toBeGreaterThanOrEqual(11);
  });

  it('admin endpoints incl. commit/status/tags/types/containers/categories', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.admin.stats();
    await client.admin.resources({ q: 'title' });
    await client.admin.createResource({ name: 'x.md', content: '#' });
    await client.admin.link('res_1', { target: 'res_2' });
    await client.admin.unlink('res_1', 'res_2');
    await client.admin.setTags('res_1', ['a']);
    await client.admin.removeTag('res_1', 'a');
    await client.admin.commit('msg');
    await client.admin.status();
    await client.admin.tagsList();
    await client.admin.renameTag('a', 'b');
    await client.admin.deleteTag('a');
    await client.admin.categories();
    await client.admin.renameCategory('c1', 'c2');
    await client.admin.deleteCategory('c1');
    await client.admin.types();
    await client.admin.renameType('t1', 't2');
    await client.admin.graph();
    await client.admin.graphPath({ from: 'a', to: 'b' });
    await client.admin.containers();
    await client.admin.getContainer('c1');
    await client.admin.containerScan('c1');
    await client.admin.containerPromote('c1', { memberPath: '/p' });
    await client.admin.containerDemote('c1', { memberPath: '/p' });
    await client.admin.containerSync('c1', { dryRun: true });
    await client.admin.containerSync('c1'); // 不传 body → body || {}
    await client.admin.containerDiff('c1');
    await client.admin.containerStats('c1');
    await client.admin.relations({ rid: 'r' });
    await client.admin.deleteRelation(42);
    await client.admin.audit({ limit: 10 });
    await client.admin.importFiles(['/tmp/a.md']);
    await client.admin.suggestions();
    await client.admin.acceptSuggestion('s1');
    await client.admin.rejectSuggestion('s1');
    await client.admin.executeSuggestion('s1');
    expect(calls.length).toBe(36);
  });

  it('admin 端点使用 adminToken', async () => {
    const { client, calls } = makeClient(
      () => Promise.resolve({ status: 200, body: {}, headers: {} }),
      { adminToken: 'admintok' },
    );
    await client.admin.stats();
    expect(calls[0].requestOpts.headers.Authorization).toBe('Bearer admintok');
  });

  it('schemas get/create/update/remove', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.schemas.get('s1');
    await client.schemas.create({ name: 'n' });
    await client.schemas.update('s1', { name: 'n2' });
    await client.schemas.remove('s1');
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST', 'PUT', 'DELETE']);
  });

  it('views get/update/remove', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.views.list({ q: 't' });
    await client.views.get('v1');
    await client.views.update('v1', {});
    await client.views.remove('v1');
    expect(calls).toHaveLength(4);
  });

  it('workflows get/create/update/remove/versions/attach/detach/resume/can/instance/history', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.workflows.get('wf1');
    await client.workflows.create({ name: 'wf' });
    await client.workflows.update('wf1', {});
    await client.workflows.remove('wf1', { force: true });
    await client.workflows.versions('wf1');
    await client.workflows.attach('wf1', { resourceRid: 'r' });
    await client.workflows.detach('wf1', { resourceRid: 'r' });
    await client.workflows.resume('wf1', {});
    await client.workflows.canTransition('wf1', {});
    await client.workflows.instance('wf1');
    await client.workflows.history({ wf: 'wf1' });
    expect(calls).toHaveLength(11);
  });

  it('automations get/create/update/remove/enable/disable/history', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.automations.get('a1');
    await client.automations.create({});
    await client.automations.update('a1', {});
    await client.automations.remove('a1');
    await client.automations.enable('a1');
    await client.automations.disable('a1');
    await client.automations.history({ auto: 'a1' });
    await client.automations.run('a1'); // 不传 body → body || {}
    expect(calls).toHaveLength(8);
    expect(calls[7].url).toContain('/api/automations/a1/run');
  });

  it('evolution 全量端点', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.evolution.status();
    await client.evolution.observe();
    await client.evolution.health();
    await client.evolution.detect();
    await client.evolution.plan();
    await client.evolution.execute();
    await client.evolution.history();
    await client.evolution.rollback();
    expect(calls).toHaveLength(8);
  });

  it('health 全量端点', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.health.ping();
    await client.health.stats();
    await client.health.tags();
    expect(calls).toHaveLength(3);
  });

  it('admin getResource/updateResource/deleteResource', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.admin.getResource('r1');
    await client.admin.updateResource('r1', { name: 'x' });
    await client.admin.deleteResource('r1', { hard: true });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'DELETE']);
    expect(calls[2].url).toContain('?hard=true');
  });
});

describe('relations namespace', () => {
  it('list 无参数 GET /api/relations', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { total: 0, data: [] }, headers: {} }),
    );
    fakeAuthed(client);
    await client.relations.list();
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/relations');
  });

  it('list 带 type/limit query', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.relations.list({ type: 'reference', limit: 5 });
    expect(calls[0].url).toContain('/api/relations?');
    expect(calls[0].url).toContain('type=reference');
    expect(calls[0].url).toContain('limit=5');
  });

  it('list 带 rid 返回 outgoing/incoming', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { outgoing: [], incoming: [] }, headers: {} }),
    );
    fakeAuthed(client);
    const res = await client.relations.list({ rid: 'res_1' });
    expect(res.outgoing).toEqual([]);
    expect(calls[0].url).toContain('rid=res_1');
  });

  it('get 编码 id', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { id: 7 }, headers: {} }),
    );
    fakeAuthed(client);
    const res = await client.relations.get(7);
    expect(res.id).toBe(7);
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/relations/7');
  });

  it('create 发 POST body {from,to,type,metadata}', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 201, body: { id: 1 }, headers: {} }),
    );
    fakeAuthed(client);
    const res = await client.relations.create('res_a', 'res_b', 'reference', { k: 1 });
    expect(res.id).toBe(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/relations');
    expect(calls[0].requestOpts.body).toEqual({
      from: 'res_a',
      to: 'res_b',
      type: 'reference',
      metadata: { k: 1 },
    });
  });

  it('create 默认 type 为 reference', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 201, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.relations.create('res_a', 'res_b');
    expect(calls[0].requestOpts.body.type).toBe('reference');
  });

  it('update 发 PUT 带 updates 包装', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { id: 3 }, headers: {} }),
    );
    fakeAuthed(client);
    await client.relations.update(3, { metadata: { x: 1 } });
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/relations/3');
    expect(calls[0].requestOpts.body).toEqual({ updates: { metadata: { x: 1 } } });
  });

  it('remove 发 DELETE', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { removed: true, id: 5 }, headers: {} }),
    );
    fakeAuthed(client);
    const res = await client.relations.remove(5);
    expect(res.removed).toBe(true);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/relations/5');
  });
});

describe('operations namespace', () => {
  it('execute 发 POST body {type,params,options}', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 201, body: { operationId: 'op_1', result: {} }, headers: {} }),
    );
    fakeAuthed(client);
    const res = await client.operations.execute('relation.create', { fromRid: 'a', toRid: 'b' });
    expect(res.operationId).toBe('op_1');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/operations');
    expect(calls[0].requestOpts.body).toEqual({
      type: 'relation.create',
      params: { fromRid: 'a', toRid: 'b' },
      options: {},
    });
  });

  it('execute 默认空 params/options', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 201, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.operations.execute('resource.create');
    expect(calls[0].requestOpts.body).toEqual({ type: 'resource.create', params: {}, options: {} });
  });

  it('execute 透传 options(actor)', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 201, body: {}, headers: {} }),
    );
    fakeAuthed(client);
    await client.operations.execute('relation.create', { a: 1 }, { actor: 'user_x' });
    expect(calls[0].requestOpts.body.options).toEqual({ actor: 'user_x' });
  });

  it('list 带 limit/type/status query', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { total: 0, data: [] }, headers: {} }),
    );
    fakeAuthed(client);
    await client.operations.list({ limit: 20, type: 'relation.create', status: 'success' });
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toContain('/api/operations?');
    expect(calls[0].url).toContain('limit=20');
    expect(calls[0].url).toContain('type=relation.create');
    expect(calls[0].url).toContain('status=success');
  });

  it('get 编码 operation id', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { operation_id: 'op_abc' }, headers: {} }),
    );
    fakeAuthed(client);
    await client.operations.get('op_abc');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/operations/op_abc');
  });

  it('undo 发 POST /:id/undo', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { undoOperationId: 'op_2' }, headers: {} }),
    );
    fakeAuthed(client);
    const res = await client.operations.undo('op_abc');
    expect(res.undoOperationId).toBe('op_2');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/operations/op_abc/undo');
  });

  it('beginTransaction 发 POST body', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 201, body: { transactionId: 'tx_1' }, headers: {} }),
    );
    fakeAuthed(client);
    const res = await client.operations.beginTransaction('__system__', 'batch', 'desc');
    expect(res.transactionId).toBe('tx_1');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/operations/transaction');
    expect(calls[0].requestOpts.body).toEqual({
      containerRid: '__system__',
      type: 'batch',
      description: 'desc',
    });
  });

  it('executeInTransaction 发 POST /tx/:id/execute', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { operationId: 'op_x' }, headers: {} }),
    );
    fakeAuthed(client);
    await client.operations.executeInTransaction('tx_1', 'resource.create', { type: 'note' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/operations/transaction/tx_1/execute');
    expect(calls[0].requestOpts.body).toEqual({
      type: 'resource.create',
      params: { type: 'note' },
      options: {},
    });
  });

  it('commit / rollback 发对应 POST', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { ok: true }, headers: {} }),
    );
    fakeAuthed(client);
    await client.operations.commit('tx_1');
    await client.operations.rollback('tx_1');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/operations/transaction/tx_1/commit');
    expect(calls[1].url).toBe('http://127.0.0.1:8765/api/operations/transaction/tx_1/rollback');
  });
});

describe('events namespace', () => {
  it('history 发 GET /api/events 带 query', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 200, body: { total: 1, data: [] }, headers: {} }),
    );
    fakeAuthed(client);
    const res = await client.events.history({ type: 'resource.created', limit: 10 });
    expect(res.total).toBe(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toContain('/api/events?');
    expect(calls[0].url).toContain('type=resource.created');
    expect(calls[0].url).toContain('limit=10');
  });

  it('subscribe 要求 handler 为函数', () => {
    const { client } = makeClient(() => Promise.resolve({ status: 200, body: {}, headers: {} }));
    expect(() => client.events.subscribe('resource.created', 'nope')).toThrow(/函数/);
  });

  it('subscribe 真实 SSE 流解析', async () => {
    const server = httpServer.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: resource.created\ndata: {"rid":"res_1"}\n\n');
      res.write('event: resource.updated\ndata: {"rid":"res_2"}\n\n');
      setTimeout(() => res.end(), 50);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    try {
      const client = new LoClient({ host: '127.0.0.1', port, validateStatus: false });
      const received = [];
      const sub = client.events.subscribe('resource.created', (ev) => received.push(ev));

      await new Promise((resolve) => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (received.length >= 2 || Date.now() - start > 3000) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
      });

      sub.close();
      expect(received.length).toBe(2);
      expect(received[0]).toEqual({ event: 'resource.created', data: { rid: 'res_1' } });
      expect(received[1]).toEqual({ event: 'resource.updated', data: { rid: 'res_2' } });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('subscribe 心跳注释行被忽略', async () => {
    const server = httpServer.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(': connected\n\n');
      res.write(': keep-alive\n\n');
      res.write('data: {"x":1}\n\n');
      setTimeout(() => res.end(), 50);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    try {
      const client = new LoClient({ host: '127.0.0.1', port, validateStatus: false });
      const received = [];
      const sub = client.events.subscribe('*', (ev) => received.push(ev));
      await new Promise((resolve) => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (received.length >= 1 || Date.now() - start > 3000) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
      });
      sub.close();
      expect(received.length).toBe(1);
      expect(received[0].data).toEqual({ x: 1 });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('subscribe 关闭连接后不再接收', async () => {
    const server = httpServer.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"n":1}\n\n');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    try {
      const client = new LoClient({ host: '127.0.0.1', port, validateStatus: false });
      const received = [];
      const sub = client.events.subscribe('*', (ev) => received.push(ev));
      await new Promise((resolve) => setTimeout(resolve, 100));
      sub.close();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(received.length).toBe(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('notes.upload（multipart 构造）', () => {
  /** 与 core serve.cjs parseMultipart 相同规则的解析（验证 SDK 构造兼容性） */
  function parseMultipart(body, boundary) {
    const fields = {};
    const files = [];
    const fullBoundary = Buffer.from(`--${boundary}`);
    let pos = body.indexOf(fullBoundary);
    while (pos !== -1) {
      let start = pos + fullBoundary.length;
      if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;
      const nextBoundary = body.indexOf(fullBoundary, start);
      if (nextBoundary === -1) break;
      let partEnd = nextBoundary - 2;
      if (!(body[partEnd] === 0x0d && body[partEnd + 1] === 0x0a)) partEnd = nextBoundary;
      const part = body.slice(start, partEnd);
      const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
      if (headerEnd === -1) {
        pos = nextBoundary;
        continue;
      }
      const headerText = part.slice(0, headerEnd).toString('utf-8');
      const data = part.slice(headerEnd + 4);
      const nameMatch = headerText.match(/name="([^"]+)"/);
      if (!nameMatch) {
        pos = nextBoundary;
        continue;
      }
      const filenameMatch = headerText.match(/filename="([^"]+)"/);
      const contentTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
      if (filenameMatch) {
        files.push({
          name: nameMatch[1],
          filename: decodeURIComponent(filenameMatch[1]),
          contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
          data,
        });
      } else {
        fields[nameMatch[1]] = data.toString('utf-8');
      }
      pos = nextBoundary;
    }
    return { fields, files };
  }

  it('构造 multipart 并可被 parseMultipart 规则完整还原', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 201, body: { uploaded: 2, data: [{ rid: 'r1' }, { rid: 'r2' }] }, headers: {} }),
    );
    fakeAuthed(client);
    const res = await client.notes.upload(
      [
        { name: 'a.md', data: Buffer.from('# 标题A'), contentType: 'text/markdown' },
        { name: 'b.txt', data: Buffer.from('hello') },
      ],
      { name: '导入测试', tags: ['t1', 't2'] },
    );
    expect(res.uploaded).toBe(2);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/notes/upload');
    const { requestOpts } = calls[0];
    expect(Buffer.isBuffer(requestOpts.body)).toBe(true);
    const boundary = requestOpts.headers['Content-Type'].match(/boundary=(.+)/)[1];
    expect(requestOpts.headers['Content-Type']).toContain('multipart/form-data');
    const parsed = parseMultipart(requestOpts.body, boundary);
    expect(parsed.fields.name).toBe('导入测试');
    expect(parsed.fields.tags).toBe('t1,t2');
    expect(parsed.files.length).toBe(2);
    expect(parsed.files[0].name).toBe('file');
    expect(parsed.files[0].filename).toBe('a.md');
    expect(parsed.files[0].contentType).toBe('text/markdown');
    expect(parsed.files[0].data.toString()).toBe('# 标题A');
    expect(parsed.files[1].filename).toBe('b.txt');
    expect(parsed.files[1].contentType).toBe('application/octet-stream');
    expect(parsed.files[1].data.toString()).toBe('hello');
  });

  it('文件名为空/含引号时安全转义', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 201, body: { uploaded: 1, data: [] }, headers: {} }),
    );
    fakeAuthed(client);
    await client.notes.upload([{ name: 'a"b.md', data: Buffer.from('x') }]);
    const { requestOpts } = calls[0];
    const boundary = requestOpts.headers['Content-Type'].match(/boundary=(.+)/)[1];
    const parsed = parseMultipart(requestOpts.body, boundary);
    expect(parsed.files[0].filename).toBe('a"b.md');
  });

  it('无文件时 body 仍为合法 multipart', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({ status: 201, body: { uploaded: 0, data: [] }, headers: {} }),
    );
    fakeAuthed(client);
    await client.notes.upload([], { name: 'x' });
    const { requestOpts } = calls[0];
    expect(requestOpts.body.toString()).toContain('--');
  });

  it('服务端错误转换为 LoApiError', async () => {
    const { client } = makeClient(() =>
      Promise.resolve({ status: 400, body: { error: '未找到上传的文件（field name 需为 "file"）' }, headers: {} }),
    );
    fakeAuthed(client);
    await expect(client.notes.upload([{ name: 'a.md', data: Buffer.from('x') }])).rejects.toThrow(
      LoApiError,
    );
  });

  describe('modes namespace', () => {
    it('list → GET /api/modes', async () => {
      const { client, calls } = makeClient(() =>
        Promise.resolve({ status: 200, body: { modes: [{ modeId: 'editing' }] }, headers: {} }),
      );
      fakeAuthed(client);
      const res = await client.modes.list();
      expect(res.modes[0].modeId).toBe('editing');
      expect(calls[0].method).toBe('GET');
      expect(calls[0].url).toBe('http://127.0.0.1:8765/api/modes');
    });

    it('resolve(rid) → GET /api/modes/:rid（rid 编码）', async () => {
      const { client, calls } = makeClient(() =>
        Promise.resolve({ status: 200, body: { resource: 'res_1', modes: [] }, headers: {} }),
      );
      fakeAuthed(client);
      const res = await client.modes.resolve('res_1');
      expect(res.resource).toBe('res_1');
      expect(calls[0].url).toBe('http://127.0.0.1:8765/api/modes/res_1');
    });
  });

  describe('viewers namespace', () => {
    it('list() → GET /api/viewers（无 query）', async () => {
      const { client, calls } = makeClient(() =>
        Promise.resolve({ status: 200, body: { viewers: [] }, headers: {} }),
      );
      fakeAuthed(client);
      await client.viewers.list();
      expect(calls[0].method).toBe('GET');
      expect(calls[0].url).toBe('http://127.0.0.1:8765/api/viewers');
    });

    it('resolve(modeId) → GET /api/viewers?mode=:id', async () => {
      const { client, calls } = makeClient(() =>
        Promise.resolve({ status: 200, body: { viewers: [] }, headers: {} }),
      );
      fakeAuthed(client);
      await client.viewers.resolve('reading');
      expect(calls[0].url).toContain('/api/viewers?');
      expect(calls[0].url).toContain('mode=reading');
    });
  });
});
