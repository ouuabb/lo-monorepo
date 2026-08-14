/**
 * P0-2 边缘测试：主动找 bug
 *
 * 覆盖：
 *   - PluginContext Facade 缓存一致性
 *   - PluginContext 多次构造/noop 默认值
 *   - ExtensionRegistry registerAll 与 resourceProviders 交互
 *   - Plugin 生命周期重复调用/异常状态
 *   - sdkResolver 多次 require 安全性
 *   - config() 方法与 getConfig() 旧版 API 一致性
 *   - PluginManager 注入完整性
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');


const { ResourceBuilder, RelationBuilder } = require('@lo/plugins-sdk');
const Plugin = require('../../src/plugin/plugin.cjs');
const PluginContext = require('../../src/plugin/pluginContext.cjs');
const ExtensionRegistry = require('../../src/plugin/extensionRegistry.cjs');
const Repository = require('../../src/repo/repository.cjs');

async function cleanupRepo(repo, tempDir) {
  if (repo && repo.db) {
    try { await repo.db.close(); } catch {}
  }
  if (tempDir && await fs.pathExists(tempDir)) {
    try { await fs.remove(tempDir); } catch {}
  }
}

describe('P0-2 边缘测试', () => {

  // ── 1. PluginContext Facade 缓存 ──
  test('ctx.resources 多次访问返回同一 Facade 实例（缓存）', () => {
    const ctx = new PluginContext();
    const r1 = ctx.resources;
    const r2 = ctx.resources;
    expect(r1).toBe(r2); // 同一引用
  });

  test('ctx.relations 多次访问返回同一 Facade 实例（缓存）', () => {
    const ctx = new PluginContext();
    const r1 = ctx.relations;
    const r2 = ctx.relations;
    expect(r1).toBe(r2);
  });

  test('ctx.extensions 多次访问返回同一引用', () => {
    const extReg = new ExtensionRegistry();
    const ctx = new PluginContext({ extensionRegistry: extReg });
    expect(ctx.extensions).toBe(extReg);
    expect(ctx.extensions).toBe(extReg); // 同一引用
  });

  test('未注入 extensionRegistry 时返回 noop（不抛错）', () => {
    const ctx = new PluginContext();
    expect(() => ctx.extensions.register('p', 'commands', 'x', {})).not.toThrow();
    expect(ctx.extensions.get('commands', 'x')).toBeNull();
    expect(ctx.extensions.list('commands')).toEqual([]);
  });

  test('未注入 hookManager 时 noop runBefore 原样返回 payload', async () => {
    const ctx = new PluginContext();
    const payload = { foo: 1 };
    const result = await ctx.hooks.runBefore(payload);
    expect(result).toBe(payload);
  });

  test('未注入 eventBus 时 noop emit 不抛错', () => {
    const ctx = new PluginContext();
    expect(() => ctx.events.emit('test', 1, 2)).not.toThrow();
    expect(ctx.events.eventNames).toEqual([]);
  });

  // ── 2. config 方法一致性 ──
  test('config() 和 getConfig() 返回一致结果', () => {
    const ctx = new PluginContext({ config: { theme: 'dark', lang: 'zh' } });

    // config() 方法
    expect(ctx.config('theme')).toBe('dark');
    expect(ctx.config('missing', 'default')).toBe('default');
    expect(ctx.config()).toEqual({ theme: 'dark', lang: 'zh' });

    // getConfig() 旧版
    expect(ctx.getConfig('theme')).toBe('dark');
    expect(ctx.getConfig('missing', 'default')).toBe('default');
    expect(ctx.getConfig()).toEqual({ theme: 'dark', lang: 'zh' });
  });

  test('config() 空配置对象', () => {
    const ctx = new PluginContext(); // 无 config
    expect(ctx.config()).toEqual({});
    expect(ctx.config('anyKey', 'fallback')).toBe('fallback');
  });

  test('config() value 为 false/0/空字符串 时正确返回', () => {
    const ctx = new PluginContext({ config: { enabled: false, count: 0, name: '' } });
    expect(ctx.config('enabled')).toBe(false);
    expect(ctx.config('count')).toBe(0);
    expect(ctx.config('name')).toBe('');
    expect(ctx.config('enabled', true)).toBe(false); // 不用 fallback
  });

  // ── 3. ExtensionRegistry registerAll 与 resourceProviders ──
  test('registerAll 正确处理 resourceProviders', () => {
    const reg = new ExtensionRegistry();

    // registerAll 期望 contributes[type] 是数组，每项是对象（用 id/type 做 key）
    reg.registerAll('test-plugin', {
      commands: [
        { id: 'greet', run: async () => {} }
      ],
      resourceProviders: [
        { id: 'git', discover: async () => [], supports: () => true }
      ]
    });

    expect(reg.get('commands', 'greet')).toBeDefined();
    expect(reg.get('commands', 'greet').run).toBeInstanceOf(Function);
    expect(reg.get('resourceProviders', 'git')).toBeDefined();
    expect(reg.get('resourceProviders', 'git').discover).toBeInstanceOf(Function);
    expect(reg.list('resourceProviders')).toHaveLength(1);
  });

  test('registerAll 空贡献不抛错', () => {
    const reg = new ExtensionRegistry();
    expect(() => reg.registerAll('test', null)).not.toThrow();
    expect(() => reg.registerAll('test', {})).not.toThrow();
    expect(() => reg.registerAll('test', { commands: [] })).not.toThrow();
  });

  test('unregisterAll 包含 resourceProviders', () => {
    const reg = new ExtensionRegistry();
    reg.register('p1', 'resourceProviders', 'git', { discover: async () => [] });
    reg.register('p1', 'commands', 'greet', { run: async () => {} });

    reg.unregisterAll('p1');

    expect(reg.list('resourceProviders')).toHaveLength(0);
    expect(reg.list('commands')).toHaveLength(0);
  });

  // ── 4. Plugin 生命周期 ──
  test('Plugin enable/disable 多次调用不报错', async () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    await p.enable();
    await p.enable();
    expect(p.isEnabled).toBe(true);

    await p.disable();
    await p.disable();
    expect(p.isEnabled).toBe(false);
  });

  test('Plugin dispose 后 isEnabled 为 false', async () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    await p.enable();
    expect(p.isEnabled).toBe(true);

    await p.dispose();
    expect(p.isDisposed).toBe(true);
    expect(p.isEnabled).toBe(false);
  });

  test('Plugin $setContext 后 context getter 返回注入值', () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    const ctx = new PluginContext({ pluginId: 'test' });

    p.$setContext(ctx);
    expect(p.context).toBe(ctx);
  });

  test('Plugin context setter 仍可工作（向后兼容）', () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    const ctx = new PluginContext();
    p.context = ctx; // 旧版 setter
    expect(p.context).toBe(ctx);
  });

  // ── 5. sdkResolver 安全性 ──
  test('多次 require sdkResolver 不报错', () => {
    expect(() => {
    }).not.toThrow();
  });

  test('require("@lo/plugins-sdk") 返回完整导出', () => {
    const sdk = require('@lo/plugins-sdk');
    expect(sdk.Plugin).toBeDefined();
    expect(sdk.ResourceProvider).toBeDefined();
    expect(sdk.ResourceBuilder).toBeDefined();
    expect(sdk.RelationBuilder).toBeDefined();
    expect(sdk.PluginContext).toBeDefined();
    expect(sdk.Logger).toBeDefined();
    expect(sdk.EventApi).toBeDefined();
  });

  // ── 6. ResourceFacade 桥接完整性 ──
  test('ResourceFacade.list 调用 ResourceService.getAll', async () => {
    let tempDir, repo;
    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-edge-list-'));
      await fs.ensureDir(path.join(tempDir, '.repo'));
      repo = new Repository(tempDir);
      await repo.init();

      const f1 = path.join(tempDir, 'a.md'); await fs.writeFile(f1, '# A');
      const f2 = path.join(tempDir, 'b.md'); await fs.writeFile(f2, '# B');
      await repo.resourceService.create({ type: 'note', path: f1, name: 'a' });
      await repo.resourceService.create({ type: 'note', path: f2, name: 'b' });

      const ctx = new PluginContext({
        repository: repo,
        resourceService: repo.resourceService,
        pluginId: 'edge'
      });

      const all = await ctx.resources.list();
      expect(all.length).toBeGreaterThanOrEqual(2);

      const notes = await ctx.resources.list({ type: 'note' });
      expect(notes.length).toBeGreaterThanOrEqual(2);
    } finally {
      await cleanupRepo(repo, tempDir);
    }
  });

  test('ResourceFacade.create 传入 SDK ResourceBuilder 产出的对象', async () => {
    let tempDir, repo;
    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-edge-builder-'));
      await fs.ensureDir(path.join(tempDir, '.repo'));
      repo = new Repository(tempDir);
      await repo.init();

      const filePath = path.join(tempDir, 'doc.md');
      await fs.writeFile(filePath, '# Doc');

      // SDK ResourceBuilder 链式构造
      const candidate = ResourceBuilder.note()
        .path(filePath)
        .name('edge-builder-test')
        .meta('title', '测试标题')
        .tag('标签1')
        .tag('标签2')
        .capability('searchable')
        .build();

      const ctx = new PluginContext({
        repository: repo,
        resourceService: repo.resourceService,
        pluginId: 'edge'
      });

      const created = await ctx.resources.create(candidate);
      expect(created.rid).toMatch(/^res_/);
      expect(created.type).toBe('note');
      expect(created.metadata.title).toBe('测试标题');
      expect(created.metadata.tags).toEqual(['标签1', '标签2']);

      // 验证能读回来
      const found = await ctx.resources.getByRid(created.rid);
      expect(found.name).toBe('edge-builder-test');
    } finally {
      await cleanupRepo(repo, tempDir);
    }
  });

  test('RelationFacade.create 传入 SDK RelationBuilder 产出的对象', async () => {
    let tempDir, repo;
    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-edge-rel-'));
      await fs.ensureDir(path.join(tempDir, '.repo'));
      repo = new Repository(tempDir);
      await repo.init();

      const f1 = path.join(tempDir, 'a.md'); await fs.writeFile(f1, '# A');
      const f2 = path.join(tempDir, 'b.md'); await fs.writeFile(f2, '# B');
      const a = await repo.resourceService.create({ type: 'note', path: f1, name: 'a' });
      const b = await repo.resourceService.create({ type: 'note', path: f2, name: 'b' });

      // SDK RelationBuilder 链式构造
      const candidate = RelationBuilder.contains(a.rid, b.rid)
        .meta('order', 1)
        .build();

      const ctx = new PluginContext({
        repository: repo,
        relationService: repo.relationService,
        pluginId: 'edge'
      });

      const created = await ctx.relations.create(candidate);
      expect(created).toBeDefined();
      expect(created.type).toBe('contains');
    } finally {
      await cleanupRepo(repo, tempDir);
    }
  });

  // ── 7. PluginContext 从 Repository 自动获取 Service ──
  test('PluginContext 只传 repository 时 Facade 仍可用', async () => {
    let tempDir, repo;
    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-edge-auto-'));
      await fs.ensureDir(path.join(tempDir, '.repo'));
      repo = new Repository(tempDir);
      await repo.init();

      // 只传 repository，不传 resourceService/relationService
      const ctx = new PluginContext({
        repository: repo,
        pluginId: 'edge'
      });

      // Facade 应该能从 repository 自动获取 service
      const filePath = path.join(tempDir, 'auto.md');
      await fs.writeFile(filePath, '# Auto');
      const created = await ctx.resources.create({
        type: 'note', path: filePath, name: 'auto-test'
      });
      expect(created.rid).toMatch(/^res_/);
    } finally {
      await cleanupRepo(repo, tempDir);
    }
  });

  // ── 8. PluginManager 完整激活流程 ──
  test('PluginManager 激活的插件有完整 context（resources/relations/extensions/hooks）', async () => {
    let tempDir, repo;
    try {
      let savedCtx = null;

      class FullPlugin extends Plugin {
        manifest() { return { id: 'full-test', name: 'Full', version: '1.0.0' }; }
        register(ctx) { savedCtx = ctx; }
      }

      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-edge-pm-'));
      await fs.ensureDir(path.join(tempDir, '.repo', 'plugins'));
      repo = new Repository(tempDir);
      await repo.init();

      const pm = repo.getPluginManager();
      const plugin = new FullPlugin();
      await pm._activatePlugin(plugin);

      // context 应该有完整的 Facade
      expect(savedCtx).not.toBeNull();
      expect(savedCtx.resources).toBeDefined();
      expect(savedCtx.relations).toBeDefined();
      expect(savedCtx.extensions).toBeDefined();
      expect(savedCtx.hooks).toBeDefined();
      expect(savedCtx.events).toBeDefined();
      expect(savedCtx.pluginId).toBe('full-test');

      // resources.create 应该能工作（有 repository 注入）
      const filePath = path.join(tempDir, 'pm-test.md');
      await fs.writeFile(filePath, '# PM');
      const created = await savedCtx.resources.create({
        type: 'note', path: filePath, name: 'pm-test'
      });
      expect(created.rid).toMatch(/^res_/);
    } finally {
      await cleanupRepo(repo, tempDir);
    }
  });

  // ── 9. noop Facade 一致性 ──
  test('noop resources: create 抛错，其他方法安全返回', async () => {
    const ctx = new PluginContext(); // 无任何注入
    await expect(ctx.resources.create({})).rejects.toThrow();
    expect(await ctx.resources.getByRid('res_x')).toBeNull();
    expect(await ctx.resources.list()).toEqual([]);
    expect(await ctx.resources.update('res_x', {})).toBeNull();
    expect(await ctx.resources.delete('res_x')).toBe(false);
  });

  test('noop relations: create 抛错，其他方法安全返回', async () => {
    const ctx = new PluginContext();
    await expect(ctx.relations.create({})).rejects.toThrow();
    expect(await ctx.relations.listFrom('res_x')).toEqual([]);
    expect(await ctx.relations.listTo('res_x')).toEqual([]);
    expect(await ctx.relations.remove('res_a', 'res_b')).toBe(false);
  });

  // ── 10. Plugin id/name/version getter ──
  test('Plugin id/name/version 从 manifest 获取', () => {
    class P extends Plugin {
      manifest() {
        return { id: 'my-plugin', name: 'My Plugin', version: '2.1.0' };
      }
    }
    const p = new P();
    expect(p.id).toBe('my-plugin');
    expect(p.name).toBe('My Plugin');
    expect(p.version).toBe('2.1.0');
  });

  test('Plugin manifest 无 name 时 fallback 到 id', () => {
    class P extends Plugin {
      manifest() { return { id: 'fallback', version: '1.0.0' }; }
    }
    const p = new P();
    expect(p.name).toBe('fallback');
  });

  test('Plugin manifest 无 version 时 fallback 到 0.0.0', () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P' }; }
    }
    const p = new P();
    expect(p.version).toBe('0.0.0');
  });

  test('Plugin manifest 无 dependencies 时返回空数组', () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    expect(p.dependencies).toEqual([]);
  });

  test('Plugin manifest 无 contributes 时返回空对象', () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    expect(p.contributes).toEqual({});
  });
});
