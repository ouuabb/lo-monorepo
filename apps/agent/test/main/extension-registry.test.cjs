const { ExtensionRegistry } = require('../../src/main/plugin/extension-registry.cjs');

describe('ExtensionRegistry', () => {
  it('注册/查询扩展点', () => {
    const reg = new ExtensionRegistry();
    reg.register({ pluginId: 'demo', type: 'commands', id: 'demo.open', title: '打开' });
    reg.register({ pluginId: 'demo', type: 'views', id: 'demo.panel', title: '面板' });

    expect(reg.count()).toBe(2);
    expect(reg.list('commands')).toHaveLength(1);
    expect(reg.list()).toHaveLength(2);
    expect(reg.get('commands', 'demo.open', 'demo')).toMatchObject({
      pluginId: 'demo',
      type: 'commands',
      id: 'demo.open',
    });
  });

  it('重复注册抛错', () => {
    const reg = new ExtensionRegistry();
    reg.register({ pluginId: 'demo', type: 'commands', id: 'x' });
    expect(() => reg.register({ pluginId: 'demo', type: 'commands', id: 'x' })).toThrow(/已存在/);
  });

  it('registerAll 跳过冲突', () => {
    const reg = new ExtensionRegistry();
    reg.register({ pluginId: 'a', type: 'commands', id: 'x' });
    const points = reg.registerAll([
      { pluginId: 'a', type: 'commands', id: 'x' }, // 冲突
      { pluginId: 'a', type: 'views', id: 'y' },
    ]);
    expect(points).toHaveLength(1);
    expect(reg.count()).toBe(2);
  });

  it('unregisterByPlugin 清理某插件全部扩展点', () => {
    const reg = new ExtensionRegistry();
    reg.register({ pluginId: 'a', type: 'commands', id: 'x' });
    reg.register({ pluginId: 'a', type: 'views', id: 'y' });
    reg.register({ pluginId: 'b', type: 'commands', id: 'z' });
    reg.unregisterByPlugin('a');
    expect(reg.count()).toBe(1);
    expect(reg.listByPlugin('a')).toEqual([]);
    expect(reg.listByPlugin('b')).toHaveLength(1);
  });

  it('listByPlugin 列出某插件贡献', () => {
    const reg = new ExtensionRegistry();
    reg.register({ pluginId: 'a', type: 'commands', id: 'x' });
    reg.register({ pluginId: 'b', type: 'commands', id: 'z' });
    expect(reg.listByPlugin('a')).toHaveLength(1);
  });

  it('clear 清空', () => {
    const reg = new ExtensionRegistry();
    reg.register({ pluginId: 'a', type: 'commands', id: 'x' });
    reg.clear();
    expect(reg.count()).toBe(0);
  });

  it('registerCommands 注册可执行命令（含 handler）', () => {
    const reg = new ExtensionRegistry();
    const handler = jest.fn();
    const defs = [
      { id: 'demo.hello', title: 'Hello', handler },
      { id: 'demo.skip', handler: 'not-a-function' }, // 缺 handler → 跳过
    ];
    const registered = reg.registerCommands('demo', defs);
    expect(registered).toHaveLength(1);
    expect(reg.count()).toBe(1);

    const cmd = reg.getCommand('demo.hello');
    expect(cmd).toMatchObject({ id: 'demo.hello', pluginId: 'demo', title: 'Hello' });
    expect(typeof cmd.handler).toBe('function');
    expect(reg.getCommand('demo.skip')).toBeNull();
    expect(reg.listCommands()).toHaveLength(1);
  });

  it('registerCommands 重复 ID 跳过', () => {
    const reg = new ExtensionRegistry();
    reg.registerCommands('a', [{ id: 'dup', handler: () => 1 }]);
    const reg2 = reg.registerCommands('b', [{ id: 'dup', handler: () => 2 }]);
    expect(reg2).toHaveLength(0);
    expect(reg.getCommand('dup').pluginId).toBe('a');
  });

  it('unregisterByPlugin 同时清理命令', () => {
    const reg = new ExtensionRegistry();
    reg.registerCommands('a', [{ id: 'a.cmd', handler: () => 1 }]);
    reg.registerCommands('b', [{ id: 'b.cmd', handler: () => 2 }]);
    reg.unregisterByPlugin('a');
    expect(reg.getCommand('a.cmd')).toBeNull();
    expect(reg.getCommand('b.cmd')).not.toBeNull();
    expect(reg.count()).toBe(1);
  });

  it('clear 清空命令', () => {
    const reg = new ExtensionRegistry();
    reg.registerCommands('a', [{ id: 'a.cmd', handler: () => 1 }]);
    reg.clear();
    expect(reg.getCommand('a.cmd')).toBeNull();
    expect(reg.count()).toBe(0);
  });

  it('registerViews 注册视图（含 render）', () => {
    const reg = new ExtensionRegistry();
    const render = jest.fn(() => '<p>hi</p>');
    const registered = reg.registerViews('demo', [
      { id: 'demo.status', title: '状态', type: 'panel', render },
      { id: 'demo.bad', render: 'not-fn' }, // 缺 render → 跳过
    ]);
    expect(registered).toHaveLength(1);

    const view = reg.getView('demo.status');
    expect(view).toMatchObject({ id: 'demo.status', pluginId: 'demo', title: '状态', type: 'panel' });
    expect(typeof view.render).toBe('function');
    expect(reg.getView('demo.bad')).toBeNull();
    expect(reg.listViews()).toHaveLength(1);
  });

  it('registerViews 重复 ID 跳过', () => {
    const reg = new ExtensionRegistry();
    reg.registerViews('a', [{ id: 'dup', render: () => 1 }]);
    const reg2 = reg.registerViews('b', [{ id: 'dup', render: () => 2 }]);
    expect(reg2).toHaveLength(0);
    expect(reg.getView('dup').pluginId).toBe('a');
  });

  it('unregisterByPlugin 同时清理视图，clear 清空', () => {
    const reg = new ExtensionRegistry();
    reg.registerViews('a', [{ id: 'a.view', render: () => 1 }]);
    reg.registerViews('b', [{ id: 'b.view', render: () => 2 }]);
    reg.unregisterByPlugin('a');
    expect(reg.getView('a.view')).toBeNull();
    expect(reg.getView('b.view')).not.toBeNull();
    reg.clear();
    expect(reg.listViews()).toHaveLength(0);
  });

  it('registerServices 注册服务（含 api），getService 返回 api', () => {
    const reg = new ExtensionRegistry();
    const api = { stats: jest.fn(), markup: () => 'x' };
    const registered = reg.registerServices('demo', [
      { id: 'demo.ping', title: 'Ping', version: '1.0.0', api },
      { id: 'demo.bad', title: 'Bad' }, // 缺 api → 跳过
    ]);
    expect(registered).toHaveLength(1);
    expect(reg.count()).toBe(1);

    const svc = reg.getService('demo.ping');
    expect(svc).toMatchObject({ id: 'demo.ping', pluginId: 'demo', title: 'Ping', version: '1.0.0' });
    expect(svc.api).toBe(api);
    expect(reg.getService('demo.bad')).toBeNull();
    expect(reg.listServices()).toHaveLength(1);
  });

  it('registerServices 重复 ID 跳过', () => {
    const reg = new ExtensionRegistry();
    reg.registerServices('a', [{ id: 'dup', api: { x: () => 1 } }]);
    const reg2 = reg.registerServices('b', [{ id: 'dup', api: { x: () => 2 } }]);
    expect(reg2).toHaveLength(0);
    expect(reg.getService('dup').pluginId).toBe('a');
  });

  it('listServices 只暴露元信息（不含 api）', () => {
    const reg = new ExtensionRegistry();
    reg.registerServices('a', [{ id: 'a.svc', title: 'A 服务', version: '2.0.0', api: { x: () => 1 } }]);
    const list = reg.listServices();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a.svc', pluginId: 'a', title: 'A 服务', version: '2.0.0' });
    expect(list[0].api).toBeUndefined();
  });

  it('unregisterByPlugin 同时清理服务，clear 清空', () => {
    const reg = new ExtensionRegistry();
    reg.registerServices('a', [{ id: 'a.svc', api: { x: () => 1 } }]);
    reg.registerServices('b', [{ id: 'b.svc', api: { x: () => 2 } }]);
    reg.unregisterByPlugin('a');
    expect(reg.getService('a.svc')).toBeNull();
    expect(reg.getService('b.svc')).not.toBeNull();
    reg.clear();
    expect(reg.listServices()).toHaveLength(0);
    expect(reg.count()).toBe(0);
  });

  it('registerPanels 注册面板（含 render，area 默认 sidebar）', () => {
    const reg = new ExtensionRegistry();
    const render = jest.fn(() => '<p>panel</p>');
    const registered = reg.registerPanels('demo', [
      { id: 'demo.side', title: '侧栏', render },
      { id: 'demo.bottom', title: '底部', area: 'bottom', render },
      { id: 'demo.bad', render: 'not-fn' }, // 缺 render → 跳过
    ]);
    expect(registered).toHaveLength(2);

    const panel = reg.getPanel('demo.side');
    expect(panel).toMatchObject({ id: 'demo.side', pluginId: 'demo', title: '侧栏', area: 'sidebar' });
    expect(typeof panel.render).toBe('function');
    expect(reg.getPanel('demo.bottom')).toMatchObject({ area: 'bottom' });
    expect(reg.getPanel('demo.bad')).toBeNull();
    expect(reg.listPanels()).toHaveLength(2);
  });

  it('registerPanels 重复 ID 跳过', () => {
    const reg = new ExtensionRegistry();
    reg.registerPanels('a', [{ id: 'dup', render: () => 1 }]);
    const reg2 = reg.registerPanels('b', [{ id: 'dup', render: () => 2 }]);
    expect(reg2).toHaveLength(0);
    expect(reg.getPanel('dup').pluginId).toBe('a');
  });

  it('registerEditors 注册编辑器（含 render，resourceType 默认 note）', () => {
    const reg = new ExtensionRegistry();
    const render = jest.fn(() => '<p>editor</p>');
    const registered = reg.registerEditors('demo', [
      { id: 'demo.note', title: '笔记', render },
      { id: 'demo.epub', title: 'EPUB', resourceType: 'epub', render },
      { id: 'demo.bad', render: 'not-fn' }, // 缺 render → 跳过
    ]);
    expect(registered).toHaveLength(2);

    const editor = reg.getEditor('demo.note');
    expect(editor).toMatchObject({ id: 'demo.note', pluginId: 'demo', title: '笔记', resourceType: 'note' });
    expect(typeof editor.render).toBe('function');
    expect(reg.getEditor('demo.epub')).toMatchObject({ resourceType: 'epub' });
    expect(reg.getEditor('demo.bad')).toBeNull();
    expect(reg.listEditors()).toHaveLength(2);
  });

  it('registerEditors 重复 ID 跳过', () => {
    const reg = new ExtensionRegistry();
    reg.registerEditors('a', [{ id: 'dup', render: () => 1 }]);
    const reg2 = reg.registerEditors('b', [{ id: 'dup', render: () => 2 }]);
    expect(reg2).toHaveLength(0);
    expect(reg.getEditor('dup').pluginId).toBe('a');
  });

  it('unregisterByPlugin 同时清理面板/编辑器，clear 清空', () => {
    const reg = new ExtensionRegistry();
    reg.registerPanels('a', [{ id: 'a.panel', render: () => 1 }]);
    reg.registerPanels('b', [{ id: 'b.panel', render: () => 2 }]);
    reg.registerEditors('a', [{ id: 'a.editor', render: () => 1 }]);
    reg.registerEditors('b', [{ id: 'b.editor', render: () => 2 }]);
    reg.unregisterByPlugin('a');
    expect(reg.getPanel('a.panel')).toBeNull();
    expect(reg.getPanel('b.panel')).not.toBeNull();
    expect(reg.getEditor('a.editor')).toBeNull();
    expect(reg.getEditor('b.editor')).not.toBeNull();
    expect(reg.count()).toBe(2);
    reg.clear();
    expect(reg.listPanels()).toHaveLength(0);
    expect(reg.listEditors()).toHaveLength(0);
    expect(reg.count()).toBe(0);
  });
});
