const testUtils = global.testUtils;
const Repository = require('../../src/repo/repository.cjs');
const remote = require('../../src/commands/remote.cjs');

describe('remote command', () => {
  let ctx, repo;

  beforeEach(async () => {
    ctx = { originalCwd: process.cwd() };
    ctx.dir = await testUtils.createTempRepo();
    process.chdir(ctx.dir);
    process.exit.mockClear();
    repo = new Repository(ctx.dir);
    await repo.open();
  });

  afterEach(async () => {
    if (repo) await repo.close();
    process.chdir(ctx.originalCwd);
    await testUtils.cleanupTempDir(ctx.dir);
  });

  describe('add', () => {
    test('adds a remote alias', async () => {
      const spy = jest.spyOn(console, 'log');
      await remote({ action: 'add', name: 'origin', url: 'user@host:/data/notes' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('远程别名已添加'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();

      const row = await repo.db.get("SELECT value FROM sync_config WHERE key = 'sync.remote.origin'");
      expect(row.value).toBe('user@host:/data/notes');
    });

    test('replaces an existing alias', async () => {
      await remote({ action: 'add', name: 'origin', url: 'old@host:/x' });
      process.exit.mockClear();
      await remote({ action: 'add', name: 'origin', url: 'new@host:/y' });
      const row = await repo.db.get("SELECT value FROM sync_config WHERE key = 'sync.remote.origin'");
      expect(row.value).toBe('new@host:/y');
    });

    test('errors when name is missing', async () => {
      const spy = jest.spyOn(console, 'log');
      await remote({ action: 'add', url: 'user@host:/p' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('用法: lo remote add'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });

    test('errors when url is missing', async () => {
      const spy = jest.spyOn(console, 'log');
      await remote({ action: 'add', name: 'origin' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('用法: lo remote add'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });

  describe('remove', () => {
    test('removes an existing alias', async () => {
      await remote({ action: 'add', name: 'origin', url: 'user@host:/p' });
      process.exit.mockClear();
      const spy = jest.spyOn(console, 'log');
      await remote({ action: 'remove', name: 'origin' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('远程别名已移除'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();

      const row = await repo.db.get("SELECT value FROM sync_config WHERE key = 'sync.remote.origin'");
      expect(row).toBeUndefined();
    });

    test('supports rm as an alias for remove', async () => {
      await remote({ action: 'add', name: 'dev', url: 'dev@host:/p' });
      process.exit.mockClear();
      await remote({ action: 'rm', name: 'dev' });
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('errors when alias does not exist', async () => {
      const spy = jest.spyOn(console, 'log');
      await remote({ action: 'remove', name: 'ghost' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('远程别名不存在'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });

    test('errors when name is missing', async () => {
      const spy = jest.spyOn(console, 'log');
      await remote({ action: 'remove' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('用法: lo remote remove'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });

  describe('list', () => {
    test('reports when no aliases are configured', async () => {
      const spy = jest.spyOn(console, 'log');
      await remote({ action: 'list' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('没有已配置的远程别名'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('lists configured aliases sorted by key', async () => {
      await remote({ action: 'add', name: 'beta', url: 'b@host:/p' });
      await remote({ action: 'add', name: 'alpha', url: 'a@host:/p' });
      process.exit.mockClear();
      const spy = jest.spyOn(console, 'log');
      await remote({ action: 'ls' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('alpha'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('beta'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });
  });

  test('reads the action from argv._ when action is absent', async () => {
    const spy = jest.spyOn(console, 'log');
    await remote({ _: ['lo', 'list'] });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('没有已配置的远程别名'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('prints usage for an unknown action', async () => {
    const spy = jest.spyOn(console, 'log');
    await remote({ action: 'explode' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('用法: lo remote'));
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });

  describe('resolveRemote', () => {
    test('resolves an alias to its configured value', async () => {
      await remote({ action: 'add', name: 'origin', url: 'user@host:/data' });
      process.exit.mockClear();
      const resolved = await remote.resolveRemote(repo.db, 'origin');
      expect(resolved).toBe('user@host:/data');
    });

    test('returns the input unchanged when it is not an alias', async () => {
      const resolved = await remote.resolveRemote(repo.db, 'user@host:/data');
      expect(resolved).toBe('user@host:/data');
    });
  });
});
