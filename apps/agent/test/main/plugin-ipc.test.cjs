const { registerPluginIpc, CHANNELS } = require('../../src/main/plugin/plugin-ipc.cjs');

function makeRegistry(commands, views = [], panels = [], editors = [], services = []) {
  return {
    listCommands: jest.fn(() => commands),
    listViews: jest.fn(() => views),
    listPanels: jest.fn(() => panels),
    listEditors: jest.fn(() => editors),
    listServices: jest.fn(() => services),
  };
}

function makePluginManager(commands = [], views = [], panels = [], editors = [], services = []) {
  const pm = {
    extensionRegistry: makeRegistry(commands, views, panels, editors, services),
    executeCommand: jest.fn(),
    renderView: jest.fn(),
    renderPanel: jest.fn(),
    renderEditor: jest.fn(),
    getUiModule: jest.fn(),
    invokePluginUiCtx: jest.fn(),
    listForUi: jest.fn(() => []),
    enable: jest.fn(async () => ({})),
    disable: jest.fn(async () => ({})),
    uninstall: jest.fn(async () => ({ ok: true, id: 'demo' })),
    getConfig: jest.fn(() => ({})),
    setConfig: jest.fn(() => ({})),
  };
  pm.executeCommand.mockImplementation(async (id, args) => ({
    pluginId: 'demo',
    commandId: id,
    result: { ok: true, args },
  }));
  pm.renderView.mockImplementation(async (viewId) => ({
    pluginId: 'demo',
    viewId,
    title: 'View',
    type: 'panel',
    html: '<p>hi</p>',
  }));
  pm.renderPanel.mockImplementation(async (panelId) => ({
    pluginId: 'demo',
    panelId,
    title: 'Panel',
    area: 'sidebar',
    html: '<p>panel</p>',
  }));
  pm.renderEditor.mockImplementation(async (editorId) => ({
    pluginId: 'demo',
    editorId,
    title: 'Editor',
    resourceType: 'note',
    html: '<p>editor</p>',
  }));
  return pm;
}

