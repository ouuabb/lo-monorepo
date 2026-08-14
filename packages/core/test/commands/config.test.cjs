const fs = require('fs-extra');
const path = require('path');
const { setupTempRepo, teardownTempRepo, Repository } = require('./commandTestHelper.cjs');
const configCmd = require('../../src/commands/config.cjs');

describe('config command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('should add category.defaultNote config', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'add', key: 'category.defaultNote', dir: '笔记' });
    expect(process.exit).toHaveBeenCalledWith(0);

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    expect(await repo.getConfig('category.defaultNote')).toBe('笔记');
    await repo.close();
    logSpy.mockRestore();
  });

  test('should reset category.defaultOther config', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.setConfig('category.defaultOther', '文献');
    await repo.close();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'rm', key: 'category.defaultOther' });
    expect(process.exit).toHaveBeenCalledWith(0);

    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    expect(await repo2.getConfig('category.defaultOther', '其他资源')).toBe('其他资源');
    await repo2.close();
    logSpy.mockRestore();
  });

  test('should list category defaults', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'list', key: 'category.defaultNote' });
    expect(process.exit).toHaveBeenCalledWith(0);
    logSpy.mockRestore();
  });

  test('should enable autoSync', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'add', key: 'autoSync', dir: 'true' });
    expect(process.exit).toHaveBeenCalledWith(0);

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    expect(await repo.getConfig('autoSync')).toBe(true);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should disable autoSync', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'add', key: 'autoSync', dir: '0' });
    expect(process.exit).toHaveBeenCalledWith(0);

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    expect(await repo.getConfig('autoSync')).toBe(false);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should list autoSync config', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'list', key: 'autoSync' });
    expect(process.exit).toHaveBeenCalledWith(0);
    logSpy.mockRestore();
  });

  test('should add a generic directory config', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'add', key: 'books', dir: '/some/books' });
    expect(process.exit).toHaveBeenCalledWith(0);

    const configPath = path.join(ctx.tempDir, '.note', 'config.json');
    const saved = await fs.readJson(configPath);
    expect(saved.directories.books).toBe('/some/books');
    logSpy.mockRestore();
  });

  test('should list generic config', async () => {
    await fs.ensureDir(path.join(ctx.tempDir, '.note'));
    await fs.writeJson(path.join(ctx.tempDir, '.note', 'config.json'), { directories: { a: 'b' } }, { spaces: 2 });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'list' });
    expect(process.exit).toHaveBeenCalledWith(0);
    logSpy.mockRestore();
  });

  test('should remove a generic directory config', async () => {
    await fs.ensureDir(path.join(ctx.tempDir, '.note'));
    await fs.writeJson(path.join(ctx.tempDir, '.note', 'config.json'), { directories: { books: '/x' } }, { spaces: 2 });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'rm', key: 'books' });
    expect(process.exit).toHaveBeenCalledWith(0);

    const config = await fs.readJson(path.join(ctx.tempDir, '.note', 'config.json'));
    expect(config.directories.books).toBeUndefined();
    logSpy.mockRestore();
  });

  test('should error when removing a missing generic key', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'rm', key: 'nope' });
    expect(process.exit).toHaveBeenCalledWith(0);
    logSpy.mockRestore();
  });

  test('should error and exit 1 when adding without dir', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'add', key: 'books' });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  test('should error and exit 1 when removing without key', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await configCmd({ _: ['lo'], action: 'rm' });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  test('should report failure and exit 1 on write error', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(fs, 'writeJson').mockRejectedValueOnce(new Error('io error'));
    await configCmd({ _: ['lo'], action: 'add', key: 'books', dir: '/x' });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });
});
