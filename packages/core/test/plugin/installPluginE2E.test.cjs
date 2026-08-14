/**
 * 真实分发链路端到端测试（P2-1）
 *
 * 完整验证：lo-plugins build.cjs 打包产物 → 本地 Plugin Repository（index.json）
 * → lo Core installPlugin 安装 → 加载激活 → ResourceProvider discover 写数据。
 *
 * 依赖：与 lo-plugins 仓库同级目录（../lo-plugins）。
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

describe('真实分发链路 E2E（build → registry → installPlugin）', () => {
  let tempDir, registryDir, repo;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-dist-e2e-'));
    registryDir = path.join(tempDir, 'registry');
    await fs.ensureDir(registryDir);
    await fs.ensureDir(path.join(tempDir, '.repo')); // Repository.init 需要 .repo 存在

    repo = new Repository(tempDir);
    await repo.init();
  });

  afterEach(async () => {
    await cleanupRepo(repo, tempDir);
  });

  test('build.cjs 打包 → 本地 registry → installPlugin 安装 → discover 写数据', async () => {
    // 1. 用 lo-plugins 的 build.cjs 真实打包 chrome-translate（输出到独立目录避免并行竞态）
    const entry = await buildPlugin(PLUGIN_DIR, tempDir);
    expect(entry.id).toBe(PLUGIN_ID);

    // 2. 构造本地 Plugin Repository：复制 tarball + 写 index.json
    const tarballSrc = path.join(tempDir, entry.downloadUrl);
    expect(await fs.pathExists(tarballSrc)).toBe(true);
    const tarballDest = path.join(registryDir, entry.downloadUrl);
    await fs.copy(tarballSrc, tarballDest);

    // 用复制后文件的实际 checksum（确保安装时校验通过）
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(await fs.readFile(tarballDest));
    const actualChecksum = hash.digest('hex');

    const indexFile = path.join(registryDir, 'index.json');
    await fs.writeFile(indexFile, JSON.stringify([{ ...entry, checksum: actualChecksum }]));

    // 3. installPlugin 安装（file:// 本地仓库）
    const plugin = await repo.installPlugin(PLUGIN_ID, {
      registryUrl: `file://${  indexFile.replace(/\\/g, '/')}`,
    });
    expect(plugin.id).toBe(PLUGIN_ID);

    // 4. 插件目录就位 + 已加载激活
    expect(await fs.pathExists(path.join(tempDir, '.repo', 'plugins', PLUGIN_ID, 'plugin.json'))).toBe(true);
    const pm = repo.getPluginManager();
    expect(pm.getPlugin(PLUGIN_ID)).toBeDefined();

    // 5. ResourceProvider 已注册到扩展点
    const ds = repo.getDiscoveryService();
    expect(ds.listProviders().find((p) => p.key === PLUGIN_ID)).toBeDefined();

    // 6. discover 写入数据
    const exportFile = path.join(tempDir, 'exports', 'records.json');
    await fs.ensureDir(path.dirname(exportFile));
    await fs.writeFile(exportFile, JSON.stringify([
      {
        recordId: 'tr_dist_001',
        original: 'serendipity',
        translation: '意外发现美好事物的能力',
        sourceLang: 'en',
        targetLang: 'zh',
        timestamp: '2026-08-01T10:00:00Z',
      },
    ]));

    const result = await ds.discover(PLUGIN_ID, exportFile);
    expect(result.resources.length).toBe(1);

    const all = await repo.resourceService.getAll();
    const vocab = all.filter((r) => r.type === 'vocabulary');
    expect(vocab.length).toBe(1);
    expect(vocab[0].metadata.recordId).toBe('tr_dist_001');
  });
});
