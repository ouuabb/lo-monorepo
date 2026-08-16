const { registerLoCoreIpc, CHANNELS } = require('../../src/main/ipc.cjs');

function makeService() {
  return {
    load: jest.fn(() => ({ host: 'h' })),
    configure: jest.fn((cfg) => ({ ok: true, config: cfg })),
    login: jest.fn(async (p) => ({ ok: true, token: 't' })),
    getStatus: jest.fn(async () => ({ ok: true, stats: {} })),
    listNotes: jest.fn(async (q) => ({ ok: true, data: [] })),
    getNote: jest.fn(async (rid) => ({ ok: true, data: { rid } })),
    createNote: jest.fn(async (body) => ({ ok: true, data: { rid: 'r_new' } })),
    updateNote: jest.fn(async (rid, body) => ({ ok: true, data: { rid, updated: body } })),
    removeNote: jest.fn(async (rid) => ({ ok: true, data: { rid, deleted: true } })),
    uploadNotes: jest.fn(async (files, opts) => ({ ok: true, data: { uploaded: 1 } })),
    logout: jest.fn(() => ({ ok: true })),
    subscribeEvents: jest.fn(() => ({ ok: true })),
    unsubscribeEvents: jest.fn(() => ({ ok: true })),
        loadLayout: jest.fn(() => ({ ok: true, layout: null })),
    saveLayout: jest.fn((layout) => ({ ok: true, layout })),
    listOperations: jest.fn(async (q) => ({ ok: true, data: [] })),
    undoOperation: jest.fn(async (id) => ({ ok: true, data: { operationId: id } })),
    listViews: jest.fn(async (q) => ({ ok: true, data: [] })),
    getView: jest.fn(async (id) => ({ ok: true, data: { id } })),
    runView: jest.fn(async (id, body) => ({ ok: true, data: { presentation: { type: 'list' } } })),
    getRelations: jest.fn(async (rid) => ({ ok: true, data: { outgoing: [], incoming: [] } })),
    getRepositoryInfo: jest.fn(async () => ({ ok: true, info: { repositoryId: 'repo_uuid', path: '/tmp/lo-demo' } })),
    resolveResourceLocation: jest.fn(async (rid) => ({ ok: true, resolved: { kind: 'local', resolved: true, absolutePath: '/tmp/lo-demo/resources/a.md' } })),
    revealResource: jest.fn(async (rid) => ({ ok: true })),
    getGraph: jest.fn(async (query) => ({ ok: true, graph: { nodes: [], edges: [] } })),
    getModes: jest.fn(async () => ({ ok: true, modes: [{ modeId: 'editing' }] })),
    resolveModes: jest.fn(async (rid) => ({ ok: true, resource: rid, modes: [{ modeId: 'editing' }] })),
    getViewers: jest.fn(async (modeId) => ({ ok: true, viewers: [{ viewerId: 'viewer.generic-preview' }] })),
    search: jest.fn(async (q) => ({ ok: true, query: q, total: 0, data: [] })),
  };
}

