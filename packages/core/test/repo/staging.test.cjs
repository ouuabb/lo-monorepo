const fs = require('fs-extra');
const path = require('path');
const StagingArea = require('../../src/repo/staging.cjs');
const Database = require('../../src/repo/database.cjs');

describe('StagingArea', () => {
  let tempDir;
  let db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-staging-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.init();
  });

  afterEach(async () => {
    if (db) await db.close();
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('should throw error when db not injected', async () => {
    const staging = new StagingArea(tempDir);
    await expect(staging.getStatus()).rejects.toThrow('StagingArea: db 未注入');
  });

  test('should inject db via setDb()', () => {
    const staging = new StagingArea(tempDir);
    staging.setDb(db);
    expect(staging._db).toBe(db);
  });

  test('should get empty status when no changes', async () => {
    const staging = new StagingArea(tempDir);
    staging.setDb(db);

    const status = await staging.getStatus();
    expect(status.added).toEqual([]);
    expect(status.modified).toEqual([]);
    expect(status.deleted).toEqual([]);
    expect(status.renamed).toEqual([]);
    expect(status.metadata).toEqual([]);
  });

  test('should add file to staging', async () => {
    const staging = new StagingArea(tempDir);
    staging.setDb(db);

    const filePath = path.join(tempDir, 'test.md');
    await fs.writeFile(filePath, '# Test');

    await staging.add(filePath);
    const status = await staging.getStatus();

    expect(status.added).toContain('test.md');
  });

  test('should remove file from staging', async () => {
    const staging = new StagingArea(tempDir);
    staging.setDb(db);

    const filePath = path.join(tempDir, 'test.md');
    await fs.writeFile(filePath, '# Test');

    await staging.add(filePath);
    await staging.remove(filePath);

    const status = await staging.getStatus();
    expect(status.deleted).toContain('test.md');
  });

  test('should rename file in staging', async () => {
    const staging = new StagingArea(tempDir);
    staging.setDb(db);

    const oldPath = path.join(tempDir, 'old.md');
    const newPath = path.join(tempDir, 'new.md');
    await fs.writeFile(oldPath, '# Test');

    await staging.rename(oldPath, newPath);

    const status = await staging.getStatus();
    expect(status.renamed).toHaveLength(1);
    expect(status.renamed[0].old).toBe('old.md');
    expect(status.renamed[0].new).toBe('new.md');
  });

  test('should reset staging', async () => {
    const staging = new StagingArea(tempDir);
    staging.setDb(db);

    const filePath = path.join(tempDir, 'test.md');
    await fs.writeFile(filePath, '# Test');

    await staging.add(filePath);
    await staging.reset();

    const status = await staging.getStatus();
    expect(status.added).toEqual([]);
    expect(status.modified).toEqual([]);
    expect(status.deleted).toEqual([]);
  });

  test('should check if has changes', async () => {
    const staging = new StagingArea(tempDir);
    staging.setDb(db);

    expect(await staging.hasChanges()).toBe(false);

    const filePath = path.join(tempDir, 'test.md');
    await fs.writeFile(filePath, '# Test');
    await staging.add(filePath);

    expect(await staging.hasChanges()).toBe(true);
  });

  test('should stage metadata changes', async () => {
    const staging = new StagingArea(tempDir);
    staging.setDb(db);

    await staging.stageMetadata('res_123', { tags: ['tag1', 'tag2'] });

    const status = await staging.getStatus();
    expect(status.metadata).toHaveLength(1);
    expect(status.metadata[0].rid).toBe('res_123');
    expect(status.metadata[0].tags).toEqual(['tag1', 'tag2']);
  });

  test('should reset metadata changes', async () => {
    const staging = new StagingArea(tempDir);
    staging.setDb(db);

    await staging.stageMetadata('res_123', { tags: ['tag1'] });
    await staging.resetMetadata('res_123');

    const status = await staging.getStatus();
    expect(status.metadata).toEqual([]);
  });
});