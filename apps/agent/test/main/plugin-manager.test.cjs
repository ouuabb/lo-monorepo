const fs = require('fs');
const os = require('os');
const path = require('path');
const { PluginManager } = require('../../src/main/plugin/plugin-manager.cjs');
const { ExtensionRegistry } = require('../../src/main/plugin/extension-registry.cjs');

function makeLoCore() {
  return {
    getStatus: jest.fn(async () => ({ ok: true, stats: { totalResources: 3 } })),
    listNotes: jest.fn(async () => ({ ok: true, data: [] })),
    getNote: jest.fn(async () => ({ ok: true, data: {} })),
    updateNote: jest.fn(async () => ({ ok: true })),
    getRelations: jest.fn(async () => ({ ok: true, data: { outgoing: [], incoming: [] } })),
    listOperations: jest.fn(async () => ({ ok: true, data: [] })),
    undoOperation: jest.fn(async () => ({ ok: true })),
    subscribeEvents: jest.fn(() => ({ ok: true })),
    unsubscribeEvents: jest.fn(() => ({ ok: true })),
    client: {
      auth: { authenticated: true },
      health: { stats: jest.fn(async () => ({ totalResources: 3, totalRelations: 1 })) },
      operations: { execute: jest.fn(), list: jest.fn(), get: jest.fn(), undo: jest.fn() },
      relations: { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
      events: { subscribe: jest.fn(), history: jest.fn() },
      notes: { list: jest.fn(), get: jest.fn() },
      search: { search: jest.fn() },
    },
  };
}

function makePluginsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-plugins-test-'));
  return dir;
}

function writePlugin(dir, id, mainContent) {
  const pluginDir = path.join(dir, id);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({ id, name: id, version: '0.1.0', main: 'index.cjs' }),
  );
  fs.writeFileSync(path.join(pluginDir, 'index.cjs'), mainContent);
  return pluginDir;
}

// 插件入口 require SDK（经 lo-agent node_modules 解析）
const SDK_INDEX = path.join(__dirname, '..', '..', 'node_modules', '@lo', 'agent-plugins-sdk', 'src', 'index.cjs');

