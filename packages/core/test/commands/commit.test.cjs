const path = require('path');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const commit = require('../../src/commands/commit.cjs');

describe('commit command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('should exit 0 with empty staging area', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await commit({ _: ['lo', 'commit'] });
    expect(process.exit).toHaveBeenCalledWith(0);
    logSpy.mockRestore();
  });

  test('should commit staged files with a message', async () => {
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.staging.add(path.join(ctx.tempDir, 'test.md'), repo);
    await repo.close();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await commit({ _: ['lo', 'commit'], message: 'first commit' });

    expect(process.exit).toHaveBeenCalledWith(0);
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    const commits = await repo2.getCommits();
    expect(commits.length).toBe(1);
    expect(commits[0].message).toBe('first commit');
    await repo2.close();
    logSpy.mockRestore();
  });

  test('should support -m alias for message', async () => {
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.staging.add(path.join(ctx.tempDir, 'test.md'), repo);
    await repo.close();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await commit({ _: ['lo', 'commit'], m: 'short message' });

    expect(process.exit).toHaveBeenCalledWith(0);
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    const commits = await repo2.getCommits();
    expect(commits[0].message).toBe('short message');
    await repo2.close();
    logSpy.mockRestore();
  });

  test('should not commit when message is missing', async () => {
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.staging.add(path.join(ctx.tempDir, 'test.md'), repo);
    await repo.close();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await commit({ _: ['lo', 'commit'] });

    expect(process.exit).toHaveBeenCalledWith(0);
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    expect(await repo2.getCommits()).toHaveLength(0);
    await repo2.close();
    logSpy.mockRestore();
  });

  test('should support merge commits', async () => {
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.staging.add(path.join(ctx.tempDir, 'test.md'), repo);
    await repo.close();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await commit({ _: ['lo', 'commit'], message: 'merge', merge: true });

    expect(process.exit).toHaveBeenCalledWith(0);
    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    const commits = await repo2.getCommits();
    expect(commits[0].merge).toBe(1);
    await repo2.close();
    logSpy.mockRestore();
  });

  test('should reject when the commit flow throws', async () => {
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.staging.add(path.join(ctx.tempDir, 'test.md'), repo);
    await repo.close();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(Repository.prototype, 'commit').mockRejectedValueOnce(new Error('boom'));

    await expect(commit({ _: ['lo', 'commit'], message: 'x' })).rejects.toThrow('boom');
    logSpy.mockRestore();
  });
});
