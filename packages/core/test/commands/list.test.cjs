/**
 * list 命令测试（新架构）
 *
 * list 命令列出仓库中的资源，新架构下通过 console.log 输出。
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const listCommand = require('../../src/commands/list.cjs');

describe('list command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  async function runWithCapture(argv) {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    let output;
    try {
      await listCommand({ _: ['lo'], ...argv });
      output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    } finally {
      spy.mockRestore();
    }
    return output;
  }

  test('should list resources', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await createTestFile(path.join(ctx.tempDir, 'test1.md'), '# Note 1');
    await createTestFile(path.join(ctx.tempDir, 'test2.md'), '# Note 2');
    await repo.importFile(path.join(ctx.tempDir, 'test1.md'));
    await repo.importFile(path.join(ctx.tempDir, 'test2.md'));
    await repo.close();

    // 验证不抛异常，资源可通过 DB 验证
    await expect(listCommand({ _: ['lo'] })).resolves.toBeUndefined();

    const repo2 = new Repository(ctx.tempDir);
    await repo2.init();
    const resources = await repo2.getAllResources();
    await repo2.close();

    expect(resources.length).toBeGreaterThanOrEqual(2);
  });

  test('should handle empty repository', async () => {
    await expect(listCommand({ _: ['lo'] })).resolves.toBeUndefined();
  });

  test('should list with limit', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await createTestFile(path.join(ctx.tempDir, 'a.md'), '# A');
    await createTestFile(path.join(ctx.tempDir, 'b.md'), '# B');
    await createTestFile(path.join(ctx.tempDir, 'c.md'), '# C');
    await repo.importFile(path.join(ctx.tempDir, 'a.md'));
    await repo.importFile(path.join(ctx.tempDir, 'b.md'));
    await repo.importFile(path.join(ctx.tempDir, 'c.md'));
    await repo.close();

    await expect(listCommand({ _: ['lo'], limit: 2 })).resolves.toBeUndefined();
  });

  test('should report no resources when type filter matches nothing', async () => {
    const output = await runWithCapture({ type: 'note' });
    expect(output).toContain('暂无资源');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('should output json when format is json', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await createTestFile(path.join(ctx.tempDir, 'j.md'), '# JSON');
    await repo.importFile(path.join(ctx.tempDir, 'j.md'));
    await repo.close();

    const output = await runWithCapture({ format: 'json' });
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(1);
    expect(parsed[0].rid).toContain('...');
  });

  test('should detect various file statuses', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.init();

    await repo.createResource('note', '# Committed', { filename: 'committed.md', metadata: { title: 'Committed' } });
    await repo.createResource('note', '# Modified', { filename: 'modified.md', metadata: { title: 'Modified' } });
    await repo.createResource('note', '# Staged Add', { filename: 'stagedAdd.md', metadata: { title: 'Staged Add' } });
    await repo.createResource('note', '# Staged New', { filename: 'stagedNew.md', metadata: { title: 'Staged New' } });
    await repo.createResource('note', '# Staged Del', { filename: 'stagedDel.md', metadata: { title: 'Staged Del' } });
    await repo.createResource('note', '# Deleted', { filename: 'deleted.md', metadata: { title: 'Deleted' } });

    const modifiedPath = path.join(ctx.tempDir, 'resources', 'modified.md');
    await fs.writeFile(modifiedPath, '# Modified changed');

    const stagedAddPath = path.join(ctx.tempDir, 'resources', 'stagedAdd.md');
    await repo.staging.add(stagedAddPath);

    const stagedNewPath = path.join(ctx.tempDir, 'resources', 'stagedNew.md');
    await repo.db.run('UPDATE resources SET hash = ? WHERE location_kind = ? AND location = ?', ['', 'local', path.relative(ctx.tempDir, stagedNewPath)]);
    await repo.staging.add(stagedNewPath);

    const stagedDelPath = path.join(ctx.tempDir, 'resources', 'stagedDel.md');
    await repo.staging.remove(stagedDelPath);

    await fs.remove(path.join(ctx.tempDir, 'resources', 'deleted.md'));

    await fs.writeFile(path.join(ctx.tempDir, 'resources', 'untracked.md'), '# Untracked');
    await fs.writeFile(path.join(ctx.tempDir, 'resources', 'stagedUntracked.md'), '# Staged Untracked');
    await repo.staging.add(path.join(ctx.tempDir, 'resources', 'stagedUntracked.md'));
    await fs.ensureDir(path.join(ctx.tempDir, 'resources', 'subdir'));
    await fs.writeFile(path.join(ctx.tempDir, 'resources', 'unsupported.dat'), 'data');

    await repo.close();

    const output = await runWithCapture({});
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(output).toContain('committed');
    expect(output).toContain('modified');
    expect(output).toContain('stagedadd');
    expect(output).toContain('stagednew');
    expect(output).toContain('stageddel');
    expect(output).toContain('deleted');
    expect(output).toContain('untracked');
    expect(output).toContain('stagedUntracked');
    expect(output).toContain('修改');
    expect(output).toContain('新增');
    expect(output).toContain('删除');
    expect(output).toContain('未跟踪');
  });

  test('should list virtual and container resources', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await repo.resourceService.create({ name: 'virtual-1', type: 'book' });
    await repo.resourceService.create({ name: 'container-1', type: 'project', capabilities: ['container'] });
    await repo.close();

    const output = await runWithCapture({});
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(output).toContain('虚拟');
    expect(output).toContain('容器');
  });

  test('should filter by tag and category', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await repo.createResource('note', '# Tagged', {
      filename: 'tagged.md',
      metadata: { title: 'Tagged', tags: ['t1'], category: 'c1' }
    });
    await repo.createResource('note', '# Other', { filename: 'other.md', metadata: { title: 'Other' } });
    await repo.close();

    const output = await runWithCapture({ tag: 't1', category: 'c1' });
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(output).toContain('tagged');
    expect(output).not.toContain('Other');
  });

  test('should only show changed resources with --status', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await repo.createResource('note', '# Committed', { filename: 'committed.md', metadata: { title: 'Committed' } });
    await repo.createResource('note', '# Modified', { filename: 'modified.md', metadata: { title: 'Modified' } });
    await fs.writeFile(path.join(ctx.tempDir, 'resources', 'modified.md'), '# Modified changed');
    await repo.close();

    const output = await runWithCapture({ status: true });
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(output).toContain('modified');
    expect(output).not.toContain('committed');
  });

  test('should error when not in a repository', async () => {
    process.chdir(os.tmpdir());
    await listCommand({ _: ['lo'] });
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
