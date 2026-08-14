const path = require('path');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const importCmd = require('../../src/commands/import.cjs');
const { findImporter, coreImportFile } = importCmd;

describe('import command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('should import a single file', async () => {
    const filePath = await createTestFile(path.join(ctx.tempDir, 'import.md'), '# Imported');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await importCmd({ _: ['lo', 'import'], path: filePath });

    expect(process.exit).toHaveBeenCalledWith(0);
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resources = await repo.resourceService.getAll();
    expect(resources.filter(r => r.rid !== '__system__')).toHaveLength(1);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should import a single file with an explicit category', async () => {
    const filePath = await createTestFile(path.join(ctx.tempDir, 'import.md'), '# Imported');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await importCmd({ _: ['lo', 'import'], path: filePath, category: '阅读' });

    expect(process.exit).toHaveBeenCalledWith(0);
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resources = await repo.resourceService.getAll();
    expect(resources[0].metadata.category).toBe('阅读');
    await repo.close();
    logSpy.mockRestore();
  });

  test('should error and exit 1 when the path does not exist', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await importCmd({ _: ['lo', 'import'], path: path.join(ctx.tempDir, 'missing.md') });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  test('should import a directory', async () => {
    const dir = path.join(ctx.tempDir, 'src');
    await fs.ensureDir(dir);
    await createTestFile(path.join(dir, 'one.md'), '# One');
    await createTestFile(path.join(dir, 'two.md'), '# Two');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await importCmd({ _: ['lo', 'import'], path: dir });

    expect(process.exit).toHaveBeenCalledWith(0);
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resources = await repo.resourceService.getAll();
    expect(resources.filter(r => r.rid !== '__system__')).toHaveLength(2);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should import a directory with a category applied to all', async () => {
    const dir = path.join(ctx.tempDir, 'src');
    await fs.ensureDir(dir);
    await createTestFile(path.join(dir, 'one.md'), '# One');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await importCmd({ _: ['lo', 'import'], path: dir, category: '代码' });

    expect(process.exit).toHaveBeenCalledWith(0);
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resources = await repo.resourceService.getAll();
    expect(resources.filter(r => r.rid !== '__system__')[0].metadata.category).toBe('代码');
    await repo.close();
    logSpy.mockRestore();
  });

  test('should use an importer when one matches', async () => {
    const filePath = await createTestFile(path.join(ctx.tempDir, 'custom.xyz'), '# Custom');
    const importer = {
      import: jest.fn().mockResolvedValue({
        resources: [{ rid: 'res_imp', type: 'note', metadata: {} }],
        relations: [{ id: 'rel1' }]
      })
    };
    jest.spyOn(Repository.prototype, 'getPluginExtensionRegistry').mockReturnValue({
      list: jest.fn(() => [{ key: 'myImp', pluginId: 'p1', handler: importer }])
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await importCmd({ _: ['lo', 'import'], path: filePath, category: '插件' });

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(importer.import).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('should fall back to core import when importer fails', async () => {
    const filePath = await createTestFile(path.join(ctx.tempDir, 'custom.md'), '# Custom');
    const importer = {
      import: jest.fn().mockRejectedValue(new Error('importer broke'))
    };
    jest.spyOn(Repository.prototype, 'getPluginExtensionRegistry').mockReturnValue({
      list: jest.fn(() => [{ key: 'myImp', pluginId: 'p1', handler: importer }])
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await importCmd({ _: ['lo', 'import'], path: filePath });

    expect(process.exit).toHaveBeenCalledWith(0);
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resources = await repo.resourceService.getAll();
    expect(resources.filter(r => r.rid !== '__system__')).toHaveLength(1);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should not fall back when importer returns no resources', async () => {
    const filePath = await createTestFile(path.join(ctx.tempDir, 'custom.md'), '# Custom');
    const importer = {
      import: jest.fn().mockResolvedValue({ resources: [], relations: [] })
    };
    jest.spyOn(Repository.prototype, 'getPluginExtensionRegistry').mockReturnValue({
      list: jest.fn(() => [{ key: 'myImp', pluginId: 'p1', handler: importer }])
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await importCmd({ _: ['lo', 'import'], path: filePath });

    expect(process.exit).toHaveBeenCalledWith(0);
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resources = await repo.resourceService.getAll();
    expect(resources.filter(r => r.rid !== '__system__')).toHaveLength(0);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should report failure and exit 1 when import throws', async () => {
    const filePath = await createTestFile(path.join(ctx.tempDir, 'import.md'), '# Imported');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(Repository.prototype, 'importFile').mockRejectedValueOnce(new Error('import failed'));

    await importCmd({ _: ['lo', 'import'], path: filePath });

    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  describe('findImporter', () => {
    test('should return null for non-array importers', () => {
      expect(findImporter(null, '/a.md', {}, { error: jest.fn() })).toBeNull();
    });

    test('should skip entries missing import()', () => {
      const logger = { error: jest.fn() };
      const result = findImporter(
        [{ key: 'bad', pluginId: null, handler: {} }, { key: 'ok', pluginId: 'p', handler: { import: jest.fn() } }],
        '/a.md', {}, logger
      );
      expect(result.key).toBe('ok');
      expect(logger.error).toHaveBeenCalled();
    });

    test('should normalize function-form handlers', () => {
      const fn = jest.fn();
      const result = findImporter([{ key: 'f', pluginId: null, handler: fn }], '/a.md', {}, { error: jest.fn() });
      expect(result.handler.import).toBe(fn);
    });

    test('should honor supports() returning false', () => {
      const result = findImporter(
        [{ key: 'no', pluginId: null, handler: { supports: () => false, import: jest.fn() } }],
        '/a.md', {}, { error: jest.fn() }
      );
      expect(result).toBeNull();
    });

    test('should isolate supports() throwing', () => {
      const logger = { error: jest.fn() };
      const result = findImporter(
        [{ key: 'no', pluginId: null, handler: { supports: () => { throw new Error('x'); }, import: jest.fn() } }],
        '/a.md', {}, logger
      );
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });

    test('should return the first matching importer', () => {
      const h1 = { import: jest.fn() };
      const h2 = { import: jest.fn() };
      const result = findImporter(
        [
          { key: 'a', pluginId: 'p1', handler: h1 },
          { key: 'b', pluginId: 'p2', handler: h2 }
        ],
        '/a.md', {}, { error: jest.fn() }
      );
      expect(result).toMatchObject({ key: 'a', pluginId: 'p1' });
      expect(result.handler).toBe(h1);
    });
  });

  describe('coreImportFile', () => {
    test('should import a file and set the given category', async () => {
      const filePath = await createTestFile(path.join(ctx.tempDir, 'core.md'), '# Core');
      const repo = new Repository(ctx.tempDir);
      await repo.open();
      const resource = await coreImportFile(repo, filePath, null, '指定分类', '未分类', '其他资源');
      expect(resource.rid).toBeDefined();
      const after = await repo.resourceService.getByRid(resource.rid);
      expect(after.metadata.category).toBe('指定分类');
      await repo.close();
    });

    test('should apply default category based on type', async () => {
      const filePath = await createTestFile(path.join(ctx.tempDir, 'core.md'), '# Core');
      const repo = new Repository(ctx.tempDir);
      await repo.open();
      const resource = await coreImportFile(repo, filePath, 'note', null, '默认笔记', '其他资源');
      const after = await repo.resourceService.getByRid(resource.rid);
      expect(after.metadata.category).toBe('默认笔记');
      await repo.close();
    });
  });
});
