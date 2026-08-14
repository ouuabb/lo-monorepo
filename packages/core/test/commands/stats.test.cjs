const testUtils = global.testUtils;
const Repository = require('../../src/repo/repository.cjs');
const stats = require('../../src/commands/stats.cjs');

describe('stats command', () => {
  let ctx, repo;

  beforeEach(async () => {
    ctx = { originalCwd: process.cwd() };
    ctx.dir = await testUtils.createTempRepo();
    process.chdir(ctx.dir);
    jest.spyOn(process, 'exit').mockImplementation(() => {});
    repo = new Repository(ctx.dir);
    await repo.open();
  });

  afterEach(async () => {
    if (repo) await repo.close();
    process.chdir(ctx.originalCwd);
    await testUtils.cleanupTempDir(ctx.dir);
    jest.restoreAllMocks();
  });

  async function runWithCapture(argv) {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    let calls;
    try {
      await stats(argv);
      calls = spy.mock.calls.map(c => c.join(' ')).join('\n');
    } finally {
      spy.mockRestore();
    }
    return calls;
  }

  test('reports zero stats for an empty repository', async () => {
    const text = await runWithCapture({});
    expect(text).toContain('资源仓库统计');
    expect(text).toContain('资源总数:');
    expect(text).toContain('0');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('reports stats and per-type distribution', async () => {
    await repo.createResource('note', '# A', { filename: 'a.md', metadata: { title: 'A' } });
    await repo.createResource('note', '# B', { filename: 'b.md', metadata: { title: 'B' } });
    await repo.createResource('image', Buffer.from('img'), { filename: 'c.png', metadata: { title: 'C' } });

    const text = await runWithCapture({});
    expect(text).toContain('资源总数:');
    expect(text).toContain('关系总数:');
    expect(text).toContain('按类型分布');
    expect(text).toContain('- note: 2 个');
    expect(text).toContain('- image: 1 个');
    expect(text).toContain('最近活动');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('accepts today/week options', async () => {
    const text = await runWithCapture({ today: true, week: true });
    expect(text).toContain('资源总数:');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('omits recent activity when no resource timestamps exist', async () => {
    await repo.db.run('DELETE FROM resources');
    const text = await runWithCapture({});
    expect(text).toContain('资源总数:');
    expect(text).not.toContain('最近活动');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('errors when not in a repository', async () => {
    process.chdir(ctx.originalCwd);
    const text = await runWithCapture({});
    expect(text).toContain('获取统计信息失败');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
