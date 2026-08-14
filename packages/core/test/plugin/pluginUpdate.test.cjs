/**
 * P1-3 updatePlugin 测试
 *
 * 验证插件更新流程：
 *   1. 远程版本更高 → 卸载(保留配置) → 重装 → 配置自动保留
 *   2. 版本相同 → upToDate=true（跳过）
 *   3. 当前版本更高 → upToDate=true（版本比较方向正确）
 *   4. 未加载插件 → 抛错
 *   5. 远程无此插件 → 抛错
 *
 * 间接覆盖 _compareVersions 的版本比较逻辑。
 *
 * 依赖：与 lo-plugins 仓库同级目录（../lo-plugins），复用 build.cjs 真实打包。
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');


const Repository = require('../../src/repo/repository.cjs');
const { buildPlugin } = require(path.resolve('..', '..', 'plugins', 'core', 'scripts', 'build.cjs'));

const PLUGIN_DIR = path.resolve('..', '..', 'plugins', 'core', 'packages', 'chrome-translate');
const PLUGIN_ID = 'chrome-translate';

async function cleanupRepo(repo, tempDir) {
  if (repo && repo.db) {
    try { await repo.db.close(); } catch {}
  }
  if (tempDir && await fs.pathExists(tempDir)) {
    try { await fs.remove(tempDir); } catch {}
  }
}

/**
 * 构造本地 Plugin Repository：复制 tarball + 写 index.json（可指定 version 覆盖）
 *
 * 注意：用复制后文件的实际 sha256 覆盖 entry.checksum，防止并行测试套件
 * 共享 buildDir 导致 buildPlugin 覆盖 tar.gz 后 checksum 不匹配的竞态。
 */
async function buildLocalRegistry(registryDir, entry, buildDir, versionOverride) {
  const tarballSrc = path.join(buildDir, entry.downloadUrl);
  const dest = path.join(registryDir, entry.downloadUrl);
  await fs.copy(tarballSrc, dest);

  // 用实际文件的 checksum（避免并行覆盖竞态）
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(await fs.readFile(dest));
  const actualChecksum = hash.digest('hex');

  const indexEntry = { ...entry, checksum: actualChecksum };
  if (versionOverride) indexEntry.version = versionOverride;
  await fs.writeFile(
    path.join(registryDir, 'index.json'),
    JSON.stringify([indexEntry])
  );
  return `file://${  path.join(registryDir, 'index.json').replace(/\\/g, '/')}`;
}