describe('registerLoCoreIpc', () => {
  it('为每个通道注册 handle', () => {
    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);

    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.CONFIG, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.CONFIGURE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.LOGIN, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.STATUS, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.LIST_NOTES, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.GET_NOTE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.CREATE_NOTE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.UPDATE_NOTE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.REMOVE_NOTE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.UPLOAD_NOTES, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.LOGOUT, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.EVENTS_SUBSCRIBE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.EVENTS_UNSUBSCRIBE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.OPERATIONS, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.OPERATION_UNDO, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.RELATIONS, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.VIEWS_LIST, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.VIEWS_GET, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.VIEWS_RUN, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.REPOSITORY_INFO, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.RESOURCE_LOCATION, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.REVEAL_RESOURCE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.GRAPH, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.MODES_LIST, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.MODES_RESOLVE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.VIEWERS_LIST, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.SEARCH, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.LAYOUT_LOAD, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.LAYOUT_SAVE, expect.any(Function));
    expect(ipcMain.handle.mock.calls.length).toBe(29);
  });

  it('Repository 通道委托 service（info / resolveLocation）', async () => {
    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);
    const byChannel = (ch) => ipcMain.handle.mock.calls.find(([c]) => c === ch)[1];

    const info = await byChannel(CHANNELS.REPOSITORY_INFO)();
    expect(service.getRepositoryInfo).toHaveBeenCalled();
    expect(info.info.repositoryId).toBe('repo_uuid');

    const loc = await byChannel(CHANNELS.RESOURCE_LOCATION)({}, 'res_1');
    expect(service.resolveResourceLocation).toHaveBeenCalledWith('res_1');
    expect(loc.resolved.absolutePath).toBe('/tmp/lo-demo/resources/a.md');
  });

  it('Reveal 通道只透传 rid 并委托 service', async () => {
    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);
    const byChannel = (ch) => ipcMain.handle.mock.calls.find(([c]) => c === ch)[1];

    const res = await byChannel(CHANNELS.REVEAL_RESOURCE)({}, 'res_9');
    expect(service.revealResource).toHaveBeenCalledWith('res_9');
    expect(service.revealResource).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: true });
  });

  it('Graph 通道透传 query 并委托 service', async () => {
    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);
    const byChannel = (ch) => ipcMain.handle.mock.calls.find(([c]) => c === ch)[1];

    const res = await byChannel(CHANNELS.GRAPH)({}, { limit: 50 });
    expect(service.getGraph).toHaveBeenCalledWith({ limit: 50 });
    expect(res.graph).toEqual({ nodes: [], edges: [] });
  });

  it('SEARCH 通道透传查询词并委托 service', async () => {
    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);
    const byChannel = (ch) => ipcMain.handle.mock.calls.find(([c]) => c === ch)[1];

    const res = await byChannel(CHANNELS.SEARCH)({}, 'J');
    expect(service.search).toHaveBeenCalledWith('J');
    expect(res.ok).toBe(true);
    expect(res.query).toBe('J');
  });

  it('Mode/Viewer 通道委托 service', async () => {    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);
    const byChannel = (ch) => ipcMain.handle.mock.calls.find(([c]) => c === ch)[1];

    const modes = await byChannel(CHANNELS.MODES_LIST)();
    expect(service.getModes).toHaveBeenCalled();
    expect(modes.modes[0].modeId).toBe('editing');

    const resolved = await byChannel(CHANNELS.MODES_RESOLVE)({}, 'res_1');
    expect(service.resolveModes).toHaveBeenCalledWith('res_1');
    expect(resolved.resource).toBe('res_1');

    const viewers = await byChannel(CHANNELS.VIEWERS_LIST)({}, 'reading');
    expect(service.getViewers).toHaveBeenCalledWith('reading');
    expect(viewers.viewers[0].viewerId).toBe('viewer.generic-preview');

    const allViewers = await byChannel(CHANNELS.VIEWERS_LIST)({}, undefined);
    expect(service.getViewers).toHaveBeenCalledWith(null);
    expect(allViewers.viewers).toHaveLength(1);
  });

  it('handler 委托并传参', async () => {
    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);

    const byChannel = (ch) => ipcMain.handle.mock.calls.find(([c]) => c === ch)[1];

    expect(await byChannel(CHANNELS.CONFIG)()).toEqual({ host: 'h' });
    expect(await byChannel(CHANNELS.CONFIGURE)({}, { port: 1 })).toEqual({
      ok: true,
      config: { port: 1 },
    });
    expect(service.configure).toHaveBeenCalledWith({ port: 1 });

    await byChannel(CHANNELS.LOGIN)({}, { privateKeyPath: '/k' });
    expect(service.login).toHaveBeenCalledWith({ privateKeyPath: '/k' });

    await byChannel(CHANNELS.STATUS)();
    expect(service.getStatus).toHaveBeenCalled();

    await byChannel(CHANNELS.LIST_NOTES)({}, { limit: 5 });
    expect(service.listNotes).toHaveBeenCalledWith({ limit: 5 });

    await byChannel(CHANNELS.CONFIGURE)({}, undefined);
    expect(service.configure).toHaveBeenCalledWith({});

    await byChannel(CHANNELS.LOGIN)({}, undefined);
    expect(service.login).toHaveBeenCalledWith({});

    await byChannel(CHANNELS.LIST_NOTES)({}, undefined);
    expect(service.listNotes).toHaveBeenCalledWith({});

    await byChannel(CHANNELS.GET_NOTE)({}, 'res_1');
    expect(service.getNote).toHaveBeenCalledWith('res_1');

    await byChannel(CHANNELS.CREATE_NOTE)({}, { title: '新笔记' });
    expect(service.createNote).toHaveBeenCalledWith({ title: '新笔记' });

    await byChannel(CHANNELS.CREATE_NOTE)({}, undefined);
    expect(service.createNote).toHaveBeenCalledWith({});

    await byChannel(CHANNELS.UPDATE_NOTE)({}, 'res_1', { content: 'x' });
    expect(service.updateNote).toHaveBeenCalledWith('res_1', { content: 'x' });

    await byChannel(CHANNELS.UPDATE_NOTE)({}, 'res_1', undefined);
    expect(service.updateNote).toHaveBeenCalledWith('res_1', {});

    await byChannel(CHANNELS.REMOVE_NOTE)({}, 'res_1');
    expect(service.removeNote).toHaveBeenCalledWith('res_1');

    await byChannel(CHANNELS.UPLOAD_NOTES)({}, [{ name: 'a.md', data: new Uint8Array([1]) }], {
      title: 't',
    });
    expect(service.uploadNotes).toHaveBeenCalledWith(
      [{ name: 'a.md', data: new Uint8Array([1]) }],
      { title: 't' },
    );

    await byChannel(CHANNELS.UPLOAD_NOTES)({}, undefined, undefined);
    expect(service.uploadNotes).toHaveBeenCalledWith([], {});

    await byChannel(CHANNELS.LOGOUT)();
    expect(service.logout).toHaveBeenCalled();

    await byChannel(CHANNELS.OPERATIONS)({}, { limit: 10 });
    expect(service.listOperations).toHaveBeenCalledWith({ limit: 10 });

    await byChannel(CHANNELS.OPERATIONS)({}, undefined);
    expect(service.listOperations).toHaveBeenCalledWith({});

    await byChannel(CHANNELS.OPERATION_UNDO)({}, 'op_1');
    expect(service.undoOperation).toHaveBeenCalledWith('op_1');

    await byChannel(CHANNELS.RELATIONS)({}, 'res_1');
    expect(service.getRelations).toHaveBeenCalledWith('res_1');

    await byChannel(CHANNELS.VIEWS_LIST)({}, { status: 'active' });
    expect(service.listViews).toHaveBeenCalledWith({ status: 'active' });

    await byChannel(CHANNELS.VIEWS_LIST)({}, undefined);
    expect(service.listViews).toHaveBeenCalledWith({});

    await byChannel(CHANNELS.VIEWS_GET)({}, 'v1');
    expect(service.getView).toHaveBeenCalledWith('v1');

    await byChannel(CHANNELS.VIEWS_RUN)({}, 'v1', { limit: 50 });
    expect(service.runView).toHaveBeenCalledWith('v1', { limit: 50 });

    await byChannel(CHANNELS.VIEWS_RUN)({}, 'v1', undefined);
    expect(service.runView).toHaveBeenCalledWith('v1', {});
  });

  it('事件订阅通道委托 service 并在事件到达时推送 EVENTS_PUSH', async () => {
    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);

    const byChannel = (ch) => ipcMain.handle.mock.calls.find(([c]) => c === ch)[1];
    const sender = { isDestroyed: jest.fn(() => false), send: jest.fn() };
    const event = { sender };

    // 订阅：捕获 service.subscribeEvents 的 handler
    let capturedHandler = null;
    service.subscribeEvents.mockImplementation((types, handler) => {
      capturedHandler = handler;
      return { ok: true };
    });

    const res = await byChannel(CHANNELS.EVENTS_SUBSCRIBE)(event, ['resource.created']);
    expect(res).toEqual({ ok: true });
    expect(service.subscribeEvents).toHaveBeenCalledWith(['resource.created'], expect.any(Function));

    // 触发 handler → 推送 EVENTS_PUSH
    const ev = { event: 'resource.created', data: { rid: 'r1' } };
    capturedHandler(ev);
    expect(sender.send).toHaveBeenCalledWith('lo-core:event', ev);
  });

  it('事件订阅 handler 在窗口销毁后不推送', async () => {
    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);

    const byChannel = (ch) => ipcMain.handle.mock.calls.find(([c]) => c === ch)[1];
    const sender = { isDestroyed: jest.fn(() => true), send: jest.fn() };
    const event = { sender };

    let capturedHandler = null;
    service.subscribeEvents.mockImplementation((types, handler) => {
      capturedHandler = handler;
      return { ok: true };
    });

    await byChannel(CHANNELS.EVENTS_SUBSCRIBE)(event, []);
    capturedHandler({ event: 'resource.deleted', data: {} });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('事件退订通道委托 service.unsubscribeEvents', async () => {
    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);

    const byChannel = (ch) => ipcMain.handle.mock.calls.find(([c]) => c === ch)[1];
    await byChannel(CHANNELS.EVENTS_UNSUBSCRIBE)();
    expect(service.unsubscribeEvents).toHaveBeenCalled();
  });

  it('布局通道 load 委托 service.loadLayout', async () => {
    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);

    const byChannel = (ch) => ipcMain.handle.mock.calls.find(([c]) => c === ch)[1];
    const res = await byChannel(CHANNELS.LAYOUT_LOAD)();
    expect(service.loadLayout).toHaveBeenCalled();
    expect(res).toEqual({ ok: true, layout: null });
  });

  it('布局通道 save 委托 service.saveLayout（空参给默认对象）', async () => {
    const ipcMain = { handle: jest.fn() };
    const service = makeService();
    registerLoCoreIpc(ipcMain, service);

    const byChannel = (ch) => ipcMain.handle.mock.calls.find(([c]) => c === ch)[1];
    const layout = { version: 1, sidebar: { visible: true, size: 220 }, panels: {} };
    const res = await byChannel(CHANNELS.LAYOUT_SAVE)({}, layout);
    expect(service.saveLayout).toHaveBeenCalledWith(layout);
    expect(res.ok).toBe(true);

    await byChannel(CHANNELS.LAYOUT_SAVE)({}, undefined);
    expect(service.saveLayout).toHaveBeenLastCalledWith({});
  });
});
