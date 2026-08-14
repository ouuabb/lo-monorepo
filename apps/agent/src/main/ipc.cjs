/**
 * ipc.cjs —— 主进程 IPC 注册
 *
 * 将 LoCoreService 的能力暴露为受控通道：
 *   lo-core:config / lo-core:configure / lo-core:login / lo-core:status /
 *   lo-core:list-notes / lo-core:get-note / lo-core:update-note / lo-core:logout
 *
 * 只转发白名单方法，不透传任意调用。
 */
const CHANNELS = {
  CONFIG: 'lo-core:config',
  CONFIGURE: 'lo-core:configure',
  LOGIN: 'lo-core:login',
  STATUS: 'lo-core:status',
  LIST_NOTES: 'lo-core:list-notes',
  GET_NOTE: 'lo-core:get-note',
  UPDATE_NOTE: 'lo-core:update-note',
  LOGOUT: 'lo-core:logout',
  RELATIONS: 'lo-core:relations',
  OPERATIONS: 'lo-core:operations',
  OPERATION_UNDO: 'lo-core:operation-undo',
  EVENTS_SUBSCRIBE: 'lo-core:events-subscribe',
  EVENTS_UNSUBSCRIBE: 'lo-core:events-unsubscribe',
  EVENTS_PUSH: 'lo-core:event',
};

/**
 * @param {object} ipcMain — electron ipcMain
 * @param {LoCoreService} service
 */
function registerLoCoreIpc(ipcMain, service) {
  ipcMain.handle(CHANNELS.CONFIG, () => service.load());
  ipcMain.handle(CHANNELS.CONFIGURE, (_event, cfg) => service.configure(cfg || {}));
  ipcMain.handle(CHANNELS.LOGIN, (_event, params) => service.login(params || {}));
  ipcMain.handle(CHANNELS.STATUS, () => service.getStatus());
  ipcMain.handle(CHANNELS.LIST_NOTES, (_event, query) => service.listNotes(query || {}));
  ipcMain.handle(CHANNELS.GET_NOTE, (_event, rid) => service.getNote(rid));
  ipcMain.handle(CHANNELS.UPDATE_NOTE, (_event, rid, body) => service.updateNote(rid, body || {}));
  ipcMain.handle(CHANNELS.LOGOUT, () => service.logout());
  ipcMain.handle(CHANNELS.RELATIONS, (_event, rid) => service.getRelations(rid));
  ipcMain.handle(CHANNELS.OPERATIONS, (_event, query) => service.listOperations(query || {}));
  ipcMain.handle(CHANNELS.OPERATION_UNDO, (_event, id) => service.undoOperation(id));

  // 事件订阅(SSE)：主进程持有订阅，事件经 EVENTS_PUSH 推送到发起窗口
  ipcMain.handle(CHANNELS.EVENTS_SUBSCRIBE, (event, types) => {
    const sender = event.sender;
    return service.subscribeEvents(types || [], (ev) => {
      if (!sender.isDestroyed()) {
        sender.send(CHANNELS.EVENTS_PUSH, ev);
      }
    });
  });
  ipcMain.handle(CHANNELS.EVENTS_UNSUBSCRIBE, () => service.unsubscribeEvents());
}

module.exports = { registerLoCoreIpc, CHANNELS };
