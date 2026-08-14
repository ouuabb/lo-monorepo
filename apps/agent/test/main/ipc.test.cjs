const { registerLoCoreIpc, CHANNELS } = require('../../src/main/ipc.cjs');

function makeService() {
  return {
    load: jest.fn(() => ({ host: 'h' })),
    configure: jest.fn((cfg) => ({ ok: true, config: cfg })),
    login: jest.fn(async (p) => ({ ok: true, token: 't' })),
    getStatus: jest.fn(async () => ({ ok: true, stats: {} })),
    listNotes: jest.fn(async (q) => ({ ok: true, data: [] })),
    getNote: jest.fn(async (rid) => ({ ok: true, data: { rid } })),
    updateNote: jest.fn(async (rid, body) => ({ ok: true, data: { rid, updated: body } })),
    logout: jest.fn(() => ({ ok: true })),
    subscribeEvents: jest.fn(() => ({ ok: true })),
    unsubscribeEvents: jest.fn(() => ({ ok: true })),
    listOperations: jest.fn(async (q) => ({ ok: true, data: [] })),
    undoOperation: jest.fn(async (id) => ({ ok: true, data: { operationId: id } })),
    getRelations: jest.fn(async (rid) => ({ ok: true, data: { outgoing: [], incoming: [] } })),
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
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.UPDATE_NOTE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.LOGOUT, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.EVENTS_SUBSCRIBE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.EVENTS_UNSUBSCRIBE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.OPERATIONS, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.OPERATION_UNDO, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.RELATIONS, expect.any(Function));
    expect(ipcMain.handle.mock.calls.length).toBe(13);
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

    await byChannel(CHANNELS.UPDATE_NOTE)({}, 'res_1', { content: 'x' });
    expect(service.updateNote).toHaveBeenCalledWith('res_1', { content: 'x' });

    await byChannel(CHANNELS.UPDATE_NOTE)({}, 'res_1', undefined);
    expect(service.updateNote).toHaveBeenCalledWith('res_1', {});

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
});
