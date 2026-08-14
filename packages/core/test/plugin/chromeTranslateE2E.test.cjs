/**
 * chrome-translate 插件端到端测试
 * 运行在 lo 仓库上下文中，验证完整管道
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');


const Repository = require('../../src/repo/repository.cjs');

// 插件源码路径（根目录，包含 plugin.json + src/）
const PLUGIN_ROOT = path.resolve('..', '..', 'plugins', 'core', 'packages', 'chrome-translate');

async function cleanupRepo(repo, tempDir) {
  if (repo && repo.db) {
    try { await repo.db.close(); } catch {}
  }
  if (tempDir && await fs.pathExists(tempDir)) {
    try { await fs.remove(tempDir); } catch {}
  }
}

describe('chrome-translate 插件端到端', () => {
  let tempDir, repo;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-ct-e2e-'));
    await fs.ensureDir(path.join(tempDir, '.repo', 'plugins', 'chrome-translate'));
    repo = new Repository(tempDir);
    await repo.init();
  });

  afterEach(async () => {
    await cleanupRepo(repo, tempDir);
  });

  test('discover 全量写入 → 查询确认 → 再 discover 去重', async () => {
    // 1. 复制插件到 .repo/plugins/chrome-translate/
    //    PluginLoader 要求 plugin.json 在插件根目录，main 指向 src/index.cjs
    const pluginDest = path.join(tempDir, '.repo', 'plugins', 'chrome-translate');
    await fs.copy(path.join(PLUGIN_ROOT, 'plugin.json'), path.join(pluginDest, 'plugin.json'));
    await fs.copy(path.join(PLUGIN_ROOT, 'src'), path.join(pluginDest, 'src'));

    // 2. 创建测试翻译记录
    const records = [
      {
        recordId: 'tr_e2e_001',
        original: 'serendipity',
        translation: '意外发现美好事物的能力',
        sourceLang: 'en', targetLang: 'zh',
        context: 'a happy serendipity',
        url: 'https://example.com/article',
        pageTitle: 'Article',
        timestamp: '2026-08-01T10:00:00Z',
      },
      {
        recordId: 'tr_e2e_002',
        original: 'ephemeral',
        translation: '短暂的',
        sourceLang: 'en', targetLang: 'zh',
        context: 'ephemeral beauty',
        url: 'https://example.com/poem',
        pageTitle: 'Poem',
        timestamp: '2026-08-01T11:00:00Z',
      },
    ];
    const exportFile = path.join(tempDir, 'exports', 'records.json');
    await fs.ensureDir(path.dirname(exportFile));
    await fs.writeFile(exportFile, JSON.stringify(records));

    // 3. 初始化插件系统（initPluginSystem 内部已调用 pm.initialize()）
    await repo.initPluginSystem();

    // 4. discover
    const ds = repo.getDiscoveryService();
    const providers = ds.listProviders();
    expect(providers.find(p => p.key === 'chrome-translate')).toBeDefined();

    // 5. 第一次 discover — 全量写入
    const result1 = await ds.discover('chrome-translate', exportFile);
    expect(result1.candidates.length).toBe(2);
    expect(result1.resources.length).toBe(2);
    expect(result1.resources[0].name).toBe('serendipity');
    expect(result1.resources[0].metadata.recordId).toBe('tr_e2e_001');
    expect(result1.resources[0].metadata.translation).toBe('意外发现美好事物的能力');

    // 6. 查询确认
    const all = await repo.resourceService.getAll();
    const vocab = all.filter(r => r.type === 'vocabulary');
    expect(vocab.length).toBe(2);

    // 7. 第二次 discover — 去重
    const result2 = await ds.discover('chrome-translate', exportFile);
    expect(result2.candidates.length).toBe(0);
    expect(result2.resources.length).toBe(0);

    // 8. 添加新记录后 discover — 补录
    records.push({
      recordId: 'tr_e2e_003',
      original: 'ubiquitous',
      translation: '无处不在的',
      sourceLang: 'en', targetLang: 'zh',
      context: 'ubiquitous computing',
      url: 'https://example.com/tech',
      pageTitle: 'Tech',
      timestamp: '2026-08-01T12:00:00Z',
    });
    await fs.writeFile(exportFile, JSON.stringify(records));

    const result3 = await ds.discover('chrome-translate', exportFile);
    expect(result3.candidates.length).toBe(1);
    expect(result3.resources[0].name).toBe('ubiquitous');
  });
});
