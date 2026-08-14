/**
 * P0-2 集成测试：SDK ↔ lo Core 打通验证
 *
 * 验证：
 *   1. require('@lo/plugins-sdk') 能正确解析到 lo-plugins-sdk 项目
 *   2. SDK 的 Plugin 基类可与 lo 的 PluginManager 配合
 *   3. SDK 的 ResourceProvider 可注册到 resourceProviders 扩展点
 *   4. PluginContext 的 Facade（resources/relations）能桥接到 ResourceService
 *   5. $setContext() 注入顺序正确
 *   6. 向后兼容：旧插件使用 getRepository() 仍可工作
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// 安装 SDK 模块解析

// 从 SDK 导入
const {
  Plugin: SdkPlugin,
  ResourceProvider,
  ResourceBuilder,
  RelationBuilder
} = require('@lo/plugins-sdk');

// 从 lo Core 导入
const Plugin = require('../../src/plugin/plugin.cjs');
const PluginContext = require('../../src/plugin/pluginContext.cjs');
const ExtensionRegistry = require('../../src/plugin/extensionRegistry.cjs');
const Repository = require('../../src/repo/repository.cjs');

// Windows SQLite 文件锁定问题：需要在 afterEach 中关闭 db
async function cleanupRepo(repo, tempDir) {
  if (repo && repo.db) {
    try { await repo.db.close(); } catch {}
  }
  if (tempDir && await fs.pathExists(tempDir)) {
    try { await fs.remove(tempDir); } catch {}
  }
}

describe('P0-2: SDK ↔ lo Core 打通', () => {

  // ── 1. @lo/plugins-sdk 模块解析 ──
  test('require("@lo/plugins-sdk") 能解析到 lo-plugins-sdk 项目', () => {
    expect(SdkPlugin).toBeDefined();
    expect(ResourceProvider).toBeDefined();
    expect(ResourceBuilder).toBeDefined();
    expect(RelationBuilder).toBeDefined();
  });

  // ── 2. SDK Plugin 与 lo Plugin 接口一致 ──
  test('lo Plugin 基类有 $setContext() 和 isEnabled/isDisposed', () => {
    class MyPlugin extends Plugin {
      manifest() {
        return { id: 'test', name: 'Test', version: '1.0.0' };
      }
    }
    const p = new MyPlugin();
    expect(typeof p.$setContext).toBe('function');
    expect(p.isEnabled).toBe(false);
    expect(p.isDisposed).toBe(false);
  });

  test('lo Plugin register() 默认空实现不抛错', () => {
    class MyPlugin extends Plugin {
      manifest() { return { id: 'test', name: 'Test', version: '1.0.0' }; }
    }
    const p = new MyPlugin();
    expect(() => p.register(new PluginContext())).not.toThrow();
  });

  // ── 3. PluginContext Facade ──
  test('PluginContext 有 SDK 风格 getter', () => {
    const ctx = new PluginContext();
    expect(ctx.extensions).toBeDefined();
    expect(ctx.hooks).toBeDefined();
    expect(ctx.events).toBeDefined();
    expect(ctx.resources).toBeDefined();
    expect(ctx.relations).toBeDefined();
    expect(ctx.config).toBeInstanceOf(Function);
  });

  test('PluginContext noop resources.create 抛错提示在 lo 仓库中运行', async () => {
    const ctx = new PluginContext(); // 未注入任何 service
    await expect(ctx.resources.create({})).rejects.toThrow(/未注入.*lo 仓库/);
  });

  test('PluginContext noop relations.listFrom 安全返回空数组', async () => {
    const ctx = new PluginContext();
    const result = await ctx.relations.listFrom('res_x');
    expect(result).toEqual([]);
  });

  test('PluginContext 旧版 getRepository() 仍可用', () => {
    const fakeRepo = { id: 'fake' };
    const ctx = new PluginContext({ repository: fakeRepo });
    expect(ctx.getRepository()).toBe(fakeRepo);
  });

  test('PluginContext 旧版 getExtensionRegistry() 仍可用', () => {
    const extReg = new ExtensionRegistry();
    const ctx = new PluginContext({ extensionRegistry: extReg });
    expect(ctx.getExtensionRegistry()).toBe(extReg);
  });

  // ── 4. ExtensionRegistry 有 resourceProviders 扩展点 ──
  test('ExtensionRegistry 支持 resourceProviders 扩展点', () => {
    const reg = new ExtensionRegistry();
    // 能注册
    reg.register('test-plugin', 'resourceProviders', 'git', {
      discover: async () => [],
      supports: () => true
    });
    // 能获取
    const provider = reg.get('resourceProviders', 'git');
    expect(provider).toBeDefined();
    expect(typeof provider.discover).toBe('function');
    // 能列出
    const list = reg.list('resourceProviders');
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe('git');
  });

  // ── 5. ResourceProvider 注册到 ExtensionRegistry ──
  test('SDK ResourceProvider 可注册到 lo ExtensionRegistry', () => {
    class GitProvider extends ResourceProvider {
      manifest() { return { id: 'git', name: 'Git', version: '1.0.0', role: 'discovery' }; }
      async discover() { return []; }
    }

    const provider = new GitProvider();
    const extReg = new ExtensionRegistry();
    const ctx = new PluginContext({ pluginId: 'git', extensionRegistry: extReg });

    // SDK 注入顺序
    provider.$setContext(ctx);
    provider.register(ctx);

    // 验证注册成功
    const registered = extReg.get('resourceProviders', 'git');
    expect(registered).toBeDefined();
    expect(typeof registered.discover).toBe('function');
    expect(typeof registered.supports).toBe('function');
  });

  // ── 6. PluginManager 端到端激活 ──
  test('PluginManager 用 $setContext() 激活插件', async () => {
    let contextInjectedBeforeRegister = false;
    let tempDir, repo;

    try {
      class TestPlugin extends Plugin {
        manifest() { return { id: 'e2e-test', name: 'E2E Test', version: '1.0.0' }; }
        register(ctx) {
          // register 时 context 应该已经被 $setContext 注入
          contextInjectedBeforeRegister = (this.context !== null);
        }
      }

      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-p02-'));
      await fs.ensureDir(path.join(tempDir, '.repo', 'plugins'));

      repo = new Repository(tempDir);
      await repo.init();

      const pm = repo.getPluginManager();
      // 手动注册插件（绕过 Loader 的文件扫描）
      const plugin = new TestPlugin();
      await pm._activatePlugin(plugin);

      expect(contextInjectedBeforeRegister).toBe(true);
      expect(plugin.isEnabled).toBe(true);
      expect(plugin.state).toBe('enabled');
    } finally {
      await cleanupRepo(repo, tempDir);
    }
  });

  // ── 7. PluginContext resources Facade 桥接到 ResourceService ──
  test('PluginContext.resources.create 桥接到 ResourceService', async () => {
    let tempDir, repo;

    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-p02-facade-'));
      await fs.ensureDir(path.join(tempDir, '.repo'));

      repo = new Repository(tempDir);
      await repo.init();

      // 用 Repository 的 resourceService 构建 PluginContext
      const ctx = new PluginContext({
        repository: repo,
        resourceService: repo.resourceService,
        relationService: repo.relationService,
        pluginId: 'facade-test'
      });

      // 创建资源
      const filePath = path.join(tempDir, 'test.md');
      await fs.writeFile(filePath, '# Test');
      const created = await ctx.resources.create({
        type: 'note',
        path: filePath,
        name: 'facade-test-note'
      });

      expect(created.rid).toMatch(/^res_/);

      // 读取
      const found = await ctx.resources.getByRid(created.rid);
      expect(found.name).toBe('facade-test-note');

      // 更新
      const updated = await ctx.resources.update(created.rid, {
        metadata: { title: 'Updated' }
      });
      expect(updated.metadata.title).toBe('Updated');

      // 列表（ResourceService.getAll）
      const list = await ctx.resources.list();
      expect(list.length).toBeGreaterThanOrEqual(1);

      // 删除
      await ctx.resources.delete(created.rid, true);
      const deleted = await ctx.resources.getByRid(created.rid);
      expect(deleted).toBeNull();
    } finally {
      await cleanupRepo(repo, tempDir);
    }
  });

  // ── 8. PluginContext relations Facade 桥接到 RelationService ──
  test('PluginContext.relations.create 桥接到 RelationService', async () => {
    let tempDir, repo;

    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-p02-rel-'));
      await fs.ensureDir(path.join(tempDir, '.repo'));

      repo = new Repository(tempDir);
      await repo.init();

      const ctx = new PluginContext({
        repository: repo,
        resourceService: repo.resourceService,
        relationService: repo.relationService,
        pluginId: 'rel-test'
      });

      // 创建两个资源
      const f1 = path.join(tempDir, 'a.md'); await fs.writeFile(f1, '# A');
      const f2 = path.join(tempDir, 'b.md'); await fs.writeFile(f2, '# B');
      const a = await ctx.resources.create({ type: 'note', path: f1, name: 'a' });
      const b = await ctx.resources.create({ type: 'note', path: f2, name: 'b' });

      // 创建关系
      const rel = await ctx.relations.create({
        from_rid: a.rid,
        to_rid: b.rid,
        type: 'reference'
      });
      expect(rel).toBeDefined();
      expect(rel.type).toBe('reference');
    } finally {
      await cleanupRepo(repo, tempDir);
    }
  });

  // ── 9. SDK ResourceBuilder 产出可被 ResourceService 消费 ──
  test('SDK ResourceBuilder.build() 产出的对象可被 ResourceService.create() 消费', async () => {
    let tempDir, repo;

    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-p02-builder-'));
      await fs.ensureDir(path.join(tempDir, '.repo'));

      repo = new Repository(tempDir);
      await repo.init();

      const filePath = path.join(tempDir, 'built.md');
      await fs.writeFile(filePath, '# Built');

      // 用 SDK 的 ResourceBuilder 构造候选对象
      const candidate = ResourceBuilder.note()
        .path(filePath)
        .name('builder-test')
        .meta('title', 'From Builder')
        .tag('test')
        .build();

      // 用 PluginContext.resources.create 消费
      const ctx = new PluginContext({
        repository: repo,
        resourceService: repo.resourceService,
        pluginId: 'builder-test'
      });

      const created = await ctx.resources.create(candidate);
      expect(created.rid).toMatch(/^res_/);
      expect(created.type).toBe('note');
      expect(created.name).toBe('builder-test');
      expect(created.metadata.title).toBe('From Builder');
      expect(created.metadata.tags).toEqual(['test']);
    } finally {
      await cleanupRepo(repo, tempDir);
    }
  });

  // ── 10. 向后兼容：旧插件用 getRepository() 仍可工作 ──
  test('旧插件使用 getRepository() 仍可正常工作', async () => {
    let tempDir, repo;

    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-p02-compat-'));
      await fs.ensureDir(path.join(tempDir, '.repo'));

      repo = new Repository(tempDir);
      await repo.init();

      const ctx = new PluginContext({
        repository: repo,
        pluginId: 'compat-test'
      });

      // 旧版 API
      const r = ctx.getRepository();
      expect(r).toBe(repo);

      // 旧版 getConfig
      const ctx2 = new PluginContext({ config: { theme: 'dark' } });
      expect(ctx2.getConfig('theme')).toBe('dark');
      expect(ctx2.getConfig('missing', 'default')).toBe('default');
    } finally {
      await cleanupRepo(repo, tempDir);
    }
  });
});
