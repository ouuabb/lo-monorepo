const path = require('path');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const deleteCommand = require('../../src/commands/delete.cjs');

jest.mock('readline');

describe('delete command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  async function createResource(name = 'test.md') {
    const filePath = path.join(ctx.tempDir, name);
    await createTestFile(filePath, `# ${name}`);
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resource = await repo.importFile(filePath);
    await repo.close();
    return resource;
  }

  test('should soft delete a resource with force', async () => {
    const resource = await createResource();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await deleteCommand({ _: ['lo'], rid: resource.rid, force: true });
    expect(process.exit).toHaveBeenCalledWith(0);

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const gone = await repo.db.get('SELECT * FROM resources WHERE rid = ?', [resource.rid]);
    expect(gone.deleted).toBe(1);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should hard delete a resource and remove its file', async () => {
    const resource = await createResource();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await deleteCommand({ _: ['lo'], rid: resource.rid, force: true, hard: true });
    expect(process.exit).toHaveBeenCalledWith(0);

    expect(await fs.pathExists(resource.path)).toBe(false);
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const gone = await repo.db.get('SELECT * FROM resources WHERE rid = ?', [resource.rid]);
    expect(gone.deleted).toBe(1);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should report error and exit 1 for missing resource', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await deleteCommand({ _: ['lo'], rid: 'res_missing', force: true });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  test('should cancel when the user answers no', async () => {
    const resource = await createResource();
    require('readline').createInterface.mockReturnValueOnce({
      question: (prompt, cb) => cb('n'),
      close: jest.fn()
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await deleteCommand({ _: ['lo'], rid: resource.rid });
    expect(process.exit).toHaveBeenCalledWith(0);

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const still = await repo.db.get('SELECT * FROM resources WHERE rid = ?', [resource.rid]);
    expect(still.deleted).toBe(0);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should proceed when the user confirms', async () => {
    const resource = await createResource();
    require('readline').createInterface.mockReturnValueOnce({
      question: (prompt, cb) => cb('Y'),
      close: jest.fn()
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await deleteCommand({ _: ['lo'], rid: resource.rid });
    expect(process.exit).toHaveBeenCalledWith(0);

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const gone = await repo.db.get('SELECT * FROM resources WHERE rid = ?', [resource.rid]);
    expect(gone.deleted).toBe(1);
    await repo.close();
    logSpy.mockRestore();
  });

  test('should report failure and exit 1 on error', async () => {
    const resource = await createResource();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(Repository.prototype, 'deleteResource').mockRejectedValueOnce(new Error('db error'));
    await deleteCommand({ _: ['lo'], rid: resource.rid, force: true });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });
});
