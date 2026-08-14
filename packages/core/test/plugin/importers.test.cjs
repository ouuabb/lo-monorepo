/**
 * P4 importers 扩展点测试
 *
 * 验证 lo import 命令消费 importers 扩展点：
 *   A. findImporter 纯函数各分支
 *   B. 端到端：真实 importer 插件注册 → 导入 → 资源创建
 *   C. 命令全链路：import 命令 + importer / 回退核心 / 失败隔离
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');


const Repository = require('../../src/repo/repository.cjs');
const importModule = require('../../src/commands/import.cjs');
const { findImporter } = importModule;
const importCommand = importModule;
const { setupTempRepo, teardownTempRepo } = require('../commands/commandTestHelper.cjs');

// ── 纯函数测试辅助 ──
function importer(key, pluginId, handler) {
  return { key, pluginId, handler };
}

async function cleanupRepo(repo, tempDir) {
  if (repo && repo.db) {
    try { await repo.db.close(); } catch {}
  }
  if (tempDir && await fs.pathExists(tempDir)) {
    try { await fs.remove(tempDir); } catch {}
  }
}

// ── 工具：在 pluginsDir 下创建一个 importer 插件 ──
async function createImporterPlugin(pluginsDir, id, opts = {}) {
  const dir = path.join(pluginsDir, id);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({
    id, name: id, version: '0.0.1', main: 'index.cjs',
  }));

  const ext = opts.ext || 'testext';
  const throwOnImport = opts.throwOnImport ? 'throw new Error("importer 故意失败");' : '';
  const resourceType = opts.resourceType || 'note';
  const resourceName = opts.resourceName || 'Imported';
  // 自定义 import 函数体（覆盖默认逻辑）
  const importBody = opts.importBody || `
    ${throwOnImport}
    const res = await ctx.resources.create({
      type: '${resourceType}',
      path: filePath,
      name: '${resourceName}',
      metadata: { title: '${resourceName}' }
    });
    return { resources: [res], relations: [] };
  `;

  await fs.writeFile(path.join(dir, 'index.cjs'), `
    const { Plugin } = require('@lo/plugins-sdk');
    class P extends Plugin {
      manifest() { return { id: '${id}', name: '${id}', version: '0.0.1' }; }
      register(ctx) {
        ctx.extensions.register('${id}', 'importers', '${id}', {
          supports(filePath) { return filePath.endsWith('.${ext}'); },
          async import(filePath, ctx, options) {
            ${importBody}
          }
        });
      }
    }
    module.exports = P;
  `);
}

// ── 工具：创建循环依赖插件（使 initPluginSystem 顶层抛错） ──
async function createCyclicPlugin(pluginsDir, id, dependsOn) {
  const dir = path.join(pluginsDir, id);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({
    id, name: id, version: '0.0.1', main: 'index.cjs',
  }));
  await fs.writeFile(path.join(dir, 'index.cjs'), `
    const { Plugin } = require('@lo/plugins-sdk');
    class P extends Plugin {
      manifest() {
        return { id: '${id}', name: '${id}', version: '0.0.1', dependencies: ${JSON.stringify([dependsOn])} };
      }
    }
    module.exports = P;
  `);
}

// ═════════════════════════════════════════════════════════════
// A. findImporter 纯函数
// ═════════════════════════════════════════════════════════════
describe('P4 findImporter 纯函数', () => {
  const filePath = '/tmp/book.testext';
  const stats = { size: 100 };

  test('空 importers → null', () => {
    expect(findImporter([], filePath, stats)).toBeNull();
  });

  test('importers 非数组 → null', () => {
    expect(findImporter(null, filePath, stats)).toBeNull();
    expect(findImporter(undefined, filePath, stats)).toBeNull();
  });

  test('supports() 返回 true → 匹配', () => {
    const imp = importer('p1', 'plugin-1', {
      supports: () => true,
      import: async () => ({ resources: [], relations: [] }),
    });
    const m = findImporter([imp], filePath, stats);
    expect(m).not.toBeNull();
    expect(m.key).toBe('p1');
    expect(m.pluginId).toBe('plugin-1');
    expect(typeof m.handler.import).toBe('function');
  });

  test('supports() 返回 false → 跳过 → null', () => {
    const imp = importer('p1', 'plugin-1', {
      supports: () => false,
      import: async () => ({ resources: [], relations: [] }),
    });
    expect(findImporter([imp], filePath, stats)).toBeNull();
  });

  test('supports() 抛错 → 隔离跳过 → null', () => {
    const logs = [];
    const logger = { error: (m) => logs.push(m) };
    const imp = importer('p1', 'plugin-1', {
      supports: () => { throw new Error('supports boom'); },
      import: async () => ({ resources: [], relations: [] }),
    });
    expect(findImporter([imp], filePath, stats, logger)).toBeNull();
    expect(logs.join('\n')).toContain('supports() 抛错');
    expect(logs.join('\n')).toContain('supports boom');
  });

  test('无 supports() → 视为支持 → 匹配', () => {
    const imp = importer('p1', 'plugin-1', {
      import: async () => ({ resources: [], relations: [] }),
    });
    const m = findImporter([imp], filePath, stats);
    expect(m).not.toBeNull();
    expect(m.key).toBe('p1');
  });

  test('缺 import() 方法 → 跳过 → null', () => {
    const logs = [];
    const logger = { error: (m) => logs.push(m) };
    const imp = importer('p1', 'plugin-1', { supports: () => true });
    expect(findImporter([imp], filePath, stats, logger)).toBeNull();
    expect(logs.join('\n')).toContain('缺少 import()');
  });

  test('函数形式 handler → 规范化为对象 → 匹配', () => {
    const fn = async (fp, ctx, opts) => ({ resources: [{ rid: 'x' }], relations: [] });
    const imp = importer('p1', 'plugin-1', fn);
    const m = findImporter([imp], filePath, stats);
    expect(m).not.toBeNull();
    expect(typeof m.handler.import).toBe('function');
  });

  test('多个 importer：第一个不支持，第二个支持 → 返回第二个', () => {
    const imp1 = importer('p1', 'plugin-1', {
      supports: () => false,
      import: async () => ({ resources: [], relations: [] }),
    });
    const imp2 = importer('p2', 'plugin-2', {
      supports: () => true,
      import: async () => ({ resources: [{ rid: 'r2' }], relations: [] }),
    });
    const m = findImporter([imp1, imp2], filePath, stats);
    expect(m.key).toBe('p2');
    expect(m.pluginId).toBe('plugin-2');
  });

  test('entry 为 null/undefined → 跳过不崩', () => {
    const imp = importer('p1', 'plugin-1', {
      import: async () => ({ resources: [], relations: [] }),
    });
    const m = findImporter([null, undefined, imp], filePath, stats);
    expect(m.key).toBe('p1');
  });

  test('handler 为 null → 跳过', () => {
    const logs = [];
    const logger = { error: (m) => logs.push(m) };
    const imp = importer('p1', 'plugin-1', null);
    expect(findImporter([imp], filePath, stats, logger)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════
// B. 端到端：真实 importer 插件
// ═════════════════════════════════════════════════════════════
describe('P4 importer 端到端', () => {
  let tempDir, repo;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-imp-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    repo = new Repository(tempDir);
    await repo.init();
  });

  afterEach(async () => {
    await cleanupRepo(repo, tempDir);
  });

  test('importer 插件注册 → initPluginSystem → extensionRegistry.list 含该 importer', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createImporterPlugin(pluginsDir, 'test-importer');

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    const extRegistry = repo.getPluginExtensionRegistry();
    const importers = extRegistry.list('importers');
    expect(importers.find((i) => i.key === 'test-importer')).toBeDefined();
    expect(importers.find((i) => i.key === 'test-importer').pluginId).toBe('test-importer');
  });

  test('importer 通过 ctx.resources.create 创建资源（真实 DB 写入）', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createImporterPlugin(pluginsDir, 'test-importer', { resourceName: 'MyBook' });

    // 创建真实文件（resourceService.create 会 stat 路径算 hash）
    const realFile = path.join(tempDir, 'book.testext');
    await fs.writeFile(realFile, 'fake book content');

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    const extRegistry = repo.getPluginExtensionRegistry();
    const importers = extRegistry.list('importers');
    const matched = findImporter(importers, realFile, { size: 100 });
    expect(matched).not.toBeNull();

    const pm = repo.getPluginManager();
    const ctx = pm.getContext('test-importer');
    expect(ctx).not.toBeNull();

    const result = await matched.handler.import(realFile, ctx, {});
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].name).toBe('MyBook');
    expect(result.resources[0].rid).toBeDefined();

    // 验证真实写入 DB
    const found = await repo.resourceService.getByRid(result.resources[0].rid);
    expect(found).not.toBeNull();
    expect(found.name).toBe('MyBook');
  });
});

// ═════════════════════════════════════════════════════════════
// C. import 命令全链路
// ═════════════════════════════════════════════════════════════
describe('P4 import 命令 — 全链路', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  function captureConsole() {
    const logs = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    return { logs, restore: () => spy.mockRestore() };
  }

  test('import 命令用 importer 导入 .testext 文件 → 资源创建', async () => {
    const pluginsDir = path.join(ctx.tempDir, '.repo', 'plugins');
    await createImporterPlugin(pluginsDir, 'cmd-importer', { resourceName: 'CmdBook' });

    // 创建测试文件
    const testFile = path.join(ctx.tempDir, 'book.testext');
    await fs.writeFile(testFile, 'fake content');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: undefined, category: undefined });
    restore();

    const joined = logs.join('\n');
    expect(joined).toContain('cmd-importer');
    expect(joined).toContain('成功导入 1 个资源');

    // 验证 DB 真实写入
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open({ skipAuth: true });
    const all = await repo2.resourceService.getAll();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.some((r) => r.name === 'CmdBook')).toBe(true);
    await repo2.close();
  });

  test('import 命令无匹配 importer → 回退核心 importFile（.md 文件）', async () => {
    // 无 importer 插件，导入 .md 文件 → 走核心逻辑
    const testFile = path.join(ctx.tempDir, 'note.md');
    await fs.writeFile(testFile, '# Test Note');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: undefined, category: undefined });
    restore();

    const joined = logs.join('\n');
    expect(joined).toContain('成功导入资源');
    expect(joined).not.toContain('importer');

    // 验证 DB 写入
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open({ skipAuth: true });
    const all = await repo2.resourceService.getAll();
    expect(all.some((r) => r.type === 'note')).toBe(true);
    await repo2.close();
  });

  test('import 命令 importer 失败 → 回退核心 importFile', async () => {
    // 创建一个 import() 抛错的 importer，但 supports 匹配 .md
    const pluginsDir = path.join(ctx.tempDir, '.repo', 'plugins');
    await createImporterPlugin(pluginsDir, 'bad-importer', {
      ext: 'md', throwOnImport: true,
    });

    const testFile = path.join(ctx.tempDir, 'note.md');
    await fs.writeFile(testFile, '# Fallback Test');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: undefined, category: undefined });
    restore();

    const joined = logs.join('\n');
    // importer 失败被记录
    expect(joined).toContain('导入失败');
    expect(joined).toContain('回退核心导入');
    // 核心导入成功
    expect(joined).toContain('成功导入资源');

    // 验证 DB 写入（核心导入的 note）
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open({ skipAuth: true });
    const all = await repo2.resourceService.getAll();
    expect(all.some((r) => r.type === 'note')).toBe(true);
    await repo2.close();
  });

  test('import 命令在 initPluginSystem 抛错（循环依赖）时回退核心导入', async () => {
    const pluginsDir = path.join(ctx.tempDir, '.repo', 'plugins');
    await createCyclicPlugin(pluginsDir, 'cyc-a', 'cyc-b');
    await createCyclicPlugin(pluginsDir, 'cyc-b', 'cyc-a');

    const testFile = path.join(ctx.tempDir, 'note.md');
    await fs.writeFile(testFile, '# Cyclic Test');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: undefined, category: undefined });
    restore();

    const joined = logs.join('\n');
    // 插件系统未启用 → 回退核心
    expect(joined).toContain('插件系统未启用');
    expect(joined).toContain('成功导入资源');

    // 验证 DB 写入
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open({ skipAuth: true });
    const all = await repo2.resourceService.getAll();
    expect(all.some((r) => r.type === 'note')).toBe(true);
    await repo2.close();
  });

  test('importer 返回 {resources: []} → 未创建资源，不回退核心', async () => {
    const pluginsDir = path.join(ctx.tempDir, '.repo', 'plugins');
    await createImporterPlugin(pluginsDir, 'empty-importer', {
      ext: 'testext',
      importBody: `return { resources: [], relations: [] };`,
    });

    const testFile = path.join(ctx.tempDir, 'empty.testext');
    await fs.writeFile(testFile, 'empty content');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: undefined, category: undefined });
    restore();

    const joined = logs.join('\n');
    expect(joined).toContain('未创建资源');
    // 不回退核心（无"成功导入资源"）
    expect(joined).not.toContain('成功导入资源');

    // DB 无用户资源（排除 __system__）
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open({ skipAuth: true });
    const all = await repo2.resourceService.getAll();
    expect(all.filter((r) => r.type !== 'system')).toHaveLength(0);
    await repo2.close();
  });

  test('importer 返回 null → 回退核心 importFile', async () => {
    const pluginsDir = path.join(ctx.tempDir, '.repo', 'plugins');
    await createImporterPlugin(pluginsDir, 'null-importer', {
      ext: 'md',
      importBody: `return null;`,
    });

    const testFile = path.join(ctx.tempDir, 'note.md');
    await fs.writeFile(testFile, '# Null Test');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: undefined, category: undefined });
    restore();

    const joined = logs.join('\n');
    // null 视为异常 → 记录警告并回退核心
    expect(joined).toContain('返回空结果');
    expect(joined).toContain('成功导入资源');

    const repo2 = new Repository(ctx.tempDir);
    await repo2.open({ skipAuth: true });
    const all = await repo2.resourceService.getAll();
    expect(all.some((r) => r.type === 'note')).toBe(true);
    await repo2.close();
  });

  test('分类更新失败 → 不产生重复资源（bug 修复验证）', async () => {
    const pluginsDir = path.join(ctx.tempDir, '.repo', 'plugins');
    // importer 创建 1 个真实资源 + 返回 1 个假资源（rid 不存在）
    // 分类更新假资源时抛 'Resource not found'，但不回退核心
    await createImporterPlugin(pluginsDir, 'cat-fail-importer', {
      ext: 'testext',
      importBody: `
        const real = await ctx.resources.create({
          type: 'note', path: filePath, name: 'RealRes', metadata: { title: 'RealRes' }
        });
        const fake = { rid: 'nonexistent-rid', type: 'note', metadata: {} };
        return { resources: [real, fake], relations: [] };
      `,
    });

    const testFile = path.join(ctx.tempDir, 'catfail.testext');
    await fs.writeFile(testFile, 'cat fail content');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: undefined, category: undefined });
    restore();

    const joined = logs.join('\n');
    // 真实资源导入成功
    expect(joined).toContain('成功导入 2 个资源');
    // 假资源分类失败被记录
    expect(joined).toContain('分类设置失败');
    // 不回退核心（无"成功导入资源"单数形式）
    expect(joined).not.toContain('成功导入资源:');

    // DB 只有 1 个用户资源（真实资源），无核心重复
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open({ skipAuth: true });
    const all = await repo2.resourceService.getAll();
    const userRes = all.filter((r) => r.type !== 'system');
    expect(userRes).toHaveLength(1);
    expect(userRes[0].name).toBe('RealRes');
    await repo2.close();
  });

  test('importer 创建资源 + 关系 → 关系计数日志', async () => {
    const pluginsDir = path.join(ctx.tempDir, '.repo', 'plugins');
    await createImporterPlugin(pluginsDir, 'relation-importer', {
      ext: 'testext',
      importBody: `
        const book = await ctx.resources.create({
          type: 'note', path: filePath, name: 'Book', metadata: { title: 'Book' }
        });
        const chapter = await ctx.resources.create({
          type: 'note', path: '', name: 'Chapter', metadata: { title: 'Chapter' }
        });
        const rel = await ctx.relations.create({
          from_rid: book.rid, to_rid: chapter.rid, type: 'contains'
        });
        return { resources: [book, chapter], relations: [rel] };
      `,
    });

    const testFile = path.join(ctx.tempDir, 'rel.testext');
    await fs.writeFile(testFile, 'relation content');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: undefined, category: undefined });
    restore();

    const joined = logs.join('\n');
    expect(joined).toContain('成功导入 2 个资源');
    expect(joined).toContain('创建 1 个关系');

    // 验证 DB
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open({ skipAuth: true });
    const all = await repo2.resourceService.getAll();
    expect(all.filter((r) => r.type !== 'system')).toHaveLength(2);
    await repo2.close();
  });

  test('--category 应用于 importer 创建的资源', async () => {
    const pluginsDir = path.join(ctx.tempDir, '.repo', 'plugins');
    await createImporterPlugin(pluginsDir, 'cat-importer', {
      ext: 'testext',
      resourceName: 'CatBook',
    });

    const testFile = path.join(ctx.tempDir, 'cat.testext');
    await fs.writeFile(testFile, 'category content');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: undefined, category: 'MyCategory' });
    restore();

    const joined = logs.join('\n');
    expect(joined).toContain('成功导入 1 个资源');

    // 验证资源有正确的 category
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open({ skipAuth: true });
    const all = await repo2.resourceService.getAll();
    const userRes = all.filter((r) => r.type !== 'system');
    expect(userRes).toHaveLength(1);
    expect(userRes[0].metadata.category).toBe('MyCategory');
    await repo2.close();
  });

  // ── 不支持文件类型的统一提示 ──

  test('导入不支持的文件类型（无 --type）→ 输出统一提示 + 仍导入', async () => {
    // .unknownext 不在内置 TYPE_MAP，也无插件声明
    const testFile = path.join(ctx.tempDir, 'data.unknownext');
    await fs.writeFile(testFile, 'unknown content');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: undefined, category: undefined });
    restore();

    const joined = logs.join('\n');
    // 统一提示信息
    expect(joined).toContain('不支持');
    expect(joined).toContain('.unknownext');
    expect(joined).toContain('插件');
    expect(joined).toContain('--type');
    // 仍然导入（核心 importFile 创建 type=unknown 的 Resource）
    expect(joined).toContain('成功导入资源');
  });

  test('导入不支持的文件类型（指定 --type）→ 不输出不支持提示', async () => {
    const testFile = path.join(ctx.tempDir, 'data.unknownext');
    await fs.writeFile(testFile, 'unknown content');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: 'note', category: undefined });
    restore();

    const joined = logs.join('\n');
    // 用户显式指定 type，不输出不支持提示
    expect(joined).not.toContain('不支持');
    // 正常导入
    expect(joined).toContain('成功导入资源');
  });

  test('导入支持的内置类型（.md）→ 不输出不支持提示', async () => {
    const testFile = path.join(ctx.tempDir, 'note.md');
    await fs.writeFile(testFile, '# Test');

    const { logs, restore } = captureConsole();
    await importCommand({ path: testFile, type: undefined, category: undefined });
    restore();

    const joined = logs.join('\n');
    expect(joined).not.toContain('不支持');
    expect(joined).toContain('成功导入资源');
  });
});
