/**
 * installPlugin 集成测试（P2-1）
 *
 * 端到端验证：本地 Plugin Repository（index.json + tar.gz）→ lo 仓库安装 → 插件加载激活。
 * 使用假插件（鸭子类型 Plugin），不依赖真实 chrome-translate。
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const tar = require('tar');


const Repository = require('../../src/repo/repository.cjs');

const PLUGIN_ID = 'install-test';
const PLUGIN_VERSION = '1.0.0';

/** 假插件入口：鸭子类型 Plugin（manifest/register/initialize/enable/disable/dispose + id/name/version getter） */
const FAKE_PLUGIN_SRC = `
class InstallTestPlugin {
  get id() { return '${PLUGIN_ID}'; }
  get name() { return 'Install Test'; }
  get version() { return '${PLUGIN_VERSION}'; }
  get contributes() { return null; }
  manifest() { return { id: '${PLUGIN_ID}', name: 'Install Test', version: '${PLUGIN_VERSION}' }; }
  register(ctx) {
    ctx.extensions.register('${PLUGIN_ID}', 'commands', 'install-test:hello', {
      id: 'install-test:hello',
      description: '测试命令',
      run: async () => 'hello',
    });
  }
  initialize() {}
  enable() {}
  disable() {}
  dispose() {}
}
module.exports = InstallTestPlugin;
`;

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(await fs.readFile(filePath));
  return hash.digest('hex');
}

/**
 * 构造本地插件仓库：生成插件源码 → 打包 tar.gz → 写 index.json
 * @param {string} registryDir
 * @param {object} [opts]
 */
async function makeLocalRegistry(registryDir, opts = {}) {
  const { checksumOverride, brokenMain } = opts;

  // 插件源码
  const srcDir = path.join(registryDir, '_src');
  await fs.ensureDir(path.join(srcDir, 'src'));
  await fs.writeFile(
    path.join(srcDir, 'plugin.json'),
    JSON.stringify({
      id: PLUGIN_ID,
      name: 'Install Test',
      version: PLUGIN_VERSION,
      main: brokenMain ? 'missing/index.cjs' : 'src/index.cjs',
    })
  );
  await fs.writeFile(path.join(srcDir, 'src', 'index.cjs'), FAKE_PLUGIN_SRC);

  // 打包
  const tarball = path.join(registryDir, `${PLUGIN_ID}-${PLUGIN_VERSION}.tar.gz`);
  await tar.create({ gzip: true, file: tarball, cwd: srcDir }, ['plugin.json', 'src']);

  // index.json
  const entry = {
    id: PLUGIN_ID,
    name: 'Install Test',
    version: PLUGIN_VERSION,
    description: 'install test plugin',
    author: 'lo',
    main: 'src/index.cjs',
    downloadUrl: `${PLUGIN_ID}-${PLUGIN_VERSION}.tar.gz`,
    checksum: checksumOverride || await sha256(tarball),
    size: (await fs.stat(tarball)).size,
  };
  const indexFile = path.join(registryDir, 'index.json');
  await fs.writeFile(indexFile, JSON.stringify([entry]));
  return indexFile;
}

async function cleanupRepo(repo, tempDir) {
  if (repo && repo.db) {
    try { await repo.db.close(); } catch {}
  }
  if (tempDir && await fs.pathExists(tempDir)) {
    try { await fs.remove(tempDir); } catch {}
  }
}