describe('PluginManager', () => {
  it('发现并加载插件', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-a', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-a', name: 'Demo A', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;
    `);
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
    });
    await pm.initialize();
    const list = pm.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('demo-a');
    expect(list[0].state).toBe('loaded');
  });

  it('激活插件并注入 ctx.lo 能力，插件可经 Host Adapter 调用 Core', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-b', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-b', name: 'Demo B', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          const stats = await ctx.lo.health.stats();
          this._r = { status: stats, pluginId: ctx.pluginId };
        }
      }
      module.exports = P;
    `);
    const loCore = makeLoCore();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore,
    });
    await pm.initialize();
    await pm.activate('demo-b');
    const plugin = pm.get('demo-b');
    expect(plugin._r).toEqual({ status: { totalResources: 3, totalRelations: 1 }, pluginId: 'demo-b' });
    expect(loCore.client.health.stats).toHaveBeenCalled();
  });

  it('插件无法访问 LoClient 原始实例', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-c', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-c', name: 'Demo C', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          this._hasClient = !!ctx.client;
          this._hasLoCore = !!ctx.loCore;
          this._loKeys = Object.keys(ctx.lo || {});
        }
      }
      module.exports = P;
    `);
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
    });
    await pm.initialize();
    await pm.activate('demo-c');
    const plugin = pm.get('demo-c');
    expect(plugin._hasClient).toBe(false);
    expect(plugin._hasLoCore).toBe(false);
    // ctx.lo 只暴露契约命名空间
    expect(plugin._loKeys.sort()).toEqual(['events', 'health', 'operations', 'relations', 'resources']);
  });

  it('激活失败不阻塞其他插件', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'bad', `
      class P {
        manifest() { return { id: 'bad', name: 'Bad', version: '0.1.0', main: 'index.cjs' }; }
        async activate() { throw new Error('boom'); }
      }
      module.exports = P;
    `);
    writePlugin(dir, 'good', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'good', name: 'Good', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) { this._ok = true; }
      }
      module.exports = P;
    `);
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
    });
    await pm.initialize();
    await pm.activateAll();
    expect(pm.get('good')._ok).toBe(true);
    const list = pm.list();
    expect(list.find((x) => x.id === 'bad').state).toBe('loaded');
  });

  it('deactivate 与 dispose 生命周期', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-c', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-c', name: 'Demo C', version: '0.1.0', main: 'index.cjs' }; }
        async activate() { this._activated = true; }
        async deactivate() { this._deactivated = true; }
        async dispose() { this._disposed = true; }
      }
      module.exports = P;
    `);
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
    });
    await pm.initialize();
    await pm.activate('demo-c');
    await pm.deactivate('demo-c');
    const plugin = pm.get('demo-c');
    expect(plugin._activated).toBe(true);
    expect(plugin._deactivated).toBe(true);
    await pm.dispose('demo-c');
    expect(pm.get('demo-c')).toBeNull();
  });

  it('激活时收集 contributes 注册扩展点，dispose 时清理', async () => {
    const dir = makePluginsDir();
    const pluginDir = writePlugin(dir, 'demo-ext', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-ext', name: 'Demo Ext', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;
    `);
    // 覆写 plugin.json 加 contributes
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'demo-ext',
        name: 'Demo Ext',
        version: '0.1.0',
        main: 'index.cjs',
        contributes: {
          commands: [{ id: 'demo-ext.open', title: '打开' }],
          views: [{ id: 'demo-ext.status', title: '状态', type: 'panel' }],
        },
      }),
    );

    const reg = new ExtensionRegistry();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      extensionRegistry: reg,
    });
    await pm.initialize();
    await pm.activate('demo-ext');

    // 激活后扩展点已注册
    expect(reg.count()).toBe(2);
    expect(reg.list('commands')).toHaveLength(1);
    expect(reg.list('views')).toHaveLength(1);
    const points = reg.listByPlugin('demo-ext');
    expect(points.map((p) => `${p.type}:${p.id}`).sort()).toEqual([
      'commands:demo-ext.open',
      'views:demo-ext.status',
    ]);

    // dispose 后清理
    await pm.dispose('demo-ext');
    expect(reg.count()).toBe(0);
    expect(reg.listByPlugin('demo-ext')).toEqual([]);
  });

  it('executeCommand 调用插件注册的命令 handler', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-cmd', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-cmd', name: 'Demo Cmd', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          ctx.extensions.registerCommands([
            {
              id: 'demo-cmd.hello',
              title: 'Hello',
              handler: async (args, cmdCtx) => {
                const who = args[0] || 'world';
                const cfg = cmdCtx.config('greeting', 'Hi');
                return { message: cfg + ', ' + who + '!', pluginId: cmdCtx.pluginId };
              },
            },
          ]);
        }
      }
      module.exports = P;
    `);
    // 覆写 plugin.json 加 config
    const entry = fs.readdirSync(dir).find((d) => d === 'demo-cmd');
    const pluginDir = path.join(dir, entry);
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'demo-cmd',
        name: 'Demo Cmd',
        version: '0.1.0',
        main: 'index.cjs',
        config: { greeting: { type: 'string', default: '你好' } },
      }),
    );

    const reg = new ExtensionRegistry();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      extensionRegistry: reg,
    });
    await pm.initialize();
    await pm.activate('demo-cmd');

    // 命令已注册
    const cmd = reg.getCommand('demo-cmd.hello');
    expect(cmd).toMatchObject({ id: 'demo-cmd.hello', pluginId: 'demo-cmd' });

    // 执行命令
    const res = await pm.executeCommand('demo-cmd.hello', ['张三']);
    expect(res).toEqual({
      pluginId: 'demo-cmd',
      commandId: 'demo-cmd.hello',
      result: { message: '你好, 张三!', pluginId: 'demo-cmd' },
    });
  });

  it('executeCommand 命令不存在 / 插件未激活时报错', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-noop', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-noop', name: 'Demo Noop', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;
    `);
    const reg = new ExtensionRegistry();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      extensionRegistry: reg,
    });
    await pm.initialize();

    await expect(pm.executeCommand('nope.missing')).rejects.toThrow(/命令不存在/);
    await pm.activate('demo-noop');
    await expect(pm.executeCommand('nope.missing')).rejects.toThrow(/命令不存在/);
  });

  it('插件服务：registerService 注册、getService 消费、disable 清理', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'svc-provider', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'svc-provider', name: 'Svc Provider', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          ctx.extensions.registerService([
            {
              id: 'svc-provider.health',
              title: '健康查询服务',
              version: '1.0.0',
              api: {
                stats: async () => ({ totalResources: 42 }),
                markup: () => 'provider-markup',
              },
            },
          ]);
        }
      }
      module.exports = P;
    `);
    writePlugin(dir, 'svc-consumer', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'svc-consumer', name: 'Svc Consumer', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          this._all = ctx.extensions.listServices().map((s) => s.id);
          this._missing = ctx.extensions.getService('nope.missing');
          const svc = ctx.extensions.getService('svc-provider.health');
          if (svc) {
            this._stats = await svc.stats();
            this._markup = svc.markup();
          } else {
            this._noService = true;
          }
        }
      }
      module.exports = P;
    `);
    const reg = new ExtensionRegistry();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      extensionRegistry: reg,
    });
    await pm.initialize();
    await pm.activate('svc-provider');
    await pm.activate('svc-consumer');

    // 服务已注册，listServices 只暴露元信息
    expect(reg.getService('svc-provider.health')).toMatchObject({
      id: 'svc-provider.health',
      pluginId: 'svc-provider',
      title: '健康查询服务',
      version: '1.0.0',
    });
    expect(pm.listServices()).toEqual([
      { id: 'svc-provider.health', pluginId: 'svc-provider', title: '健康查询服务', version: '1.0.0' },
    ]);

    // 消费插件经 ctx.extensions.getService 拿到提供者 api 并调用成功
    const consumer = pm.get('svc-consumer');
    expect(consumer._noService).toBeUndefined();
    expect(consumer._missing).toBeNull();
    expect(consumer._stats).toEqual({ totalResources: 42 });
    expect(consumer._markup).toBe('provider-markup');
    expect(consumer._all).toEqual(['svc-provider.health']);
    // 消费插件 context 也可直接拿 api（经 ctx.lo 之外的契约门面）
    expect(pm.getService('svc-provider.health').markup()).toBe('provider-markup');

    // disable 提供者 → 服务从注册表移除，消费方再取为 null
    await pm.disable('svc-provider');
    expect(reg.getService('svc-provider.health')).toBeNull();
    expect(pm.listServices()).toEqual([]);
    expect(pm.getService('svc-provider.health')).toBeNull();
  });

  it('面板/编辑器：registerPanel/registerEditor 注册，renderPanel/renderEditor 渲染，disable 清理', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-pe', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-pe', name: 'Demo PE', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          ctx.extensions.registerPanel({
            id: 'demo-pe.side',
            title: '侧栏',
            area: 'sidebar',
            render: async (context, cmdCtx) => '<div class="panel">' + cmdCtx.pluginId + '</div>',
          });
          ctx.extensions.registerEditor({
            id: 'demo-pe.note',
            title: '笔记编辑器',
            resourceType: 'note',
            render: async (context, cmdCtx) => '<div class="editor">' + (context.rid || '') + '</div>',
          });
        }
      }
      module.exports = P;
    `);
    const reg = new ExtensionRegistry();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      extensionRegistry: reg,
    });
    await pm.initialize();
    await pm.activate('demo-pe');

    const panel = reg.getPanel('demo-pe.side');
    expect(panel).toMatchObject({ id: 'demo-pe.side', pluginId: 'demo-pe', area: 'sidebar' });
    const editor = reg.getEditor('demo-pe.note');
    expect(editor).toMatchObject({ id: 'demo-pe.note', pluginId: 'demo-pe', resourceType: 'note' });

    const res = await pm.renderPanel('demo-pe.side', {});
    expect(res).toMatchObject({ pluginId: 'demo-pe', panelId: 'demo-pe.side', title: '侧栏', area: 'sidebar' });
    expect(res.html).toContain('demo-pe');

    const res2 = await pm.renderEditor('demo-pe.note', { rid: 'res_9' });
    expect(res2).toMatchObject({ pluginId: 'demo-pe', editorId: 'demo-pe.note', title: '笔记编辑器', resourceType: 'note' });
    expect(res2.html).toContain('res_9');

    // 未激活时渲染报错
    await pm.disable('demo-pe');
    expect(reg.getPanel('demo-pe.side')).toBeNull();
    expect(reg.getEditor('demo-pe.note')).toBeNull();
    await expect(pm.renderPanel('demo-pe.side', {})).rejects.toThrow(/面板不存在/);
    await expect(pm.renderEditor('demo-pe.note', {})).rejects.toThrow(/编辑器不存在/);
  });

  it('渲染端 UI：getUiModule 读 ui 源码 + worldId 分配 + invokePluginUiCtx 代理 ctx', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-um', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-um', name: 'Demo Um', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          this._r = await ctx.lo.health.stats();
          ctx.extensions.registerCommands([
            { id: 'demo-um.ping', title: 'Ping', handler: async () => 'pong' },
          ]);
        }
      }
      module.exports = P;
    `);
    const pDir = path.join(dir, 'demo-um');
    fs.writeFileSync(
      path.join(pDir, 'plugin.json'),
      JSON.stringify({
        id: 'demo-um', name: 'Demo Um', version: '0.1.0', main: 'index.cjs', ui: 'ui/index.mjs',
      }),
    );
    fs.mkdirSync(path.join(pDir, 'ui'), { recursive: true });
    fs.writeFileSync(
      path.join(pDir, 'ui', 'index.mjs'),
      `export const views = { 'demo-um.v': { render: (el, ctx) => () => {} } };\n`,
    );

    const reg = new ExtensionRegistry();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      extensionRegistry: reg,
    });
    await pm.initialize();
    await pm.activate('demo-um');

    // getUiModule：源码 + worldId（1000+），worldId 稳定复用
    const ui = pm.getUiModule('demo-um');
    expect(ui.source).toContain('render');
    const w1 = ui.worldId;
    expect(w1).toBeGreaterThanOrEqual(1000);
    expect(pm.getUiModule('demo-um').worldId).toBe(w1);

    // invokePluginUiCtx：ctx.lo.health.stats（默认读权限放行）
    const stats = await pm.invokePluginUiCtx({
      pluginId: 'demo-um', target: 'lo', ns: 'health', method: 'stats',
    });
    expect(stats).toEqual({ totalResources: 3, totalRelations: 1 });

    // 未声明写权限 → ctx.lo.operations.execute 被 facade 拒绝
    await expect(
      pm.invokePluginUiCtx({
        pluginId: 'demo-um', target: 'lo', ns: 'operations', method: 'execute', args: ['resource.update', {}],
      }),
    ).rejects.toThrow(/被拒绝/);

    // config 代理
    expect(await pm.invokePluginUiCtx({ pluginId: 'demo-um', target: 'config', method: 'config', args: [] })).toEqual({});

    // executeCommand 代理
    const exec = await pm.invokePluginUiCtx({
      pluginId: 'demo-um', target: 'executeCommand', method: 'execute', args: ['demo-um.ping', []],
    });
    expect(exec.result).toBe('pong');

    // 非法 target / 非法命名空间
    await expect(pm.invokePluginUiCtx({ pluginId: 'demo-um', target: 'bogus', method: 'x' })).rejects.toThrow(/未知 ctx target/);
    await expect(pm.invokePluginUiCtx({ pluginId: 'demo-um', target: 'lo', ns: 'bogus', method: 'x' })).rejects.toThrow(/未知 lo 命名空间/);

    // 禁用 → 未激活拒绝 + worldId 释放（重新分配）
    await pm.disable('demo-um');
    await expect(pm.invokePluginUiCtx({ pluginId: 'demo-um', target: 'lo', ns: 'health', method: 'stats' })).rejects.toThrow(/未激活/);
    expect(pm.getUiWorldId('demo-um')).not.toBe(w1);
  });

  it('渲染端 UI：未声明 ui / ui 路径越界被拒', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'no-ui', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'no-ui', name: 'No UI', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;
    `);
    // 越界 ui：loader 应拒绝加载该插件
    const escDir = path.join(dir, 'escape');
    fs.mkdirSync(escDir, { recursive: true });
    fs.writeFileSync(
      path.join(escDir, 'plugin.json'),
      JSON.stringify({
        id: 'escape', name: 'Escape', version: '0.1.0', main: 'index.cjs', ui: '../escape.mjs',
      }),
    );
    fs.writeFileSync(
      path.join(escDir, 'index.cjs'),
      `const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin { manifest() { return { id: 'escape', name: 'Escape', version: '0.1.0', main: 'index.cjs' }; } activate() {} }
      module.exports = P;`,
    );
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
    });
    await pm.initialize();
    // 越界插件被跳过
    expect(pm.get('escape')).toBeNull();
    // 未声明 ui 的插件 getUiModule 报错
    await pm.activate('no-ui');
    expect(() => pm.getUiModule('no-ui')).toThrow(/未声明 ui/);
  });

  it('延迟激活：activationEvents onCommand/onView 懒激活，activateAll 跳过', async () => {
    const dir = makePluginsDir();
    const pDir = writePlugin(dir, 'lazy-a', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'lazy-a', name: 'Lazy A', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          this._activated = true;
          ctx.extensions.registerCommands([{ id: 'lazy-a.run', title: 'Run', handler: async () => 'ran' }]);
          ctx.extensions.registerView([{ id: 'lazy-a.view', title: 'View', type: 'panel', render: async () => '<p>lazy-view</p>' }]);
        }
      }
      module.exports = P;
    `);
    fs.writeFileSync(
      path.join(pDir, 'plugin.json'),
      JSON.stringify({
        id: 'lazy-a', name: 'Lazy A', version: '0.1.0', main: 'index.cjs',
        activationEvents: ['onCommand:lazy-a.run', 'onView:lazy-a.view'],
        contributes: {
          commands: [{ id: 'lazy-a.run', title: 'Run' }],
          views: [{ id: 'lazy-a.view', title: 'View', type: 'panel' }],
        },
      }),
    );

    const reg = new ExtensionRegistry();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      extensionRegistry: reg,
    });
    await pm.initialize();
    await pm.activateAll();

    // 启动不激活（懒）
    expect(pm.get('lazy-a')._activated).toBeUndefined();
    expect(pm.list().find((x) => x.id === 'lazy-a').state).toBe('loaded');
    expect(reg.getCommand('lazy-a.run')).toBeNull();

    // 执行命令 → onCommand 懒激活 → 重试成功
    const res = await pm.executeCommand('lazy-a.run', []);
    expect(res.result).toBe('ran');
    expect(pm.get('lazy-a')._activated).toBe(true);
    expect(reg.getCommand('lazy-a.run')).not.toBeNull();

    // 渲染视图 → onView 懒激活（已激活则直接渲染）
    const viewRes = await pm.renderView('lazy-a.view', {});
    expect(viewRes.html).toContain('lazy-view');
  });

  it('延迟激活：dependsOn 硬依赖强制先激活延迟插件', async () => {
    const dir = makePluginsDir();
    const svcDir = writePlugin(dir, 'lazy-svc', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'lazy-svc', name: 'Lazy Svc', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          this._activated = true;
          ctx.extensions.registerService([{ id: 'lazy-svc.api', title: 'API', api: { ping: () => 'pong' } }]);
        }
      }
      module.exports = P;
    `);
    fs.writeFileSync(
      path.join(svcDir, 'plugin.json'),
      JSON.stringify({
        id: 'lazy-svc', name: 'Lazy Svc', version: '0.1.0', main: 'index.cjs',
        activationEvents: ['onCommand:lazy-svc.run'],
      }),
    );
    const consumerDir = writePlugin(dir, 'lazy-consumer', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'lazy-consumer', name: 'Lazy Consumer', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          const svc = ctx.extensions.getService('lazy-svc.api');
          this._ping = svc ? svc.ping() : null;
        }
      }
      module.exports = P;
    `);
    fs.writeFileSync(
      path.join(consumerDir, 'plugin.json'),
      JSON.stringify({
        id: 'lazy-consumer', name: 'Lazy Consumer', version: '0.1.0', main: 'index.cjs',
        dependsOn: ['lazy-svc'],
      }),
    );

    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      extensionRegistry: new ExtensionRegistry(),
    });
    await pm.initialize();
    await pm.activateAll();

    // dependsOn 强制懒提供者先激活，消费者 getService 能拿到服务
    expect(pm.get('lazy-svc')._activated).toBe(true);
    expect(pm.get('lazy-consumer')._ping).toBe('pong');
  });

  it('端到端：真实 demo 插件（plugins-demo）跨插件服务消费', async () => {
    const pluginsDemoDir = path.join(__dirname, '..', '..', 'plugins-demo');
    const reg = new ExtensionRegistry();
    const loCore = makeLoCore();
    const pm = new PluginManager({
      pluginsDir: pluginsDemoDir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore,
      extensionRegistry: reg,
    });
    await pm.initialize();
    const ids = pm.list().map((x) => x.id).sort();
    expect(ids).toEqual(['demo-consumer', 'demo-hello']);

    // 依赖拓扑激活：demo-consumer dependsOn demo-hello → 提供者先激活，
    // 即使加载序是字母序（consumer 在前）也能拿到服务
    await pm.activateAll();

    // 消费者激活期已取到提供者 api 并调用成功
    const consumer = pm.get('demo-consumer');
    expect(consumer.result).toEqual({
      available: true,
      greeting: 'Hello from demo plugin',
      status: { totalResources: 3, totalRelations: 1 },
    });
    expect(reg.listServices()).toHaveLength(1);
    expect(reg.listServices()[0].id).toBe('demo-hello.status-service');

    // 真实 demo-hello 同时注册了视图/面板/编辑器（contributes 数据 + 运行时 render）
    expect(reg.getPanel('demo-hello.side')).toMatchObject({ id: 'demo-hello.side', pluginId: 'demo-hello', area: 'sidebar' });
    expect(reg.getEditor('demo-hello.editor')).toMatchObject({ id: 'demo-hello.editor', pluginId: 'demo-hello', resourceType: 'note' });

    const panelRes = await pm.renderPanel('demo-hello.side', {});
    expect(panelRes.html).toContain('侧栏面板');
    const editorRes = await pm.renderEditor('demo-hello.editor', { rid: 'res_e2e' });
    expect(editorRes.html).toContain('res_e2e');

    // mountEl UI：demo-hello 声明 ui → getUiModule 读源码 + worldId；ctx 代理走既有 facade
    const ui = pm.getUiModule('demo-hello');
    expect(ui.source).toContain('export const views');
    expect(ui.worldId).toBeGreaterThanOrEqual(1000);
    const uiStats = await pm.invokePluginUiCtx({
      pluginId: 'demo-hello', target: 'lo', ns: 'health', method: 'stats',
    });
    expect(uiStats).toEqual({ totalResources: 3, totalRelations: 1 });
    // demo-hello 声明了 operations.write → ctx.lo.operations.execute 放行
    loCore.client.operations.execute.mockResolvedValue({ operationId: 'op-ui', result: { ok: true } });
    const uiExec = await pm.invokePluginUiCtx({
      pluginId: 'demo-hello', target: 'lo', ns: 'operations', method: 'execute',
      args: ['resource.update', { rid: 'r1', updates: { name: 'x' } }],
    });
    expect(uiExec).toEqual({ operationId: 'op-ui', result: { ok: true } });

    // 命令面板实时消费同样拿到状态
    const res = await pm.executeCommand('demo-consumer.consume', []);
    expect(res.result.available).toBe(true);
    expect(res.result.status).toEqual({ totalResources: 3, totalRelations: 1 });

    // 停用提供者 → 服务被清理，消费者 getService 降级为不可用（不崩溃）
    await pm.disable('demo-hello');
    expect(reg.listServices()).toHaveLength(0);
    const res2 = await pm.executeCommand('demo-consumer.consume', []);
    expect(res2.result).toEqual({ available: false, reason: '服务不可用: demo-hello.status-service' });
  });

  it('权限模型：未声明写权限的插件调用 ctx.lo 写操作被拒', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-readonly', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-readonly', name: 'Demo ReadOnly', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          // 读操作默认放行
          const stats = await ctx.lo.health.stats();
          // 写操作未声明 → 应抛权限拒绝
          try {
            await ctx.lo.operations.execute('resource.update', { rid: 'r1', updates: {} });
            this._writeDenied = false;
          } catch (e) {
            this._writeDenied = /被拒绝/.test(e.message) || e.message.includes('permissions.lo');
          }
          this._r = { stats };
        }
      }
      module.exports = P;
    `);
    const loCore = makeLoCore();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore,
    });
    await pm.initialize();
    await pm.activate('demo-readonly');
    const plugin = pm.get('demo-readonly');
    expect(plugin._writeDenied).toBe(true);
    // 读操作确实调用到了 client
    expect(loCore.client.health.stats).toHaveBeenCalled();
    // 写操作未透传到 client
    expect(loCore.client.operations.execute).not.toHaveBeenCalled();
  });

  it('权限模型：声明写权限后 ctx.lo 写操作放行', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-write', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-write', name: 'Demo Write', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          const res = await ctx.lo.operations.execute('resource.update', { rid: 'r1', updates: { name: 'x' } });
          this._r = res;
        }
      }
      module.exports = P;
    `);
    // 覆写 plugin.json 加 permissions
    const pluginDir = path.join(dir, 'demo-write');
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'demo-write',
        name: 'Demo Write',
        version: '0.1.0',
        main: 'index.cjs',
        permissions: { lo: ['operations.write'] },
      }),
    );
    const loCore = makeLoCore();
    loCore.client.operations.execute.mockResolvedValue({ operationId: 'op-1', result: { ok: true } });
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore,
    });
    await pm.initialize();
    await pm.activate('demo-write');
    const plugin = pm.get('demo-write');
    expect(plugin._r).toEqual({ operationId: 'op-1', result: { ok: true } });
    expect(loCore.client.operations.execute).toHaveBeenCalledWith(
      'resource.update',
      { rid: 'r1', updates: { name: 'x' } },
    );
  });

  it('enable/disable 调用 plugin 钩子并维护 enabled 状态', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-life', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-life', name: 'Demo Life', version: '0.1.0', main: 'index.cjs' }; }
        async activate() { this._activated = true; }
        async enable() { this._enabledCalled = true; }
        async disable() { this._disabledCalled = true; }
      }
      module.exports = P;
    `);
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
    });
    await pm.initialize();

    const afterEnable = await pm.enable('demo-life');
    const plugin = pm.get('demo-life');
    expect(plugin._activated).toBe(true); // enable 前自动激活
    expect(plugin._enabledCalled).toBe(true);
    expect(afterEnable.enabled).toBe(true);

    const afterDisable = await pm.disable('demo-life');
    expect(plugin._disabledCalled).toBe(true);
    expect(afterDisable.enabled).toBe(false);
  });

  it('ctx.config 合并 manifest 默认值与 plugin-config 用户配置', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-cfg', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-cfg', name: 'Demo Cfg', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) { this._cfg = { all: ctx.config(), a: ctx.config('a'), b: ctx.config('b', 'fallback') }; }
      }
      module.exports = P;
    `);
    const pluginDir = path.join(dir, 'demo-cfg');
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'demo-cfg',
        name: 'Demo Cfg',
        version: '0.1.0',
        main: 'index.cjs',
        config: { a: { type: 'string', default: 'default-a' } },
      }),
    );

    const { PluginStore } = require('../../src/main/plugin/plugin-store.cjs');
    const store = new PluginStore(path.join(dir, 'userdata'));
    store.setPluginConfig('demo-cfg', 'a', 'user-a');

    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      pluginStore: store,
    });
    await pm.initialize();
    await pm.activate('demo-cfg');
    const plugin = pm.get('demo-cfg');
    expect(plugin._cfg.all).toEqual({ a: 'user-a' });
    expect(plugin._cfg.a).toBe('user-a');
    expect(plugin._cfg.b).toBe('fallback');
  });

  it('ctx.settings 沙箱读写经 PluginStore 持久化', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-set', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-set', name: 'Demo Set', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          await ctx.settings.set('token', 'abc');
          this._read = await ctx.settings.get('token');
          this._missing = await ctx.settings.get('nope', 'def');
        }
      }
      module.exports = P;
    `);
    const { PluginStore } = require('../../src/main/plugin/plugin-store.cjs');
    const store = new PluginStore(path.join(dir, 'userdata'));
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      pluginStore: store,
    });
    await pm.initialize();
    await pm.activate('demo-set');
    const plugin = pm.get('demo-set');
    expect(plugin._read).toBe('abc');
    expect(plugin._missing).toBe('def');
    // 持久化到插件私有文件
    expect(store.getPluginSettings('demo-set')).toEqual({ token: 'abc' });
  });

  it('setConfig/getConfig 与 uninstall 清理', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-mgmt', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-mgmt', name: 'Demo Mgmt', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;
    `);
    const { PluginStore } = require('../../src/main/plugin/plugin-store.cjs');
    const store = new PluginStore(path.join(dir, 'userdata'));
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      pluginStore: store,
    });
    await pm.initialize();

    pm.setConfig('demo-mgmt', 'k', 'v');
    expect(pm.getConfig('demo-mgmt')).toEqual({ k: 'v' });

    pm.setSettings('demo-mgmt', 's', 1);
    expect(pm.getSettings('demo-mgmt')).toEqual({ s: 1 });

    await pm.uninstall('demo-mgmt');
    expect(pm.get('demo-mgmt')).toBeNull();
    expect(pm.getConfig('demo-mgmt')).toEqual({});
    expect(pm.getSettings('demo-mgmt')).toEqual({});
  });

  it('renderView 调用插件视图 render 并返回 HTML', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-view', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-view', name: 'Demo View', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          ctx.extensions.registerView([
            {
              id: 'demo-view.status',
              title: '状态',
              type: 'panel',
              render: async (context, cmdCtx) => {
                return '<div class="plugin-status">' + (context.rid || '') + '</div>';
              },
            },
          ]);
        }
      }
      module.exports = P;
    `);
    const reg = new ExtensionRegistry();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      extensionRegistry: reg,
    });
    await pm.initialize();
    await pm.activate('demo-view');

    const view = reg.getView('demo-view.status');
    expect(view).toMatchObject({ id: 'demo-view.status', pluginId: 'demo-view', type: 'panel' });

    const res = await pm.renderView('demo-view.status', { rid: 'res_1' });
    expect(res).toMatchObject({
      pluginId: 'demo-view',
      viewId: 'demo-view.status',
      title: '状态',
      type: 'panel',
    });
    expect(res.html).toContain('res_1');
  });

  it('renderView 视图不存在 / 插件未激活时报错', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-noview', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-noview', name: 'Demo NoView', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;
    `);
    const reg = new ExtensionRegistry();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      extensionRegistry: reg,
    });
    await pm.initialize();

    await expect(pm.renderView('nope.missing')).rejects.toThrow(/视图不存在/);
  });

  it('install 从本地 registry 安装并加载插件', async () => {
    const fs = require('fs');
    const crypto = require('crypto');
    const tar = require('tar');
    const dir = makePluginsDir();
    const registryDir = path.join(dir, 'registry');
    const distDir = path.join(registryDir, 'dist');
    const srcDir = path.join(registryDir, 'packages', 'demo-from-reg');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'index.cjs'),
      `const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-from-reg', name: 'Demo From Reg', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;`,
    );
    fs.writeFileSync(
      path.join(srcDir, 'plugin.json'),
      JSON.stringify({ id: 'demo-from-reg', name: 'Demo From Reg', version: '0.1.0', main: 'index.cjs' }),
    );
    fs.mkdirSync(distDir, { recursive: true });
    const tarball = path.join(distDir, 'demo-from-reg-0.1.0.tar.gz');
    await tar.create(
      { gzip: true, file: tarball, cwd: srcDir, portable: true },
      fs.readdirSync(srcDir),
    );
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(tarball)).digest('hex');
    fs.writeFileSync(
      path.join(registryDir, 'index.json'),
      JSON.stringify([
        { id: 'demo-from-reg', name: 'Demo From Reg', version: '0.1.0', main: 'index.cjs', downloadUrl: 'dist/demo-from-reg-0.1.0.tar.gz', checksum },
      ]),
    );

    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
    });
    await pm.initialize();

    const res = await pm.install('demo-from-reg', registryDir);
    expect(res.id).toBe('demo-from-reg');
    expect(res.state).toBe('loaded');

    await pm.activate('demo-from-reg');
    const plugin = pm.get('demo-from-reg');
    expect(plugin).toBeTruthy();
  });

  it('listForUi 返回策展插件清单（不透传 main 等内部字段）', async () => {
    const dir = makePluginsDir();
    const pluginDir = writePlugin(dir, 'demo-ui', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-ui', name: 'Demo UI', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;
    `);
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'demo-ui',
        name: 'Demo UI',
        version: '0.1.0',
        main: 'index.cjs',
        description: 'UI 演示插件',
        author: 'lo',
        dependsOn: ['demo-base'],
        permissions: { lo: ['health.read'] },
        contributes: { commands: [{ id: 'demo-ui.open', title: '打开' }] },
        config: { title: { type: 'string', default: '你好' } },
      }),
    );

    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
    });
    await pm.initialize();

    const ui = pm.listForUi();
    expect(ui).toHaveLength(1);
    expect(ui[0]).toEqual({
      id: 'demo-ui',
      name: 'Demo UI',
      version: '0.1.0',
      description: 'UI 演示插件',
      author: 'lo',
      state: 'loaded',
      enabled: false,
      dependsOn: ['demo-base'],
      permissions: { lo: ['health.read'] },
      contributes: { commands: [{ id: 'demo-ui.open', title: '打开' }] },
      config: { title: { type: 'string', default: '你好' } },
    });
    expect('main' in ui[0]).toBe(false);
    expect('manifest' in ui[0]).toBe(false);
  });

  it('disable 完全禁用（清理扩展点并停用），重新 enable 恢复注册', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-tog', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-tog', name: 'Demo Tog', version: '0.1.0', main: 'index.cjs' }; }
        async activate(ctx) {
          ctx.extensions.registerCommands([{ id: 'demo-tog.hello', title: 'Hello', handler: async () => 'hi' }]);
          ctx.extensions.registerView([{ id: 'demo-tog.status', title: '状态', type: 'panel', render: async () => '<p>x</p>' }]);
        }
      }
      module.exports = P;
    `);
    const reg = new ExtensionRegistry();
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      extensionRegistry: reg,
    });
    await pm.initialize();
    await pm.enable('demo-tog');
    expect(reg.count()).toBe(2);
    expect(reg.getCommand('demo-tog.hello')).not.toBeNull();

    const afterDisable = await pm.disable('demo-tog');
    expect(afterDisable.enabled).toBe(false);
    expect(afterDisable.state).toBe('deactivated');
    expect(reg.count()).toBe(0);
    expect(reg.getCommand('demo-tog.hello')).toBeNull();
    expect(reg.getView('demo-tog.status')).toBeNull();

    // 重新启用恢复注册
    await pm.enable('demo-tog');
    expect(reg.count()).toBe(2);
    expect(reg.getCommand('demo-tog.hello')).not.toBeNull();
    expect(reg.getView('demo-tog.status')).not.toBeNull();
  });

  it('uninstall 删除插件目录与配置', async () => {
    const dir = makePluginsDir();
    writePlugin(dir, 'demo-rm', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'demo-rm', name: 'Demo Rm', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;
    `);
    const { PluginStore } = require('../../src/main/plugin/plugin-store.cjs');
    const store = new PluginStore(path.join(dir, 'userdata'));
    const pm = new PluginManager({
      pluginsDir: dir,
      hostRequireBase: path.join(__dirname, '..', '..', 'src', 'main'),
      loCore: makeLoCore(),
      pluginStore: store,
    });
    await pm.initialize();
    const pluginDir = path.join(dir, 'demo-rm');
    expect(fs.existsSync(pluginDir)).toBe(true);

    pm.setConfig('demo-rm', 'k', 'v');
    await pm.uninstall('demo-rm');

    expect(pm.get('demo-rm')).toBeNull();
    expect(fs.existsSync(pluginDir)).toBe(false);
    expect(pm.getConfig('demo-rm')).toEqual({});
  });
});
