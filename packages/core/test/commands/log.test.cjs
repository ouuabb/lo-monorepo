const testUtils = global.testUtils;
const Repository = require('../../src/repo/repository.cjs');
const log = require('../../src/commands/log.cjs');

describe('log command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = { originalCwd: process.cwd() };
    ctx.dir = await testUtils.createTempRepo();
    process.chdir(ctx.dir);
    process.exit.mockClear();
  });

  afterEach(async () => {
    process.chdir(ctx.originalCwd);
    await testUtils.cleanupTempDir(ctx.dir);
  });

  async function openRepo() {
    const repo = new Repository(ctx.dir);
    await repo.open();
    return repo;
  }

  test('prints notice when no commits exist', async () => {
    const repo = await openRepo();
    await repo.close();

    const spy = jest.spyOn(console, 'log');
    await log({});
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('暂无提交记录'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('lists commits with change stats', async () => {
    const repo = await openRepo();
    await repo.commit('first commit', { added: 2, updated: 1, deleted: 1, renamed: 1, metadata: 1 });
    await repo.commit('second commit', { added: 0, updated: 0, deleted: 0, renamed: 0, metadata: 0 });
    await repo.close();

    const spy = jest.spyOn(console, 'log');
    await log({});
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('提交历史'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('HEAD'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('first commit'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('+2'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('~1'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('M1'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('supports the limit option', async () => {
    const repo = await openRepo();
    for (let i = 0; i < 5; i++) {
      await repo.commit(`commit ${i}`, { added: 1, updated: 0, deleted: 0, renamed: 0, metadata: 0 });
    }
    await repo.close();

    const spy = jest.spyOn(console, 'log');
    await log({ limit: 2 });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('HEAD'));
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('HEAD~4'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('supports the n option as a limit alias', async () => {
    const repo = await openRepo();
    for (let i = 0; i < 3; i++) {
      await repo.commit(`commit ${i}`, { added: 1, updated: 0, deleted: 0, renamed: 0, metadata: 0 });
    }
    await repo.close();

    const spy = jest.spyOn(console, 'log');
    await log({ n: 1 });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('HEAD'));
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('HEAD~1'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('defaults to 20 commits when no limit provided', async () => {
    const repo = await openRepo();
    for (let i = 0; i < 25; i++) {
      await repo.commit(`commit ${i}`, { added: 1, updated: 0, deleted: 0, renamed: 0, metadata: 0 });
    }
    await repo.close();

    const spy = jest.spyOn(console, 'log');
    await log({});
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('HEAD~19'));
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('HEAD~20'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('errors when not in a repository', async () => {
    process.chdir(ctx.originalCwd);
    const spy = jest.spyOn(console, 'log');
    await expect(log({})).rejects.toThrow();
    spy.mockRestore();
  });
});