describe('installPlugin 集成测试（本地 Plugin Repository）', () => {
  let tempDir, registryDir, repo;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-install-e2e-'));
    registryDir = path.join(tempDir, 'registry');
    await fs.ensureDir(registryDir);
    await fs.ensureDir(path.join(tempDir, '.repo')); // Repository.init 需要 .repo 存在

    repo = new Repository(tempDir);
    await repo.init();
  });

  afterEach(async () => {
    await cleanupRepo(repo, tempDir);
  });

  test('从本地仓库安装插件 → 目录就位 + 插件加载激活', async () => {
    const indexFile = await makeLocalRegistry(registryDir);

    const plugin = await repo.installPlugin(PLUGIN_ID, { registryUrl: `file://${  indexFile.replace(/\\/g, '/')}` });

    expect(plugin.id).toBe(PLUGIN_ID);

    // 插件目录已就位
    const installedDir = path.join(tempDir, '.repo', 'plugins', PLUGIN_ID);
    expect(await fs.pathExists(path.join(installedDir, 'plugin.json'))).toBe(true);
    expect(await fs.pathExists(path.join(installedDir, 'src', 'index.cjs'))).toBe(true);

    // 已注册到 PluginManager
    const pm = repo.getPluginManager();
    expect(pm.getPlugin(PLUGIN_ID)).toBeDefined();

    // 扩展点已注册
    const commands = pm.extensions.list('commands');
    expect(commands.some((c) => c.key === 'install-test:hello')).toBe(true);
  });

  test('重复安装同一插件报错', async () => {
    const indexFile = await makeLocalRegistry(registryDir);
    await repo.installPlugin(PLUGIN_ID, { registryUrl: `file://${  indexFile.replace(/\\/g, '/')}` });

    await expect(repo.installPlugin(PLUGIN_ID, { registryUrl: `file://${  indexFile.replace(/\\/g, '/')}` }))
      .rejects.toThrow('already installed');
  });

  test('安装不存在的插件报错', async () => {
    const indexFile = await makeLocalRegistry(registryDir);
    await expect(repo.installPlugin('no-such-plugin', { registryUrl: `file://${  indexFile.replace(/\\/g, '/')}` }))
      .rejects.toThrow('不在插件仓库中');
  });

  test('checksum 不匹配时拒绝安装且不污染插件目录', async () => {
    const indexFile = await makeLocalRegistry(registryDir, { checksumOverride: 'f'.repeat(64) });

    await expect(repo.installPlugin(PLUGIN_ID, { registryUrl: `file://${  indexFile.replace(/\\/g, '/')}` }))
      .rejects.toThrow('校验失败');

    // 插件目录不应残留
    const installedDir = path.join(tempDir, '.repo', 'plugins', PLUGIN_ID);
    expect(await fs.pathExists(installedDir)).toBe(false);
  });

  test('使用本地路径（非 file://）也能安装', async () => {
    const indexFile = await makeLocalRegistry(registryDir);

    const plugin = await repo.installPlugin(PLUGIN_ID, { registryUrl: indexFile });
    expect(plugin.id).toBe(PLUGIN_ID);
  });

  test('插件加载失败时回滚，不污染目录且可重试', async () => {
    // 第一次：main 指向不存在入口 → 加载失败
    const badIndex = await makeLocalRegistry(registryDir, { brokenMain: true });
    await expect(repo.installPlugin(PLUGIN_ID, { registryUrl: `file://${  badIndex.replace(/\\/g, '/')}` }))
      .rejects.toThrow('Plugin entry file not found');

    // 插件目录不应残留
    expect(await fs.pathExists(path.join(tempDir, '.repo', 'plugins', PLUGIN_ID))).toBe(false);

    // 修复 registry 后重试成功
    const goodIndex = await makeLocalRegistry(registryDir);
    const plugin = await repo.installPlugin(PLUGIN_ID, { registryUrl: `file://${  goodIndex.replace(/\\/g, '/')}` });
    expect(plugin.id).toBe(PLUGIN_ID);
  });

  test('卸载后可重新安装', async () => {
    const indexFile = await makeLocalRegistry(registryDir);
    await repo.installPlugin(PLUGIN_ID, { registryUrl: `file://${  indexFile.replace(/\\/g, '/')}` });

    // 卸载（保留文件）
    await repo.uninstallPlugin(PLUGIN_ID);
    // 删除文件后重新安装
    await fs.remove(path.join(tempDir, '.repo', 'plugins', PLUGIN_ID));

    const plugin = await repo.installPlugin(PLUGIN_ID, { registryUrl: `file://${  indexFile.replace(/\\/g, '/')}` });
    expect(plugin.id).toBe(PLUGIN_ID);
  });
});
