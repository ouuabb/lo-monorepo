const path = require('path');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const link = require('../../src/commands/link.cjs');

describe('link command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  async function createResource(name, content) {
    const filePath = path.join(ctx.tempDir, name);
    await createTestFile(filePath, content || `# ${name}`);
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resource = await repo.importFile(filePath);
    await repo.close();
    return resource;
  }

  test('should link two resources with default type', async () => {
    const a = await createResource('a.md');
    const b = await createResource('b.md');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await link({ _: ['lo'], from: a.rid, to: b.rid });
    expect(process.exit).toHaveBeenCalledWith(0);

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const { outgoing } = await repo.relationService.getRelations(a.rid);
    expect(outgoing.length).toBeGreaterThan(0);
    expect(outgoing[0].type).toBe('reference');
    await repo.close();
    logSpy.mockRestore();
  });

  test('should link with an explicit type', async () => {
    const a = await createResource('a.md');
    const b = await createResource('b.md');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await link({ _: ['lo'], from: a.rid, to: b.rid, type: 'related' });
    expect(process.exit).toHaveBeenCalledWith(0);

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const { outgoing } = await repo.relationService.getRelations(a.rid);
    expect(outgoing.some(r => r.type === 'related')).toBe(true);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should error and exit 1 when source resource is missing', async () => {
    const b = await createResource('b.md');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await link({ _: ['lo'], from: 'res_missing', to: b.rid });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  test('should error and exit 1 when target resource is missing', async () => {
    const a = await createResource('a.md');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await link({ _: ['lo'], from: a.rid, to: 'res_missing' });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  test('should report failure and exit 1 on error', async () => {
    const a = await createResource('a.md');
    const b = await createResource('b.md');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(Repository.prototype, 'linkResources').mockRejectedValueOnce(new Error('link failed'));
    await link({ _: ['lo'], from: a.rid, to: b.rid });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });
});
