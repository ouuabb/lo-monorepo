jest.mock('electron', () => {
  const mockExposeInMainWorld = jest.fn();
  const mockExposeInIsolatedWorld = jest.fn();
  const mockInvoke = jest.fn();
  const mockOn = jest.fn();
  const mockRemoveListener = jest.fn();
  return {
    contextBridge: {
      exposeInMainWorld: mockExposeInMainWorld,
      exposeInIsolatedWorld: mockExposeInIsolatedWorld,
    },
    ipcRenderer: { invoke: mockInvoke, on: mockOn, removeListener: mockRemoveListener },
    webFrame: { executeJavaScriptInIsolatedWorld: jest.fn() },
    __mocks: {
      mockExposeInMainWorld,
      mockExposeInIsolatedWorld,
      mockInvoke,
      mockOn,
      mockRemoveListener,
    },
  };
});

describe('src/preload/index.cjs', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('通过 contextBridge 暴露 loAgent API', () => {
    require('../../src/preload/index.cjs');
    const { mockExposeInMainWorld } = require('electron').__mocks;

    expect(mockExposeInMainWorld).toHaveBeenCalledTimes(2);
    expect(mockExposeInMainWorld.mock.calls[0][0]).toBe('loAgent');
    const api = mockExposeInMainWorld.mock.calls[0][1];
    expect(api).toHaveProperty('version', '0.1.0');
    expect(api.loCore.configure).toBeDefined();
    expect(api.loCore.login).toBeDefined();
    expect(api.loCore.getStatus).toBeDefined();
    expect(api.loCore.listNotes).toBeDefined();
    expect(api.loCore.getNote).toBeDefined();
    expect(api.loCore.createNote).toBeDefined();
    expect(api.loCore.updateNote).toBeDefined();
    expect(api.loCore.removeNote).toBeDefined();
    expect(api.loCore.uploadNotes).toBeDefined();
    expect(api.loCore.logout).toBeDefined();
    expect(api.loCore.operations).toBeDefined();
    expect(api.loCore.operations.list).toBeDefined();
    expect(api.loCore.operations.undo).toBeDefined();
    expect(api.loCore.views).toBeDefined();
    expect(api.loCore.views.list).toBeDefined();
    expect(api.loCore.views.get).toBeDefined();
    expect(api.loCore.views.run).toBeDefined();
    expect(api.loCore.relations).toBeDefined();
    expect(api.loCore.relations.list).toBeDefined();
    expect(api.loCore.events).toBeDefined();
    expect(api.loCore.events.subscribe).toBeDefined();
    expect(api.loCore.events.unsubscribe).toBeDefined();
    expect(api.loCore.events.onEvent).toBeDefined();
    expect(api.loCore.repository).toBeDefined();
    expect(api.loCore.repository.info).toBeDefined();
    expect(api.loCore.repository.resolveLocation).toBeDefined();
    expect(api.loCore.revealResource).toBeDefined();
    expect(api.loCore.graph).toBeDefined();
    expect(api.plugins).toBeDefined();
    expect(api.plugins.list).toBeDefined();
    expect(api.plugins.execute).toBeDefined();
    expect(api.plugins.views).toBeDefined();
    expect(api.plugins.views.list).toBeDefined();
    expect(api.plugins.views.render).toBeDefined();
    expect(api.plugins.panels).toBeDefined();
    expect(api.plugins.editors).toBeDefined();
    expect(api.plugins.viewers).toBeDefined();
    expect(api.plugins.viewers.list).toBeDefined();
    expect(api.plugins.viewers.render).toBeDefined();
    expect(api.plugins.services).toBeDefined();
    expect(api.plugins.services.list).toBeDefined();
    expect(api.plugins.getUi).toBeDefined();
    expect(api.plugins.install).toBeDefined();
    expect(api.plugins.manage).toBeDefined();
    expect(api.plugins.manage.list).toBeDefined();
    expect(api.plugins.manage.enable).toBeDefined();
    expect(api.plugins.manage.disable).toBeDefined();
    expect(api.plugins.manage.uninstall).toBeDefined();
    expect(api.plugins.manage.getConfig).toBeDefined();
    expect(api.plugins.manage.setConfig).toBeDefined();
  });

  it('loCore.revealResource 经白名单通道透传 rid（不暴露路径）', async () => {
    require('../../src/preload/index.cjs');
    const { mockExposeInMainWorld, mockInvoke } = require('electron').__mocks;
    const api = mockExposeInMainWorld.mock.calls[0][1];
    mockInvoke.mockResolvedValue({ ok: true });

    const res = await api.loCore.revealResource('res_1');
    expect(mockInvoke).toHaveBeenCalledWith('lo-core:reveal-resource', 'res_1');
    expect(res).toEqual({ ok: true });
  });

  it('loCore.repository 通道名正确（info / resolveLocation）', async () => {
    require('../../src/preload/index.cjs');
    const { mockExposeInMainWorld, mockInvoke } = require('electron').__mocks;
    const api = mockExposeInMainWorld.mock.calls[0][1];
    mockInvoke.mockResolvedValue({ ok: true, info: {} });

    await api.loCore.repository.info();
    expect(mockInvoke).toHaveBeenLastCalledWith('lo-core:repository-info');

    await api.loCore.repository.resolveLocation('res_2');
    expect(mockInvoke).toHaveBeenLastCalledWith('lo-core:resource-location', 'res_2');
  });

  it('loCore.graph 经白名单通道透传 query', async () => {
    require('../../src/preload/index.cjs');
    const { mockExposeInMainWorld, mockInvoke } = require('electron').__mocks;
    const api = mockExposeInMainWorld.mock.calls[0][1];
    mockInvoke.mockResolvedValue({ ok: true, graph: { nodes: [], edges: [] } });

    const res = await api.loCore.graph({ limit: 100 });
    expect(mockInvoke).toHaveBeenCalledWith('lo-core:graph', { limit: 100 });
    expect(res.graph).toEqual({ nodes: [], edges: [] });
  });

  it('loCore.modes / viewers 经白名单通道透传（U1）', async () => {
    require('../../src/preload/index.cjs');
    const { mockExposeInMainWorld, mockInvoke } = require('electron').__mocks;
    const api = mockExposeInMainWorld.mock.calls[0][1];
    mockInvoke.mockResolvedValue({ ok: true, modes: [{ modeId: 'editing' }] });
    expect(api.loCore.modes.list).toBeDefined();
    expect(api.loCore.modes.resolve).toBeDefined();
    expect(api.loCore.viewers.list).toBeDefined();

    await api.loCore.modes.list();
    expect(mockInvoke).toHaveBeenLastCalledWith('lo-core:modes');

    await api.loCore.modes.resolve('res_1');
    expect(mockInvoke).toHaveBeenLastCalledWith('lo-core:modes-resolve', 'res_1');

    await api.loCore.viewers.list('reading');
    expect(mockInvoke).toHaveBeenLastCalledWith('lo-core:viewers', 'reading');
  });

  it('plugins.viewers 经白名单通道透传（U3：viewer 渲染桥）', async () => {
    require('../../src/preload/index.cjs');
    const { mockExposeInMainWorld, mockInvoke } = require('electron').__mocks;
    const api = mockExposeInMainWorld.mock.calls[0][1];
    mockInvoke.mockResolvedValue({ ok: true, viewers: [] });

    await api.plugins.viewers.list();
    expect(mockInvoke).toHaveBeenLastCalledWith('agent-plugins:list-viewers');

    mockInvoke.mockResolvedValue({ ok: true, viewer: { html: '<p>x</p>' } });
    const res = await api.plugins.viewers.render('viewer.epub-reader', { rid: 'res_1' });
    expect(mockInvoke).toHaveBeenLastCalledWith('agent-plugins:render-viewer', 'viewer.epub-reader', { rid: 'res_1' });
    expect(res.viewer.html).toBe('<p>x</p>');
  });

  it('pluginUi 桥暴露 mount/render/dispose（isolated world）', () => {
    require('../../src/preload/index.cjs');
    const { mockExposeInMainWorld } = require('electron').__mocks;
    const pluginUi = mockExposeInMainWorld.mock.calls[1][1];
    expect(pluginUi.hasWebFrame()).toBe(true);
    expect(typeof pluginUi.mount).toBe('function');
    expect(typeof pluginUi.render).toBe('function');
    expect(typeof pluginUi.dispose).toBe('function');
  });

  it('pluginUi.mount 注入 ctx 并执行引导；ctx 方法代理到 agent-plugins:ctx', async () => {
    require('../../src/preload/index.cjs');
    const { mockExposeInMainWorld, mockExposeInIsolatedWorld, mockInvoke } = require('electron').__mocks;
    const webFrame = require('electron').webFrame;
    const pluginUi = mockExposeInMainWorld.mock.calls[1][1];

    mockInvoke.mockResolvedValue({ ok: true, result: { totalResources: 3 } });

    await pluginUi.mount(1004, 'demo', 'export const views = {};', { onNotify: jest.fn() });

    expect(mockExposeInIsolatedWorld).toHaveBeenCalledTimes(2);
    expect(mockExposeInIsolatedWorld.mock.calls[0][0]).toBe(1004);
    expect(mockExposeInIsolatedWorld.mock.calls[0][1]).toBe('__loPluginBootstrap');
    expect(mockExposeInIsolatedWorld.mock.calls[1][1]).toBe('__loPluginCtx');
    expect(webFrame.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(
      1004,
      [expect.objectContaining({ code: expect.stringContaining('import(url)') })],
      true,
    );

    // ctx 方法（isolated world 中调用）→ agent-plugins:ctx 代理，解包 {ok,result}
    const ctx = mockExposeInIsolatedWorld.mock.calls[1][2];
    await ctx.lo.health.stats();
    expect(mockInvoke).toHaveBeenCalledWith('agent-plugins:ctx', {
      pluginId: 'demo',
      target: 'lo',
      ns: 'health',
      method: 'stats',
      args: [],
    });
    await ctx.config('greeting');
    expect(mockInvoke).toHaveBeenLastCalledWith('agent-plugins:ctx', {
      pluginId: 'demo',
      target: 'config',
      method: 'config',
      args: ['greeting', undefined],
    });
    await ctx.executeCommand('demo.hello', ['world']);
    expect(mockInvoke).toHaveBeenLastCalledWith('agent-plugins:ctx', {
      pluginId: 'demo',
      target: 'executeCommand',
      method: 'execute',
      args: ['demo.hello', ['world']],
    });
    // 解包：返回 result 而非信封
    expect(await ctx.lo.health.stats()).toEqual({ totalResources: 3 });
    // 失败：抛错
    mockInvoke.mockResolvedValue({ ok: false, error: '[lo-facade] 被拒绝' });
    await expect(ctx.lo.operations.execute('x', {})).rejects.toThrow(/被拒绝/);
  });

  it('loCore 方法转发到对应 IPC 通道', () => {
    require('../../src/preload/index.cjs');
    const { mockExposeInMainWorld, mockInvoke } = require('electron').__mocks;
    const api = mockExposeInMainWorld.mock.calls[0][1];

    api.loCore.getConfig();
    api.loCore.configure({ host: 'h' });
    api.loCore.login('x-invalid-arg');
    api.loCore.getStatus();
    api.loCore.listNotes({ limit: 5 });
    api.loCore.getNote('res_1');
    api.loCore.createNote({ title: '新笔记' });
    api.loCore.updateNote('res_1', { content: 'x' });
    api.loCore.removeNote('res_1');
    api.loCore.uploadNotes([{ name: 'a.md', data: new Uint8Array([1, 2]) }], { title: 't' });
    api.loCore.logout();
    api.loCore.events.subscribe(['resource.created']);
    api.loCore.events.unsubscribe();
    api.loCore.operations.list({ limit: 5 });
    api.loCore.operations.undo('op_1');
    api.loCore.views.list({ status: 'active' });
    api.loCore.views.get('v1');
    api.loCore.views.run('v1', { limit: 50 });
    api.loCore.relations.list('res_1');
    api.plugins.list();
    api.plugins.execute('demo.hello', ['world']);
    api.plugins.views.list();
    api.plugins.views.render('demo.status', { rid: 'r1' });
    api.plugins.install('demo', 'https://example.com', { force: true });
    api.plugins.manage.list();
    api.plugins.manage.enable('demo');
    api.plugins.manage.disable('demo');
    api.plugins.manage.uninstall('demo');
    api.plugins.manage.getConfig('demo');
    api.plugins.manage.setConfig('demo', 'greeting', '你好');

    expect(mockInvoke).toHaveBeenCalledTimes(30);
    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'lo-core:config');
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'lo-core:configure', { host: 'h' });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'lo-core:login', 'x-invalid-arg');
    expect(mockInvoke).toHaveBeenNthCalledWith(4, 'lo-core:status');
    expect(mockInvoke).toHaveBeenNthCalledWith(5, 'lo-core:list-notes', { limit: 5 });
    expect(mockInvoke).toHaveBeenNthCalledWith(6, 'lo-core:get-note', 'res_1');
    expect(mockInvoke).toHaveBeenNthCalledWith(7, 'lo-core:create-note', { title: '新笔记' });
    expect(mockInvoke).toHaveBeenNthCalledWith(8, 'lo-core:update-note', 'res_1', { content: 'x' });
    expect(mockInvoke).toHaveBeenNthCalledWith(9, 'lo-core:remove-note', 'res_1');
    expect(mockInvoke).toHaveBeenNthCalledWith(10, 'lo-core:upload-notes', [
      { name: 'a.md', data: new Uint8Array([1, 2]) },
    ], { title: 't' });
    expect(mockInvoke).toHaveBeenNthCalledWith(11, 'lo-core:logout');
    expect(mockInvoke).toHaveBeenNthCalledWith(12, 'lo-core:events-subscribe', ['resource.created']);
    expect(mockInvoke).toHaveBeenNthCalledWith(13, 'lo-core:events-unsubscribe');
    expect(mockInvoke).toHaveBeenNthCalledWith(14, 'lo-core:operations', { limit: 5 });
    expect(mockInvoke).toHaveBeenNthCalledWith(15, 'lo-core:operation-undo', 'op_1');
    expect(mockInvoke).toHaveBeenNthCalledWith(16, 'lo-core:views-list', { status: 'active' });
    expect(mockInvoke).toHaveBeenNthCalledWith(17, 'lo-core:views-get', 'v1');
    expect(mockInvoke).toHaveBeenNthCalledWith(18, 'lo-core:views-run', 'v1', { limit: 50 });
    expect(mockInvoke).toHaveBeenNthCalledWith(19, 'lo-core:relations', 'res_1');
    expect(mockInvoke).toHaveBeenNthCalledWith(20, 'agent-plugins:list-commands');
    expect(mockInvoke).toHaveBeenNthCalledWith(21, 'agent-plugins:execute-command', 'demo.hello', ['world']);
    expect(mockInvoke).toHaveBeenNthCalledWith(22, 'agent-plugins:list-views');
    expect(mockInvoke).toHaveBeenNthCalledWith(23, 'agent-plugins:render-view', 'demo.status', { rid: 'r1' });
    expect(mockInvoke).toHaveBeenNthCalledWith(24, 'agent-plugins:install', 'demo', 'https://example.com', { force: true });
    expect(mockInvoke).toHaveBeenNthCalledWith(25, 'agent-plugins:list-plugins');
    expect(mockInvoke).toHaveBeenNthCalledWith(26, 'agent-plugins:enable', 'demo');
    expect(mockInvoke).toHaveBeenNthCalledWith(27, 'agent-plugins:disable', 'demo');
    expect(mockInvoke).toHaveBeenNthCalledWith(28, 'agent-plugins:uninstall', 'demo');
    expect(mockInvoke).toHaveBeenNthCalledWith(29, 'agent-plugins:get-plugin-config', 'demo');
    expect(mockInvoke).toHaveBeenNthCalledWith(30, 'agent-plugins:set-plugin-config', 'demo', 'greeting', '你好');
  });

  it('events.onEvent 注册 EVENTS_PUSH 监听并返回退订函数', () => {
    require('../../src/preload/index.cjs');
    const { mockExposeInMainWorld, mockOn, mockRemoveListener } = require('electron').__mocks;
    const api = mockExposeInMainWorld.mock.calls[0][1];

    const cb = jest.fn();
    const unlisten = api.loCore.events.onEvent(cb);

    // 注册监听
    expect(mockOn).toHaveBeenCalledWith('lo-core:event', expect.any(Function));
    const listener = mockOn.mock.calls[0][1];

    // 模拟主进程推送事件
    const ev = { event: 'resource.updated', data: { rid: 'r1' } };
    listener({}, ev);
    expect(cb).toHaveBeenCalledWith(ev);

    // 退订
    unlisten();
    expect(mockRemoveListener).toHaveBeenCalledWith('lo-core:event', listener);
  });
});
