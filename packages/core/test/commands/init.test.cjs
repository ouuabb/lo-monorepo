const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const init = require('../../src/commands/init.cjs');
const Repository = require('../../src/repo/repository.cjs');

describe('init command', () => {
  let base;
  let originalCwd;

  beforeEach(async () => {
    originalCwd = process.cwd();
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-'));
    jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    jest.restoreAllMocks();
    if (base && await fs.pathExists(base)) {
      await fs.remove(base);
    }
  });

  test('should init a repository in the current directory', async () => {
    const target = path.join(base, 'cwd-repo');
    await fs.ensureDir(target);
    process.chdir(target);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await init({ _: ['lo', 'init'] });

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(await fs.pathExists(path.join(target, '.repo'))).toBe(true);
    expect(await fs.pathExists(path.join(target, 'templates', 'default.md.template'))).toBe(true);
    expect(await fs.pathExists(path.join(target, 'templates', 'daily.md.template'))).toBe(true);
    expect(await fs.pathExists(path.join(target, '.gitignore'))).toBe(true);
    expect(await fs.pathExists(path.join(target, '.repo', 'keys'))).toBe(true);
    logSpy.mockRestore();
  });

  test('should init a repository at argv.path', async () => {
    const target = path.join(base, 'path-repo');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await init({ _: ['lo', 'init'], path: target });

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(await fs.pathExists(path.join(target, '.repo'))).toBe(true);
    logSpy.mockRestore();
  });

  test('should init a repository as a subdirectory when name given', async () => {
    const target = path.join(base, 'parent');
    await fs.ensureDir(target);
    process.chdir(target);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await init({ _: ['lo', 'init'], name: 'my-notes' });

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(await fs.pathExists(path.join(target, 'my-notes', '.repo'))).toBe(true);
    logSpy.mockRestore();
  });

  test('should init at an absolute name path', async () => {
    const target = path.join(base, 'abs-repo');
    process.chdir(base);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await init({ _: ['lo', 'init'], name: target });

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(await fs.pathExists(path.join(target, '.repo'))).toBe(true);
    logSpy.mockRestore();
  });

  test('should enable encryption when encrypt flag is set', async () => {
    const target = path.join(base, 'enc-repo');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await init({ _: ['lo', 'init'], path: target, encrypt: true });

    expect(process.exit).toHaveBeenCalledWith(0);
    const repo = new Repository(target);
    await repo.open({ skipAuth: true });
    expect(await repo.getConfig('crypto.encryptByDefault')).toBe(true);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should warn and exit 0 when the repo already exists', async () => {
    const target = path.join(base, 'existing');
    await fs.ensureDir(path.join(target, '.repo'));
    process.chdir(base);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await init({ _: ['lo', 'init'], path: target });

    expect(process.exit).toHaveBeenCalledWith(0);
    logSpy.mockRestore();
  });

  test('should preserve existing .gitignore content', async () => {
    const target = path.join(base, 'gitignore-repo');
    await fs.ensureDir(target);
    await fs.writeFile(path.join(target, '.gitignore'), 'custom-entry\n');
    process.chdir(base);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await init({ _: ['lo', 'init'], path: target });

    const gitignore = await fs.readFile(path.join(target, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('custom-entry');
    expect(gitignore).toContain('.repo/');
    logSpy.mockRestore();
  });

  test('should report failure and exit 1 when repository creation fails', async () => {
    process.chdir(base);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(Repository, 'create').mockRejectedValueOnce(new Error('init failed'));

    await init({ _: ['lo', 'init'], path: path.join(base, 'fail-repo') });

    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });
});
