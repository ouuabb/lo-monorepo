/**
 * P2 插件错误隔离测试
 *
 * 验证 initialize() 循环中单个插件激活失败不阻塞其他插件：
 *   1. 坏插件 initialize 抛错 → 跳过，好插件正常
 *   2. 坏插件 enable 抛错 → 跳过，好插件正常
 *   3. 多个坏插件 → 全部跳过，好插件正常
 *   4. 坏插件半注册状态已清理（不在 registry/extensions/lifecycle/contexts）
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
 * 构造本地 Plugin Repository（复制后重算 checksum 防并行竞态）
 * @param {string} registryDir — registry 输出目录
 * @param {object} entry       — buildPlugin 返回的 index 条目
 * @param {string} buildDir    — buildPlugin 的 outputDir（tarball 所在目录）
 */
async function buildLocalRegistry(registryDir, entry, buildDir) {
  const tarballSrc = path.join(buildDir, entry.downloadUrl);
  const dest = path.join(registryDir, entry.downloadUrl);
  await fs.copy(tarballSrc, dest);

  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(await fs.readFile(dest));
  const actualChecksum = hash.digest('hex');

  const indexEntry = { ...entry, checksum: actualChecksum };
  await fs.writeFile(path.join(registryDir, 'index.json'), JSON.stringify([indexEntry]));
  return `file://${  path.join(registryDir, 'index.json').replace(/\\/g, '/')}`;
}

/**
 * 在 pluginsDir 下创建一个坏插件目录
 * @param {string} pluginsDir — .repo/plugins/ 路径
 * @param {string} id — 插件 ID
 * @param {string} failMethod — 'initialize' 或 'enable'
 */
async function createBadPlugin(pluginsDir, id, failMethod) {
  const dir = path.join(pluginsDir, id);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({
    id, name: id, version: '0.0.1', main: 'index.cjs',
  }));
  await fs.writeFile(path.join(dir, 'index.cjs'), `
    const { Plugin } = require('@lo/plugins-sdk');
    class P extends Plugin {
      manifest() { return { id: '${id}', name: '${id}', version: '0.0.1' }; }
      register() { ${failMethod === 'register' ? `throw new Error('${  id  } register 故意失败');` : ''} }
      async initialize() { ${failMethod === 'initialize' ? `throw new Error('${  id  } initialize 故意失败');` : ''} }
      async enable() { ${failMethod === 'enable' ? `throw new Error('${  id  } enable 故意失败');` : ''} }
    }
    module.exports = P;
  `);
}

describe('P2 插件错误隔离', () => {
  let tempDir, registryDir, repo;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-errisol-'));
    registryDir = path.join(tempDir, 'registry');
    await fs.ensureDir(registryDir);
    await fs.ensureDir(path.join(tempDir, '.repo'));

    repo = new Repository(tempDir);
    await repo.init();

    // 安装 chrome-translate（好插件）— 输出到 tempDir 避免并行竞态
    const entry = await buildPlugin(PLUGIN_DIR, tempDir);
    const registryUrl = await buildLocalRegistry(registryDir, entry, tempDir);
    await repo.installPlugin(PLUGIN_ID, { registryUrl });
  });

  afterEach(async () => {
    await cleanupRepo(repo, tempDir);
  });

  test('坏插件 initialize 抛错 → 跳过坏插件，好插件正常加载', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createBadPlugin(pluginsDir, 'bad-init', 'initialize');

    // 关闭旧 repo，重新 init + initPluginSystem（加载 chrome-translate + bad-init）
    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    const pm = repo.getPluginManager();

    // 好插件正常加载
    expect(pm.getPlugin(PLUGIN_ID)).toBeDefined();
    expect(pm.getPlugin(PLUGIN_ID).state).toBe('enabled');

    // 坏插件被跳过
    expect(pm.getPlugin('bad-init')).toBeUndefined();

    // 坏插件的半注册状态已清理
    expect(pm.extensions.list('resourceProviders').find((e) => e.pluginId === 'bad-init')).toBeUndefined();
    expect(pm._contexts.has('bad-init')).toBe(false);
  });

  test('坏插件 enable 抛错 → 跳过坏插件，好插件正常加载', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createBadPlugin(pluginsDir, 'bad-enable', 'enable');

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    const pm = repo.getPluginManager();

    expect(pm.getPlugin(PLUGIN_ID)).toBeDefined();
    expect(pm.getPlugin(PLUGIN_ID).state).toBe('enabled');
    expect(pm.getPlugin('bad-enable')).toBeUndefined();

    // 坏插件的半注册状态已清理
    expect(pm.extensions.list('resourceProviders').find((e) => e.pluginId === 'bad-enable')).toBeUndefined();
    expect(pm._contexts.has('bad-enable')).toBe(false);
  });

  test('多个坏插件 → 全部跳过，好插件正常加载', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createBadPlugin(pluginsDir, 'bad-1', 'initialize');
    await createBadPlugin(pluginsDir, 'bad-2', 'enable');

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    const pm = repo.getPluginManager();

    expect(pm.getPlugin(PLUGIN_ID)).toBeDefined();
    expect(pm.getPlugin('bad-1')).toBeUndefined();
    expect(pm.getPlugin('bad-2')).toBeUndefined();

    // 坏插件的半注册状态已清理
    expect(pm.extensions.list('resourceProviders').find((e) => e.pluginId === 'bad-1')).toBeUndefined();
    expect(pm._contexts.has('bad-1')).toBe(false);
    expect(pm.extensions.list('resourceProviders').find((e) => e.pluginId === 'bad-2')).toBeUndefined();
    expect(pm._contexts.has('bad-2')).toBe(false);
  });

  test('坏插件 register 抛错 → 跳过坏插件，好插件正常加载', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createBadPlugin(pluginsDir, 'bad-register', 'register');

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    const pm = repo.getPluginManager();

    expect(pm.getPlugin(PLUGIN_ID)).toBeDefined();
    expect(pm.getPlugin(PLUGIN_ID).state).toBe('enabled');
    expect(pm.getPlugin('bad-register')).toBeUndefined();

    // 坏插件的半注册状态已清理（register 抛错时 extensions 未注册，但 registry/contexts 已注册需清理）
    expect(pm.extensions.list('resourceProviders').find((e) => e.pluginId === 'bad-register')).toBeUndefined();
    expect(pm._contexts.has('bad-register')).toBe(false);
  });
});