describe('P1-3 updatePlugin', () => {
  let tempDir, registryDir, repo, baseEntry, registryUrl;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-update-'));
    registryDir = path.join(tempDir, 'registry');
    await fs.ensureDir(registryDir);
    await fs.ensureDir(path.join(tempDir, '.repo'));

    repo = new Repository(tempDir);
    await repo.init();

    // 真实打包 chrome-translate（v0.1.0）— 输出到 tempDir 避免并行竞态
    baseEntry = await buildPlugin(PLUGIN_DIR, tempDir);
    // 构造 registry（version 保持真实 v0.1.0）
    registryUrl = await buildLocalRegistry(registryDir, baseEntry, tempDir);

    // 安装基线版本
    await repo.installPlugin(PLUGIN_ID, { registryUrl });
  });

  afterEach(async () => {
    await cleanupRepo(repo, tempDir);
  });

  test('远程版本更高 → 更新 + 配置自动保留', async () => {
    // 设置配置（验证更新后是否保留）
    await repo.setPluginConfig(PLUGIN_ID, 'exportFilePath', '/persist/on/update.json');
    expect((await repo.getPluginConfig(PLUGIN_ID)).exportFilePath).toBe('/persist/on/update.json');

    // 改 registry version 为更高版本（tar.gz 内容不变，仅触发更新流程）
    registryUrl = await buildLocalRegistry(registryDir, baseEntry, tempDir, '0.9.0');

    const result = await repo.updatePlugin(PLUGIN_ID, { registryUrl });
    expect(result.upToDate).toBe(false);
    expect(result.currentVersion).toBe(baseEntry.version);
    expect(result.newVersion).toBe('0.9.0');

    // 配置保留
    const cfg = await repo.getPluginConfig(PLUGIN_ID);
    expect(cfg.exportFilePath).toBe('/persist/on/update.json');

    // 插件重新加载激活
    const pm = repo.getPluginManager();
    expect(pm.getPlugin(PLUGIN_ID)).toBeDefined();
  });

  test('版本相同 → upToDate=true（跳过）', async () => {
    // registry version 保持 v0.1.0（与已安装相同）
    const result = await repo.updatePlugin(PLUGIN_ID, { registryUrl });
    expect(result.upToDate).toBe(true);
    expect(result.currentVersion).toBe(baseEntry.version);
  });

  test('当前版本更高 → upToDate=true（版本比较方向正确）', async () => {
    // registry version 改为更低版本
    registryUrl = await buildLocalRegistry(registryDir, baseEntry, tempDir, '0.0.1');
    const result = await repo.updatePlugin(PLUGIN_ID, { registryUrl });
    expect(result.upToDate).toBe(true);
  });

  test('未加载插件 → 抛错', async () => {
    await repo.uninstallPlugin(PLUGIN_ID, { deleteFiles: true });
    await expect(repo.updatePlugin(PLUGIN_ID, { registryUrl }))
      .rejects.toThrow(/not found/);
  });

  test('远程仓库无此插件 → 抛错', async () => {
    // 构造空 registry
    await fs.writeFile(path.join(registryDir, 'index.json'), JSON.stringify([]));
    const emptyUrl = `file://${  path.join(registryDir, 'index.json').replace(/\\/g, '/')}`;
    await expect(repo.updatePlugin(PLUGIN_ID, { registryUrl: emptyUrl }))
      .rejects.toThrow(/不在插件仓库中/);
  });

  test('下载失败 → 旧版本保留（安全回滚）', async () => {
    // 设置配置（验证失败后是否保留）
    await repo.setPluginConfig(PLUGIN_ID, 'exportFilePath', '/keep/old.json');

    // 构造坏 registry：version 更高但 downloadUrl 指向不存在的文件
    const badEntry = { ...baseEntry, version: '0.9.0', downloadUrl: 'nonexistent.tar.gz' };
    await fs.writeFile(path.join(registryDir, 'index.json'), JSON.stringify([badEntry]));
    const badUrl = `file://${  path.join(registryDir, 'index.json').replace(/\\/g, '/')}`;

    // updatePlugin 应抛错（下载阶段失败）
    await expect(repo.updatePlugin(PLUGIN_ID, { registryUrl: badUrl }))
      .rejects.toThrow();

    // 旧版本仍在 registry（未卸载）
    const pm = repo.getPluginManager();
    expect(pm.getPlugin(PLUGIN_ID)).toBeDefined();

    // 配置仍在
    const cfg = await repo.getPluginConfig(PLUGIN_ID);
    expect(cfg.exportFilePath).toBe('/keep/old.json');

    // 插件文件仍在
    expect(await fs.pathExists(path.join(tempDir, '.repo', 'plugins', PLUGIN_ID, 'plugin.json'))).toBe(true);
  });

  test('加载失败(loader.load 抛错) → 回滚恢复旧版本', async () => {
    // 设置配置（验证回滚后是否保留）
    await repo.setPluginConfig(PLUGIN_ID, 'exportFilePath', '/recover.json');

    // 改 registry version 更高（触发更新流程）
    registryUrl = await buildLocalRegistry(registryDir, baseEntry, tempDir, '0.9.0');

    // mock loader.load：第一次（新版本）抛错，第二次（回滚恢复旧版本）正常
    // 此场景 newPlugin=null，回滚跳过"清理新插件注册"分支
    const pm = repo.getPluginManager();
    const originalLoad = pm.loader.load.bind(pm.loader);
    let loadCallCount = 0;
    pm.loader.load = async (dir) => {
      loadCallCount++;
      if (loadCallCount === 1) throw new Error('模拟新版本加载失败');
      return originalLoad(dir);
    };

    try {
      await expect(repo.updatePlugin(PLUGIN_ID, { registryUrl }))
        .rejects.toThrow('模拟新版本加载失败');

      // 旧版本已恢复到 registry
      expect(pm.getPlugin(PLUGIN_ID)).toBeDefined();

      // 配置保留
      const cfg = await repo.getPluginConfig(PLUGIN_ID);
      expect(cfg.exportFilePath).toBe('/recover.json');

      // 插件文件恢复
      expect(await fs.pathExists(path.join(tempDir, '.repo', 'plugins', PLUGIN_ID, 'plugin.json'))).toBe(true);

      // 备份目录已清理（无 .bak 残留）
      const entries = await fs.readdir(path.join(tempDir, '.repo', 'plugins'));
      expect(entries.some((e) => e.includes('.bak-'))).toBe(false);
    } finally {
      pm.loader.load = originalLoad;
    }
  });

  test('_activatePlugin 失败 → 回滚恢复旧版本 + 清理新插件注册', async () => {
    // 设置配置（验证回滚后是否保留）
    await repo.setPluginConfig(PLUGIN_ID, 'exportFilePath', '/keep.json');

    // 改 registry version 更高（触发更新流程）
    registryUrl = await buildLocalRegistry(registryDir, baseEntry, tempDir, '0.9.0');

    // mock _activatePlugin：第一次（新版本激活）抛错，第二次（回滚恢复旧版本激活）正常
    // 此场景与 loader.load 失败不同：newPlugin 已赋值，回滚需走"清理新插件注册"分支
    const pm = repo.getPluginManager();
    const originalActivate = pm._activatePlugin.bind(pm);
    let activateCallCount = 0;
    pm._activatePlugin = async (plugin) => {
      activateCallCount++;
      if (activateCallCount === 1) throw new Error('模拟激活失败');
      return originalActivate(plugin);
    };

    try {
      await expect(repo.updatePlugin(PLUGIN_ID, { registryUrl }))
        .rejects.toThrow('模拟激活失败');

      // 旧版本恢复（回滚后重新加载+激活）
      const plugin = pm.getPlugin(PLUGIN_ID);
      expect(plugin).toBeDefined();
      expect(plugin.version).toBe(baseEntry.version);

      // 配置保留
      const cfg = await repo.getPluginConfig(PLUGIN_ID);
      expect(cfg.exportFilePath).toBe('/keep.json');

      // 备份目录已清理（无 .bak 残留）
      const entries = await fs.readdir(path.join(tempDir, '.repo', 'plugins'));
      expect(entries.some((e) => e.includes('.bak-'))).toBe(false);
    } finally {
      pm._activatePlugin = originalActivate;
    }
  });

  test('unloadPlugin 失败 → 抛错且旧版本文件/配置保留', async () => {
    await repo.setPluginConfig(PLUGIN_ID, 'exportFilePath', '/keep.json');
    registryUrl = await buildLocalRegistry(registryDir, baseEntry, tempDir, '0.9.0');

    // mock plugin.dispose 抛错（让 unloadPlugin 失败）
    const pm = repo.getPluginManager();
    const plugin = pm.getPlugin(PLUGIN_ID);
    plugin.dispose = async () => { throw new Error('模拟 dispose 失败'); };

    await expect(repo.updatePlugin(PLUGIN_ID, { registryUrl }))
      .rejects.toThrow('模拟 dispose 失败');

    // 旧版本文件仍在（backupDir=null，未进入清理逻辑）
    expect(await fs.pathExists(path.join(tempDir, '.repo', 'plugins', PLUGIN_ID, 'plugin.json'))).toBe(true);

    // 配置仍在
    const cfg = await repo.getPluginConfig(PLUGIN_ID);
    expect(cfg.exportFilePath).toBe('/keep.json');
  });

  test('备份 fs.move 失败 → 抛错且旧版本文件保留（backupDir 不赋值）', async () => {
    registryUrl = await buildLocalRegistry(registryDir, baseEntry, tempDir, '0.9.0');

    // mock fs.move 第一次调用（备份 pluginDir → backupDir）失败
    const fsExtra = require('fs-extra');
    const moveSpy = jest.spyOn(fsExtra, 'move');
    moveSpy.mockImplementationOnce(async () => { throw new Error('模拟 move 失败'); });

    try {
      await expect(repo.updatePlugin(PLUGIN_ID, { registryUrl }))
        .rejects.toThrow('模拟 move 失败');

      // 旧版本文件仍在（backupDir 未赋值，回滚跳过清理，不会误删 pluginDir）
      // 注：unloadPlugin 已执行(插件从 registry 移除)，但文件保留可手动 reload 恢复
      // 注：配置在 DB 保留（unloadPlugin deleteFiles=false 不删配置，由其他测试覆盖）
      expect(await fs.pathExists(path.join(tempDir, '.repo', 'plugins', PLUGIN_ID, 'plugin.json'))).toBe(true);
    } finally {
      moveSpy.mockRestore();
    }
  });

  test('_moveContents 失败 → 回滚恢复旧版本', async () => {
    await repo.setPluginConfig(PLUGIN_ID, 'exportFilePath', '/keep.json');
    registryUrl = await buildLocalRegistry(registryDir, baseEntry, tempDir, '0.9.0');

    // mock fs.move：备份(dest含.bak-)和回滚(src含.bak-)真实执行，_moveContents 失败
    const fsExtra = require('fs-extra');
    const realMove = fsExtra.move.bind(fsExtra);
    const moveSpy = jest.spyOn(fsExtra, 'move').mockImplementation(async (src, dest, opts) => {
      const s = String(src), d = String(dest);
      if (d.includes('.bak-') || s.includes('.bak-')) return realMove(src, dest, opts);
      throw new Error('模拟 move 失败');
    });

    try {
      await expect(repo.updatePlugin(PLUGIN_ID, { registryUrl }))
        .rejects.toThrow('模拟 move 失败');

      // 旧版本恢复（回滚后重新加载）
      const pm = repo.getPluginManager();
      const plugin = pm.getPlugin(PLUGIN_ID);
      expect(plugin).toBeDefined();
      expect(plugin.version).toBe(baseEntry.version);

      // 配置保留
      const cfg = await repo.getPluginConfig(PLUGIN_ID);
      expect(cfg.exportFilePath).toBe('/keep.json');

      // 备份目录已清理（无 .bak 残留）
      const entries = await fs.readdir(path.join(tempDir, '.repo', 'plugins'));
      expect(entries.some((e) => e.includes('.bak-'))).toBe(false);
    } finally {
      moveSpy.mockRestore();
    }
  });

  test('_installDependencies 失败 → 回滚恢复旧版本', async () => {
    await repo.setPluginConfig(PLUGIN_ID, 'exportFilePath', '/keep.json');
    registryUrl = await buildLocalRegistry(registryDir, baseEntry, tempDir, '0.9.0');

    const pm = repo.getPluginManager();
    const original = pm._installDependencies.bind(pm);
    pm._installDependencies = async () => { throw new Error('模拟依赖安装失败'); };

    try {
      await expect(repo.updatePlugin(PLUGIN_ID, { registryUrl }))
        .rejects.toThrow('模拟依赖安装失败');

      // 旧版本恢复（回滚后重新加载）
      const plugin = pm.getPlugin(PLUGIN_ID);
      expect(plugin).toBeDefined();
      expect(plugin.version).toBe(baseEntry.version);

      // 配置保留
      const cfg = await repo.getPluginConfig(PLUGIN_ID);
      expect(cfg.exportFilePath).toBe('/keep.json');

      // 备份目录已清理（无 .bak 残留）
      const entries = await fs.readdir(path.join(tempDir, '.repo', 'plugins'));
      expect(entries.some((e) => e.includes('.bak-'))).toBe(false);
    } finally {
      pm._installDependencies = original;
    }
  });
});

describe('P1-3 _compareVersions 边界', () => {
  const { compareVersions } = require('../../src/plugin/pluginManager.cjs');

  test('版本相同 → 0', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  test('远程更高 → 负数（当前 < 远程）', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0); // 数字比较非字符串
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  test('当前更高 → 正数（当前 > 远程）', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });

  test('缺位补 0：1.0 == 1.0.0', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1', '1.0.0')).toBe(0);
  });

  test('空字符串/undefined → 视为 0', () => {
    expect(compareVersions('', '1.0.0')).toBeLessThan(0);
    expect(compareVersions(undefined, '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', undefined)).toBeGreaterThan(0);
    expect(compareVersions(undefined, undefined)).toBe(0);
  });

  test('非数字段 → 视为 0', () => {
    expect(compareVersions('1.0.abc', '1.0.0')).toBe(0);
  });

  test('预发布版本不支持（1.0.0-beta 视为 1.0.0）', () => {
    // 已知限制：parseInt('0-beta') = 0，预发布标签被忽略
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(0);
  });
});
