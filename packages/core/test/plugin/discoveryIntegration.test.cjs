/**
 * P0-3 集成测试：ResourceProvider 发现管道端到端验证
 *
 * 验证：
 *   1. DiscoveryService 基本流程：provider.discover → candidates → Core 写入
 *   2. dryRun 模式：只发现不写入
 *   3. Hook 埋点：beforeDiscover/afterDiscover/beforeResourceCreate/afterResourceCreate
 *   4. 关系候选：discover 返回的关系被写入 RelationService
 *   5. watch 增量监听：onChange 触发写入
 *   6. 错误处理：不支持的 source / 无 provider
 *   7. Repository.getDiscoveryService() 集成
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');


const { ResourceBuilder, RelationBuilder } = require('@lo/plugins-sdk');
const Repository = require('../../src/repo/repository.cjs');

async function cleanupRepo(repo, tempDir) {
  if (repo && repo.db) {
    try { await repo.db.close(); } catch {}
  }
  if (tempDir && await fs.pathExists(tempDir)) {
    try { await fs.remove(tempDir); } catch {}
  }
}

describe('P0-3: ResourceProvider 发现管道', () => {
  let tempDir, repo, ds;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-p03-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    repo = new Repository(tempDir);
    await repo.init();
    ds = repo.getDiscoveryService();
  });

  afterEach(async () => {
    await cleanupRepo(repo, tempDir);
  });

  // ── 1. 基本 discover 流程 ──
  test('discover 返回资源候选 → 写入 ResourceService', async () => {
    // 创建测试文件
    const f1 = path.join(tempDir, 'note1.md'); await fs.writeFile(f1, '# Note 1');
    const f2 = path.join(tempDir, 'note2.md'); await fs.writeFile(f2, '# Note 2');

    // 注册 mock provider
    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover(ctx, source) {
        return [
          ResourceBuilder.note().path(f1).name('note1').build(),
          ResourceBuilder.note().path(f2).name('note2').build(),
        ];
      },
      supports(source) { return true; }
    });

    const result = await ds.discover('mock', tempDir);

    expect(result.candidates.length).toBe(2);
    expect(result.resources.length).toBe(2);
    expect(result.resources[0].rid).toMatch(/^res_/);
    expect(result.resources[0].name).toBe('note1');
    expect(result.resources[1].name).toBe('note2');
    expect(result.errors.length).toBe(0);
  });

  // ── 2. dryRun 模式 ──
  test('dryRun 模式只发现不写入', async () => {
    const f1 = path.join(tempDir, 'note.md'); await fs.writeFile(f1, '# Test');

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover() {
        return [ResourceBuilder.note().path(f1).name('test').build()];
      },
      supports() { return true; }
    });

    const result = await ds.discover('mock', tempDir, { dryRun: true });

    expect(result.candidates.length).toBe(1);
    expect(result.resources.length).toBe(0); // 未写入

    // 验证数据库中没有名为 'test' 的资源
    const all = await repo.resourceService.getAll();
    const found = all.find(r => r.name === 'test');
    expect(found).toBeUndefined();
  });

  // ── 3. Hook: beforeDiscover / afterDiscover ──
  test('beforeDiscover Hook 可以取消发现', async () => {
    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover() {
        return [ResourceBuilder.note().name('test').build()];
      },
      supports() { return true; }
    });

    const hooks = repo.getPluginHookManager();
    hooks.register('plugin:beforeDiscover', async () => null); // 取消

    const result = await ds.discover('mock', tempDir);

    expect(result.cancelled).toBe(true);
    expect(result.resources.length).toBe(0);
  });

  test('beforeDiscover Hook 可以修改 source', async () => {
    let receivedSource = null;

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover(ctx, source) {
        receivedSource = source;
        return [];
      },
      supports() { return true; }
    });

    const hooks = repo.getPluginHookManager();
    hooks.register('plugin:beforeDiscover', async (payload) => {
      return { ...payload, source: `${payload.source  }/modified` };
    });

    await ds.discover('mock', tempDir);

    expect(receivedSource).toBe(`${tempDir  }/modified`);
  });

  test('afterDiscover Hook 可以修改 candidates', async () => {
    const f1 = path.join(tempDir, 'note.md'); await fs.writeFile(f1, '# Test');

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover() {
        return [ResourceBuilder.note().path(f1).name('original').build()];
      },
      supports() { return true; }
    });

    const hooks = repo.getPluginHookManager();
    hooks.register('plugin:afterDiscover', async (payload) => {
      // 替换为另一个 candidate
      const modified = ResourceBuilder.note().path(f1).name('hooked').build();
      return { ...payload, candidates: [modified] };
    });

    const result = await ds.discover('mock', tempDir);

    expect(result.resources.length).toBe(1);
    expect(result.resources[0].name).toBe('hooked');
  });

  // ── 4. Hook: beforeResourceCreate / afterResourceCreate ──
  test('beforeResourceCreate Hook 可以取消单个资源创建', async () => {
    const f1 = path.join(tempDir, 'a.md'); await fs.writeFile(f1, '# A');
    const f2 = path.join(tempDir, 'b.md'); await fs.writeFile(f2, '# B');

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover() {
        return [
          ResourceBuilder.note().path(f1).name('a').build(),
          ResourceBuilder.note().path(f2).name('b').build(),
        ];
      },
      supports() { return true; }
    });

    const hooks = repo.getPluginHookManager();
    // 取消 name === 'a' 的创建
    hooks.register('plugin:beforeResourceCreate', async (payload) => {
      if (payload.candidate.name === 'a') return null;
      return payload;
    });

    const result = await ds.discover('mock', tempDir);

    expect(result.resources.length).toBe(1);
    expect(result.resources[0].name).toBe('b');
    expect(result.skipped.length).toBe(1);
  });

  test('afterResourceCreate Hook 被调用', async () => {
    const created = [];
    const f1 = path.join(tempDir, 'note.md'); await fs.writeFile(f1, '# Test');

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover() {
        return [ResourceBuilder.note().path(f1).name('test').build()];
      },
      supports() { return true; }
    });

    const hooks = repo.getPluginHookManager();
    hooks.register('plugin:afterResourceCreate', async (payload) => {
      created.push(payload.resource.name);
    });

    await ds.discover('mock', tempDir);

    expect(created).toEqual(['test']);
  });

  // ── 5. 关系候选 ──
  test('discover 返回关系候选 → 写入 RelationService', async () => {
    const f1 = path.join(tempDir, 'a.md'); await fs.writeFile(f1, '# A');
    const f2 = path.join(tempDir, 'b.md'); await fs.writeFile(f2, '# B');

    // 先创建两个资源
    const a = await repo.resourceService.create({ type: 'note', path: f1, name: 'a' });
    const b = await repo.resourceService.create({ type: 'note', path: f2, name: 'b' });

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover() {
        return [
          RelationBuilder.contains(a.rid, b.rid).meta('order', 1).build()
        ];
      },
      supports() { return true; }
    });

    const result = await ds.discover('mock', tempDir);

    expect(result.relations.length).toBe(1);
    expect(result.relations[0].type).toBe('contains');
  });

  test('混合返回资源和关系候选', async () => {
    const f1 = path.join(tempDir, 'a.md'); await fs.writeFile(f1, '# A');
    const f2 = path.join(tempDir, 'b.md'); await fs.writeFile(f2, '# B');

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover() {
        // 先返回资源候选
        const resA = ResourceBuilder.note().path(f1).name('a').build();
        const resB = ResourceBuilder.note().path(f2).name('b').build();
        // 注意：关系需要已存在的 rid，这里先返回资源
        return [resA, resB];
      },
      supports() { return true; }
    });

    const result = await ds.discover('mock', tempDir);

    expect(result.resources.length).toBe(2);
    expect(result.relations.length).toBe(0);
  });

  // ── 6. watch 增量监听 ──
  test('watch 启动后 onChange 触发写入', async () => {
    const f1 = path.join(tempDir, 'note.md'); await fs.writeFile(f1, '# Test');

    const extReg = repo.getPluginExtensionRegistry();
    let onChangeCallback = null;
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover() { return []; },
      supports() { return true; },
      async watch(source, onChange) {
        onChangeCallback = onChange;
        return () => { onChangeCallback = null; }; // stop function
      }
    });

    // 启动 watch
    await ds.watch('mock', tempDir);

    // 模拟变更
    expect(onChangeCallback).not.toBeNull();
    await onChangeCallback([
      ResourceBuilder.note().path(f1).name('watched').build()
    ]);

    // 验证写入
    const all = await repo.resourceService.getAll();
    const found = all.find(r => r.name === 'watched');
    expect(found).toBeDefined();

    // 停止
    await ds.stopWatch('mock');
  });

  test('stopWatch 后不再接收变更', async () => {
    const extReg = repo.getPluginExtensionRegistry();
    let onChangeCallback = null;
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover() { return []; },
      supports() { return true; },
      async watch(source, onChange) {
        onChangeCallback = onChange;
        return () => { onChangeCallback = null; };
      }
    });

    await ds.watch('mock', tempDir);
    await ds.stopWatch('mock');

    expect(onChangeCallback).toBeNull();
  });

  // ── 7. 错误处理 ──
  test('未注册的 provider 抛错', async () => {
    await expect(ds.discover('nonexistent', tempDir)).rejects.toThrow(/未注册/);
  });

  test('provider 不支持 source 时抛错', async () => {
    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('test-plugin', 'resourceProviders', 'git', {
      async discover() { return []; },
      supports(source) { return source.startsWith('git://'); }
    });

    await expect(ds.discover('git', '/local/path')).rejects.toThrow(/不支持/);
  });

  test('单个 candidate 创建失败不影响其他', async () => {
    const f1 = path.join(tempDir, 'valid.md'); await fs.writeFile(f1, '# Valid');

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('test-plugin', 'resourceProviders', 'mock', {
      async discover() {
        return [
          ResourceBuilder.note().path(f1).name('valid').build(),
          { invalid: 'candidate' }, // 无效候选
        ];
      },
      supports() { return true; }
    });

    const result = await ds.discover('mock', tempDir);

    expect(result.resources.length).toBe(1);
    expect(result.skipped.length).toBe(1); // 无效候选被跳过
  });

  // ── 8. listProviders ──
  test('listProviders 返回已注册的 providers', async () => {
    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('p1', 'resourceProviders', 'git', { discover: async () => [] });
    extReg.register('p2', 'resourceProviders', 'epub', { discover: async () => [] });

    const providers = ds.listProviders();
    expect(providers.length).toBe(2);
    expect(providers[0].key).toBe('git');
    expect(providers[1].key).toBe('epub');
  });

  test('listProviders 空时返回空数组', () => {
    const providers = ds.listProviders();
    expect(providers).toEqual([]);
  });

  // ── 9. getProvider ──
  test('getProvider 返回指定 provider', () => {
    const extReg = repo.getPluginExtensionRegistry();
    const mockProvider = { discover: async () => [] };
    extReg.register('p1', 'resourceProviders', 'git', mockProvider);

    const found = ds.getProvider('git');
    expect(found).toBe(mockProvider);
  });

  test('getProvider 不存在时返回 null', () => {
    expect(ds.getProvider('nonexistent')).toBeNull();
  });

  // ── 10. Repository 集成 ──
  test('Repository.getDiscoveryService() 返回同一实例（懒缓存）', () => {
    const ds1 = repo.getDiscoveryService();
    const ds2 = repo.getDiscoveryService();
    expect(ds1).toBe(ds2);
  });
});
