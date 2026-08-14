/**
 * P0-3 边缘测试：主动找 bug
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

describe('P0-3 边缘测试', () => {
  let tempDir, repo, ds;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-p03edge-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    repo = new Repository(tempDir);
    await repo.init();
    ds = repo.getDiscoveryService();
  });

  afterEach(async () => {
    await cleanupRepo(repo, tempDir);
  });

  // ── 1. beforeResourceCreate Hook 修改 candidate ──
  test('beforeResourceCreate Hook 可以修改 candidate 的 name', async () => {
    const f1 = path.join(tempDir, 'note.md'); await fs.writeFile(f1, '# Test');

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('p', 'resourceProviders', 'mock', {
      async discover() {
        return [ResourceBuilder.note().path(f1).name('original').build()];
      },
      supports() { return true; }
    });

    const hooks = repo.getPluginHookManager();
    hooks.register('plugin:beforeResourceCreate', async (payload) => {
      const modified = { ...payload.candidate, name: 'modified-by-hook' };
      return { ...payload, candidate: modified };
    });

    const result = await ds.discover('mock', tempDir);

    expect(result.resources.length).toBe(1);
    expect(result.resources[0].name).toBe('modified-by-hook');
  });

  // ── 2. provider.watch 返回 undefined（无 stop 函数）不报错 ──
  test('watch 返回 undefined 时 stopWatch 不抛错', async () => {
    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('p', 'resourceProviders', 'mock', {
      async discover() { return []; },
      supports() { return true; },
      async watch(source, onChange) {
        // 不返回 stop 函数
      }
    });

    await ds.watch('mock', tempDir);
    // stopWatch 不应抛错
    await expect(ds.stopWatch('mock')).resolves.not.toThrow();
  });

  // ── 3. 多个 provider 同时注册 ──
  test('多个 provider 同时注册可分别调用', async () => {
    const f1 = path.join(tempDir, 'a.md'); await fs.writeFile(f1, '# A');
    const f2 = path.join(tempDir, 'b.md'); await fs.writeFile(f2, '# B');

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('p1', 'resourceProviders', 'provider-a', {
      async discover() {
        return [ResourceBuilder.note().path(f1).name('from-a').build()];
      },
      supports() { return true; }
    });
    extReg.register('p2', 'resourceProviders', 'provider-b', {
      async discover() {
        return [ResourceBuilder.note().path(f2).name('from-b').build()];
      },
      supports() { return true; }
    });

    const resultA = await ds.discover('provider-a', tempDir);
    const resultB = await ds.discover('provider-b', tempDir);

    expect(resultA.resources.length).toBe(1);
    expect(resultA.resources[0].name).toBe('from-a');
    expect(resultB.resources.length).toBe(1);
    expect(resultB.resources[0].name).toBe('from-b');
  });

  // ── 4. discover 空候选数组 ──
  test('discover 返回空数组时正常完成', async () => {
    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('p', 'resourceProviders', 'mock', {
      async discover() { return []; },
      supports() { return true; }
    });

    const result = await ds.discover('mock', tempDir);

    expect(result.candidates).toEqual([]);
    expect(result.resources).toEqual([]);
    expect(result.relations).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  // ── 5. discover 返回 null（非数组） ──
  test('discover 返回 null 时当作空数组处理', async () => {
    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('p', 'resourceProviders', 'mock', {
      async discover() { return null; },
      supports() { return true; }
    });

    const result = await ds.discover('mock', tempDir);

    expect(result.candidates).toEqual([]);
    expect(result.resources).toEqual([]);
  });

  // ── 6. afterResourceCreate Hook 链式传递 ──
  test('多个 afterResourceCreate Hook 依次执行', async () => {
    const f1 = path.join(tempDir, 'note.md'); await fs.writeFile(f1, '# Test');
    const order = [];

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('p', 'resourceProviders', 'mock', {
      async discover() {
        return [ResourceBuilder.note().path(f1).name('test').build()];
      },
      supports() { return true; }
    });

    const hooks = repo.getPluginHookManager();
    hooks.register('plugin:afterResourceCreate', async (payload) => {
      order.push('first');
      return payload;
    });
    hooks.register('plugin:afterResourceCreate', async (payload) => {
      order.push('second');
      return payload;
    });

    await ds.discover('mock', tempDir);

    expect(order).toEqual(['first', 'second']);
  });

  // ── 7. afterDiscover Hook 返回 null 时不影响 candidates ──
  test('afterDiscover Hook 返回 null 时 candidates 不变', async () => {
    const f1 = path.join(tempDir, 'note.md'); await fs.writeFile(f1, '# Test');

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('p', 'resourceProviders', 'mock', {
      async discover() {
        return [ResourceBuilder.note().path(f1).name('test').build()];
      },
      supports() { return true; }
    });

    const hooks = repo.getPluginHookManager();
    hooks.register('plugin:afterDiscover', async () => null);

    const result = await ds.discover('mock', tempDir);

    // afterDiscover 返回 null 不应清空 candidates
    expect(result.resources.length).toBe(1);
  });

  // ── 8. 关系候选 + 资源候选混合 ──
  test('资源候选和关系候选混合时分别处理', async () => {
    const f1 = path.join(tempDir, 'a.md'); await fs.writeFile(f1, '# A');
    const f2 = path.join(tempDir, 'b.md'); await fs.writeFile(f2, '# B');

    // 预创建资源用于关系
    const a = await repo.resourceService.create({ type: 'note', path: f1, name: 'a' });
    const b = await repo.resourceService.create({ type: 'note', path: f2, name: 'b' });

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('p', 'resourceProviders', 'mock', {
      async discover() {
        const f3 = path.join(tempDir, 'c.md');
        await fs.writeFile(f3, '# C');
        return [
          { invalid: 'object' },  // 无法识别 → skipped
          ResourceBuilder.note().path(f3).name('new-note').build(),  // 资源
          RelationBuilder.contains(a.rid, b.rid).build(),  // 关系
        ];
      },
      supports() { return true; }
    });

    const result = await ds.discover('mock', tempDir);

    expect(result.resources.length).toBe(1);
    expect(result.relations.length).toBe(1);
    expect(result.skipped.length).toBe(1);
  });

  // ── 9. HookManager runAfter 向后兼容 ──
  test('runAfter 无监听器时返回原始 payload', async () => {
    const HookManager = require('../../src/plugin/hookManager.cjs');
    const hm = new HookManager();
    const payload = { foo: 1 };
    const result = await hm.runAfter('nonexistent', payload);
    expect(result).toBe(payload);
  });

  test('runAfter 有监听器但不返回值时 payload 不变', async () => {
    const HookManager = require('../../src/plugin/hookManager.cjs');
    const hm = new HookManager();
    const payload = { foo: 1 };
    hm.register('test', async () => { /* no return */ });
    const result = await hm.runAfter('test', payload);
    expect(result).toBe(payload);
  });

  // ── 10. stopAllWatchers ──
  test('stopAllWatchers 停止所有活跃监听', async () => {
    const extReg = repo.getPluginExtensionRegistry();
    const active = new Set();

    extReg.register('p1', 'resourceProviders', 'a', {
      async discover() { return []; },
      supports() { return true; },
      async watch(source, onChange) {
        active.add('a');
        return () => { active.delete('a'); };
      }
    });
    extReg.register('p2', 'resourceProviders', 'b', {
      async discover() { return []; },
      supports() { return true; },
      async watch(source, onChange) {
        active.add('b');
        return () => { active.delete('b'); };
      }
    });

    await ds.watch('a', tempDir);
    await ds.watch('b', tempDir);
    expect(active.size).toBe(2);

    await ds.stopAllWatchers();
    expect(active.size).toBe(0);
  });

  // ── 11. 重复 watch 同一 provider 先停旧的 ──
  test('重复 watch 同一 provider 先停止旧监听', async () => {
    let oldStopped = false;

    const extReg = repo.getPluginExtensionRegistry();
    extReg.register('p', 'resourceProviders', 'mock', {
      async discover() { return []; },
      supports() { return true; },
      async watch(source, onChange) {
        return () => { oldStopped = true; };
      }
    });

    await ds.watch('mock', tempDir);
    await ds.watch('mock', tempDir); // 应先停旧的

    expect(oldStopped).toBe(true);
  });
});
