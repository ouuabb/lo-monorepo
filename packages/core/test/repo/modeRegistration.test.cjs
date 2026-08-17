/**
 * modeRegistration.test.cjs —— U3 插件 Mode/Viewer 注册路径
 *
 * repository.registerPluginMode / registerPluginViewer 写入
 * mode_definitions / viewer_definitions 表；builtin 冲突抛错；
 * 注册后 resolveModes / resolveViewers 可解析（U1 读取路径 × U3 写入路径闭环）。
 */
const fs = require('fs-extra');
const path = require('path');
const Repository = require('../../src/repo/repository.cjs');

describe('U3 插件 Mode/Viewer 注册', () => {
  let tempDir;
  let repo;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    await fs.ensureDir(path.join(tempDir, '.repo'));
    repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });
  });

  afterEach(async () => {
    if (repo) await repo.close();
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  async function createResource(type) {
    const resource = await repo.resourceService.create({
      type,
      name: `t-${type}-${Date.now()}`,
      path: `resources/t-${type}-${Date.now()}.bin`,
    });
    return resource;
  }

  test('registerPluginMode 写入表并可解析（annotating/metadata 贡献后 epub → [reading, annotating, metadata]）', async () => {
    const epub = await createResource('epub');

    const before = await repo.resolveModes(epub.rid);
    expect(before.map((m) => m.modeId)).toEqual(['reading']);

    await repo.registerPluginMode(
      {
        modeId: 'annotating',
        semantics: '以标注方式使用',
        applicableTo: { types: ['epub'] },
        rules: { writable: true, interactive: true },
      },
      'epub-reader',
    );
    await repo.registerPluginMode(
      {
        modeId: 'metadata',
        semantics: '以元数据方式使用',
        applicableTo: { types: ['epub'] },
        rules: { writable: false, interactive: false },
      },
      'epub-reader',
    );

    const after = await repo.resolveModes(epub.rid);
    expect(after.map((m) => m.modeId)).toEqual(['reading', 'annotating', 'metadata']);

    const row = await repo.db.get(
      'SELECT * FROM mode_definitions WHERE mode_id = ?',
      ['annotating'],
    );
    expect(row.plugin_id).toBe('epub-reader');
    expect(JSON.parse(row.rules).writable).toBe(true);
  });

  test('registerPluginMode：builtin 冲突抛错（不得重复注册 reading）', async () => {
    await expect(
      repo.registerPluginMode(
        {
          modeId: 'reading',
          semantics: '插件重复注册 builtin',
          applicableTo: { types: ['epub'] },
          rules: { writable: false, interactive: true },
        },
        'epub-reader',
      ),
    ).rejects.toThrow(/builtin Mode，插件不得重复注册/);

    const rows = await repo.db.all(
      'SELECT mode_id FROM mode_definitions WHERE mode_id = ?',
      ['reading'],
    );
    expect(rows).toHaveLength(0);
  });

  test('registerPluginViewer 写入表并参与解析（viewer.epub-reader 支持 reading）', async () => {
    await repo.registerPluginViewer(
      {
        viewerId: 'viewer.epub-reader',
        label: 'EPUB 阅读器',
        semantics: 'EPUB 阅读',
        supports: { modes: ['reading'] },
      },
      'epub-reader',
    );

    const readers = await repo.listViewers('reading');
    expect(readers.map((v) => v.viewerId)).toEqual([
      'viewer.generic-preview',
      'viewer.markdown-preview',
      'viewer.epub-reader',
    ]);

    const row = await repo.db.get(
      'SELECT * FROM viewer_definitions WHERE viewer_id = ?',
      ['viewer.epub-reader'],
    );
    expect(row.plugin_id).toBe('epub-reader');
    expect(JSON.parse(row.supports).modes).toEqual(['reading']);
  });

  test('registerPluginViewer：builtin 冲突抛错', async () => {
    await expect(
      repo.registerPluginViewer(
        {
          viewerId: 'viewer.generic-preview',
          label: '撞 builtin',
          semantics: 'x',
          supports: { modes: ['reading'] },
        },
        'epub-reader',
      ),
    ).rejects.toThrow(/builtin Viewer，插件不得重复注册/);
  });

  test('registerPluginMode：缺 modeId 拒绝；重复注册同 modeId 抛错', async () => {
    await expect(repo.registerPluginMode({}, 'p')).rejects.toThrow(/缺少 modeId/);
    const def = {
      modeId: 'annotating',
      semantics: '标注',
      applicableTo: { types: ['epub'] },
      rules: { writable: true, interactive: true },
    };
    await repo.registerPluginMode(def, 'p1');
    await expect(repo.registerPluginMode(def, 'p2')).rejects.toThrow(/注册失败/);
  });
});