describe('registerPluginIpc', () => {
  it('为每个通道注册 handle', () => {
    const ipcMain = { handle: jest.fn() };
    registerPluginIpc(ipcMain, makePluginManager());
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.LIST_COMMANDS, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(CHANNELS.EXECUTE_COMMAND, expect.any(Function));
  });

  it('LIST_COMMANDS 返回命令清单（id/title/pluginId，无 handler）', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager([
      { id: 'demo.hello', title: 'Hello', pluginId: 'demo', handler: () => {} },
      { id: 'demo.touch', title: 'Touch', pluginId: 'demo', handler: () => {} },
    ]);
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_COMMANDS)[1];

    const res = await handler();
    expect(res.ok).toBe(true);
    expect(res.commands).toEqual([
      { id: 'demo.hello', title: 'Hello', pluginId: 'demo' },
      { id: 'demo.touch', title: 'Touch', pluginId: 'demo' },
    ]);
    // 不透传 handler 函数
    expect(res.commands.every((c) => typeof c.handler === 'undefined')).toBe(true);
  });

  it('无插件系统时 LIST_COMMANDS 返回空清单', async () => {
    const ipcMain = { handle: jest.fn() };
    registerPluginIpc(ipcMain, null);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_COMMANDS)[1];
    const res = await handler();
    expect(res).toEqual({ ok: true, commands: [] });
  });

  it('EXECUTE_COMMAND 委托 pluginManager.executeCommand 并返回结果', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.EXECUTE_COMMAND)[1];

    const res = await handler({}, 'demo.hello', ['world']);
    expect(pm.executeCommand).toHaveBeenCalledWith('demo.hello', ['world']);
    expect(res.ok).toBe(true);
    expect(res.result).toEqual({ pluginId: 'demo', commandId: 'demo.hello', result: { ok: true, args: ['world'] } });
  });

  it('EXECUTE_COMMAND args 非数组时兜底为空数组', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.EXECUTE_COMMAND)[1];

    await handler({}, 'demo.hello', undefined);
    expect(pm.executeCommand).toHaveBeenCalledWith('demo.hello', []);
  });

  it('EXECUTE_COMMAND 插件系统未初始化时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    registerPluginIpc(ipcMain, null);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.EXECUTE_COMMAND)[1];

    const res = await handler({}, 'demo.hello', []);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/未初始化/);
  });

  it('EXECUTE_COMMAND 命令不存在时返回错误（不抛给 IPC）', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.executeCommand.mockRejectedValue(new Error('命令不存在: nope'));
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.EXECUTE_COMMAND)[1];

    const res = await handler({}, 'nope', []);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('命令不存在: nope');
  });

  it('LIST_VIEWS 返回视图清单（id/title/type/pluginId，无 render）', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager([], [
      { id: 'demo.status', title: '状态', type: 'panel', pluginId: 'demo', render: () => {} },
    ]);
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_VIEWS)[1];

    const res = await handler();
    expect(res.ok).toBe(true);
    expect(res.views).toEqual([
      { id: 'demo.status', title: '状态', type: 'panel', pluginId: 'demo' },
    ]);
    expect(res.views.every((v) => typeof v.render === 'undefined')).toBe(true);
  });

  it('无插件系统时 LIST_VIEWS 返回空清单', async () => {
    const ipcMain = { handle: jest.fn() };
    registerPluginIpc(ipcMain, null);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_VIEWS)[1];
    const res = await handler();
    expect(res).toEqual({ ok: true, views: [] });
  });

  it('RENDER_VIEW 委托 pluginManager.renderView 并返回 HTML', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.RENDER_VIEW)[1];

    const res = await handler({}, 'demo.status', { rid: 'r1' });
    expect(pm.renderView).toHaveBeenCalledWith('demo.status', { rid: 'r1' });
    expect(res.ok).toBe(true);
    expect(res.view).toEqual({ pluginId: 'demo', viewId: 'demo.status', title: 'View', type: 'panel', html: '<p>hi</p>' });
  });

  it('RENDER_VIEW 视图不存在时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.renderView.mockRejectedValue(new Error('视图不存在: nope'));
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.RENDER_VIEW)[1];

    const res = await handler({}, 'nope', {});
    expect(res.ok).toBe(false);
    expect(res.error).toBe('视图不存在: nope');
  });

  it('LIST_PANELS 返回面板清单（id/title/area/pluginId，无 render）', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager([], [], [
      { id: 'demo.side', title: '侧栏', area: 'sidebar', pluginId: 'demo', render: () => {} },
    ]);
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_PANELS)[1];

    const res = await handler();
    expect(res.ok).toBe(true);
    expect(res.panels).toEqual([
      { id: 'demo.side', title: '侧栏', area: 'sidebar', pluginId: 'demo' },
    ]);
    expect(res.panels.every((p) => typeof p.render === 'undefined')).toBe(true);
  });

  it('无插件系统时 LIST_PANELS 返回空清单', async () => {
    const ipcMain = { handle: jest.fn() };
    registerPluginIpc(ipcMain, null);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_PANELS)[1];
    const res = await handler();
    expect(res).toEqual({ ok: true, panels: [] });
  });

  it('RENDER_PANEL 委托 pluginManager.renderPanel 并返回 HTML', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.RENDER_PANEL)[1];

    const res = await handler({}, 'demo.side', {});
    expect(pm.renderPanel).toHaveBeenCalledWith('demo.side', {});
    expect(res.ok).toBe(true);
    expect(res.panel).toEqual({ pluginId: 'demo', panelId: 'demo.side', title: 'Panel', area: 'sidebar', html: '<p>panel</p>' });
  });

  it('RENDER_PANEL 面板不存在时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.renderPanel.mockRejectedValue(new Error('面板不存在: nope'));
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.RENDER_PANEL)[1];

    const res = await handler({}, 'nope', {});
    expect(res.ok).toBe(false);
    expect(res.error).toBe('面板不存在: nope');
  });

  it('LIST_EDITORS 返回编辑器清单（id/title/resourceType/pluginId，无 render）', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager([], [], [], [
      { id: 'demo.note', title: '笔记', resourceType: 'note', pluginId: 'demo', render: () => {} },
    ]);
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_EDITORS)[1];

    const res = await handler();
    expect(res.ok).toBe(true);
    expect(res.editors).toEqual([
      { id: 'demo.note', title: '笔记', resourceType: 'note', pluginId: 'demo' },
    ]);
    expect(res.editors.every((e) => typeof e.render === 'undefined')).toBe(true);
  });

  it('无插件系统时 LIST_EDITORS 返回空清单', async () => {
    const ipcMain = { handle: jest.fn() };
    registerPluginIpc(ipcMain, null);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_EDITORS)[1];
    const res = await handler();
    expect(res).toEqual({ ok: true, editors: [] });
  });

  it('LIST_SERVICES 返回服务清单（元信息，不含 api）', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager([], [], [], [], [
      { id: 'demo.ping', title: 'Ping', version: '1.0.0', pluginId: 'demo' },
    ]);
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_SERVICES)[1];

    const res = await handler();
    expect(res.ok).toBe(true);
    expect(res.services).toEqual([
      { id: 'demo.ping', title: 'Ping', version: '1.0.0', pluginId: 'demo' },
    ]);
    expect(res.services.every((s) => typeof s.api === 'undefined')).toBe(true);
  });

  it('无插件系统时 LIST_SERVICES 返回空清单', async () => {
    const ipcMain = { handle: jest.fn() };
    registerPluginIpc(ipcMain, null);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_SERVICES)[1];
    const res = await handler();
    expect(res).toEqual({ ok: true, services: [] });
  });

  it('RENDER_EDITOR 委托 pluginManager.renderEditor 并返回 HTML', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.RENDER_EDITOR)[1];

    const res = await handler({}, 'demo.note', { rid: 'r1' });
    expect(pm.renderEditor).toHaveBeenCalledWith('demo.note', { rid: 'r1' });
    expect(res.ok).toBe(true);
    expect(res.editor).toEqual({ pluginId: 'demo', editorId: 'demo.note', title: 'Editor', resourceType: 'note', html: '<p>editor</p>' });
  });

  it('RENDER_EDITOR 编辑器不存在时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.renderEditor.mockRejectedValue(new Error('编辑器不存在: nope'));
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.RENDER_EDITOR)[1];

    const res = await handler({}, 'nope', {});
    expect(res.ok).toBe(false);
    expect(res.error).toBe('编辑器不存在: nope');
  });

  it('GET_UI_MODULE 返回渲染端入口源码 + worldId', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.getUiModule.mockReturnValue({ source: 'export const views = {};', worldId: 1004 });
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.GET_UI_MODULE)[1];

    const res = await handler({}, 'demo');
    expect(pm.getUiModule).toHaveBeenCalledWith('demo');
    expect(res).toEqual({ ok: true, source: 'export const views = {};', worldId: 1004 });
  });

  it('GET_UI_MODULE 未声明 ui / 未加载时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.getUiModule.mockImplementation(() => { throw new Error('插件未声明 ui: demo'); });
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.GET_UI_MODULE)[1];

    const res = await handler({}, 'demo');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('插件未声明 ui: demo');
  });

  it('无插件系统时 GET_UI_MODULE 返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    registerPluginIpc(ipcMain, null);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.GET_UI_MODULE)[1];
    const res = await handler({}, 'demo');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/未初始化/);
  });

  it('CTX 委托 pluginManager.invokePluginUiCtx 并返回结果', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.invokePluginUiCtx.mockResolvedValue({ totalResources: 3 });
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.CTX)[1];

    const payload = { pluginId: 'demo', target: 'lo', ns: 'health', method: 'stats', args: [] };
    const res = await handler({}, payload);
    expect(pm.invokePluginUiCtx).toHaveBeenCalledWith({
      pluginId: 'demo', target: 'lo', ns: 'health', method: 'stats', args: [],
    });
    expect(res).toEqual({ ok: true, result: { totalResources: 3 } });
  });

  it('CTX 权限拒绝（facade）时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.invokePluginUiCtx.mockRejectedValue(new Error('[lo-facade] demo 调用 ctx.lo.operations.execute 被拒绝'));
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.CTX)[1];

    const res = await handler({}, { pluginId: 'demo', target: 'lo', ns: 'operations', method: 'execute', args: [] });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('被拒绝');
  });

  it('CTX payload 非法 / 插件系统未初始化时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.CTX)[1];

    const bad = await handler({}, {});
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/payload 非法/);

    const ipcMain2 = { handle: jest.fn() };
    registerPluginIpc(ipcMain2, null);
    const handler2 = ipcMain2.handle.mock.calls.find(([c]) => c === CHANNELS.CTX)[1];
    const res = await handler2({}, { pluginId: 'demo', target: 'lo', ns: 'health', method: 'stats' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/未初始化/);
  });

  it('INSTALL 委托 pluginManager.install', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.install = jest.fn(async (id, url, opts) => ({ id, version: '0.1.0', dir: '/d', state: 'loaded' }));
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.INSTALL)[1];

    const res = await handler({}, 'demo', 'https://example.com', { force: true });
    expect(pm.install).toHaveBeenCalledWith('demo', 'https://example.com', { force: true });
    expect(res.ok).toBe(true);
    expect(res.result.id).toBe('demo');
  });

  it('INSTALL 失败时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.install = jest.fn(async () => { throw new Error('checksum 校验失败'); });
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.INSTALL)[1];

    const res = await handler({}, 'demo', 'https://example.com', {});
    expect(res.ok).toBe(false);
    expect(res.error).toBe('checksum 校验失败');
  });

  it('LIST_PLUGINS 返回管理面板插件清单（listForUi 策展形状）', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.listForUi.mockReturnValue([
      { id: 'demo', name: 'Demo', version: '0.1.0', state: 'activated', enabled: true },
    ]);
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_PLUGINS)[1];

    const res = await handler();
    expect(res.ok).toBe(true);
    expect(res.plugins).toEqual([
      { id: 'demo', name: 'Demo', version: '0.1.0', state: 'activated', enabled: true },
    ]);
  });

  it('无插件系统时 LIST_PLUGINS 返回空清单', async () => {
    const ipcMain = { handle: jest.fn() };
    registerPluginIpc(ipcMain, null);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.LIST_PLUGINS)[1];
    const res = await handler();
    expect(res).toEqual({ ok: true, plugins: [] });
  });

  it('ENABLE 委托 pluginManager.enable', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.ENABLE)[1];

    const res = await handler({}, 'demo');
    expect(pm.enable).toHaveBeenCalledWith('demo');
    expect(res.ok).toBe(true);
  });

  it('ENABLE 插件系统未初始化时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    registerPluginIpc(ipcMain, null);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.ENABLE)[1];
    const res = await handler({}, 'demo');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/未初始化/);
  });

  it('DISABLE 委托 pluginManager.disable', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.DISABLE)[1];

    const res = await handler({}, 'demo');
    expect(pm.disable).toHaveBeenCalledWith('demo');
    expect(res.ok).toBe(true);
  });

  it('DISABLE 失败时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.disable.mockRejectedValue(new Error('插件未加载: demo'));
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.DISABLE)[1];

    const res = await handler({}, 'demo');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('插件未加载: demo');
  });

  it('UNINSTALL 委托 pluginManager.uninstall', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.uninstall.mockResolvedValue({ ok: true, id: 'demo' });
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.UNINSTALL)[1];

    const res = await handler({}, 'demo');
    expect(pm.uninstall).toHaveBeenCalledWith('demo');
    expect(res.ok).toBe(true);
  });

  it('UNINSTALL 失败时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.uninstall.mockRejectedValue(new Error('卸载失败'));
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(([c]) => c === CHANNELS.UNINSTALL)[1];

    const res = await handler({}, 'demo');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('卸载失败');
  });

  it('GET_PLUGIN_CONFIG 返回插件用户配置', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.getConfig.mockReturnValue({ greeting: '你好' });
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(
      ([c]) => c === CHANNELS.GET_PLUGIN_CONFIG,
    )[1];

    const res = await handler({}, 'demo');
    expect(pm.getConfig).toHaveBeenCalledWith('demo');
    expect(res.ok).toBe(true);
    expect(res.config).toEqual({ greeting: '你好' });
  });

  it('SET_PLUGIN_CONFIG 委托 pluginManager.setConfig 并落盘', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.setConfig.mockReturnValue({ greeting: '你好' });
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(
      ([c]) => c === CHANNELS.SET_PLUGIN_CONFIG,
    )[1];

    const res = await handler({}, 'demo', 'greeting', '你好');
    expect(pm.setConfig).toHaveBeenCalledWith('demo', 'greeting', '你好');
    expect(res.ok).toBe(true);
    expect(res.config).toEqual({ greeting: '你好' });
  });

  it('SET_PLUGIN_CONFIG 失败时返回错误', async () => {
    const ipcMain = { handle: jest.fn() };
    const pm = makePluginManager();
    pm.setConfig.mockImplementation(() => { throw new Error('pluginStore 未注入'); });
    registerPluginIpc(ipcMain, pm);
    const handler = ipcMain.handle.mock.calls.find(
      ([c]) => c === CHANNELS.SET_PLUGIN_CONFIG,
    )[1];

    const res = await handler({}, 'demo', 'k', 'v');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('pluginStore 未注入');
  });
});
