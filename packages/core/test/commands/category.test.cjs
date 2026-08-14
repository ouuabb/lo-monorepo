/**
 * category 命令测试（新架构）
 *
 * category 命令管理资源分类，操作通过 staging stageMetadata 暂存。
 * 支持操作: set（设置分类）、rm（移除分类）、list（列出分类）、tree（树形展示）。
 */

const path = require('path');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const categoryCommand = require('../../src/commands/category.cjs');

describe('category command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  async function createNote(title, category) {
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    const res = await repo.createResource('note', `# ${title}`, {
      filename: `${title}.md`,
      metadata: { title, ...(category ? { category } : {}) }
    });
    await repo.close();
    return res;
  }

  test('should set category on a resource', async () => {
    // 需要先有资源才能设置分类
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    const resource = await repo.importFile(path.join(ctx.tempDir, 'test.md'));
    await repo.close();

    await categoryCommand({
      _: ['lo'],
      action: 'set',
      rid: resource.rid,
      category: '编程/Python'
    });

    // 验证暂存了 metadata 变更
    const repo2 = new Repository(ctx.tempDir);
    await repo2.init();
    const status = await repo2.staging.getStatus();
    await repo2.close();

    const stagedMeta = status.metadata.find(m => m.rid === resource.rid);
    expect(stagedMeta).toBeDefined();
    expect(stagedMeta.category).toBe('编程/Python');
  });

  test('should remove category from a resource', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    const resource = await repo.importFile(path.join(ctx.tempDir, 'test.md'));
    await repo.close();

    await categoryCommand({ _: ['lo'], action: 'rm', rid: resource.rid });

    const repo2 = new Repository(ctx.tempDir);
    await repo2.init();
    const status = await repo2.staging.getStatus();
    await repo2.close();

    const stagedMeta = status.metadata.find(m => m.rid === resource.rid);
    expect(stagedMeta).toBeDefined();
    expect(stagedMeta.category).toBe('');
  });

  test('should list categories for a resource', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    const resource = await repo.importFile(path.join(ctx.tempDir, 'test.md'));
    await repo.close();

    await expect(categoryCommand({
      _: ['lo'],
      action: 'list',
      rid: resource.rid
    })).resolves.toBeUndefined();
  });

  test('should warn about pending metadata when listing a resource', async () => {
    const res = await createNote('N', '已有');

    await categoryCommand({ _: ['lo'], action: 'set', rid: res.rid, category: '新分类' });

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await categoryCommand({ _: ['lo'], action: 'list', rid: res.rid });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('暂存区有未提交的分类变更');
    expect(output).toContain('新分类');
    spy.mockRestore();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('tree should report no categories when none exist', async () => {
    await createNote('Plain', null);

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await categoryCommand({ _: ['lo'], action: 'tree' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('暂无分类');
    spy.mockRestore();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('tree should render nested category tree', async () => {
    await createNote('PythonNote', '编程/Python/爬虫');
    await createNote('JS', '编程/JavaScript');
    await createNote('Design', '设计');

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await categoryCommand({ _: ['lo'], action: 'tree' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('分类树');
    expect(output).toContain('编程');
    expect(output).toContain('Python');
    expect(output).toContain('JavaScript');
    expect(output).toContain('设计');
    spy.mockRestore();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('list without rid should show all categories', async () => {
    await createNote('A', '编程/Python');
    await createNote('B', '设计');

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await categoryCommand({ _: ['lo'], action: 'list' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('所有分类');
    expect(output).toContain('编程/Python');
    expect(output).toContain('设计');
    spy.mockRestore();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('list without rid should report no categories when none exist', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await categoryCommand({ _: ['lo'], action: 'list' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('暂无分类');
    spy.mockRestore();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('should error when no rid is given', async () => {
    await categoryCommand({ _: ['lo'] });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('should error when resource is not found', async () => {
    await categoryCommand({ _: ['lo'], action: 'set', rid: 'res_doesnotexist' });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('should error when set has no category value', async () => {
    const res = await createNote('N', '已有');
    await categoryCommand({ _: ['lo'], action: 'set', rid: res.rid });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('should error when category becomes empty after normalization', async () => {
    const res = await createNote('N', '已有');
    await categoryCommand({ _: ['lo'], action: 'set', rid: res.rid, category: '/  /' });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('should error on unknown action', async () => {
    const res = await createNote('N', '已有');
    await categoryCommand({ _: ['lo'], action: 'nope', rid: res.rid });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('should error when not in a repository', async () => {
    process.chdir(ctx.originalCwd);
    await categoryCommand({ _: ['lo'], action: 'tree' });
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
