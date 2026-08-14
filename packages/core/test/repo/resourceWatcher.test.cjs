const path = require('path');
const fs = require('fs-extra');
const Database = require('../../src/repo/database.cjs');
const ResourceWatcher = require('../../src/repo/resourceWatcher.cjs');
const HashUtils = require('../../src/utils/hash.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('ResourceWatcher', () => {
  let tempDir, db, watcher;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    watcher = new ResourceWatcher(db, tempDir);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function seedResource(overrides) {
    const now = Date.now();
    const data = {rid: `res_${  Math.random().toString(36).slice(2)}`,
      name: 'file.md',
      layer: 0,
      type: 'note',
      path: '',
      hash: null,
      created: now,
      updated: now, ...overrides};
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, path, hash, created, updated, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [data.rid, data.name, data.layer, data.type, data.path, data.hash, data.created, data.updated]
    );
    return data;
  }

  test('constructor should store db and repoPath', () => {
    expect(watcher.db).toBe(db);
    expect(watcher.repoPath).toBe(tempDir);
  });

  test('check should return empty results when no tracked files', async () => {
    const result = await watcher.check();
    expect(result).toEqual({ missing: [], modified: [], suggestions: [] });
  });

  test('check should skip resources with empty path', async () => {
    await seedResource({ path: '', hash: null });
    const result = await watcher.check();
    expect(result.missing).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });

  test('check should flag missing file and emit suggestion', async () => {
    const gonePath = path.join(tempDir, 'gone.md');
    const res = await seedResource({ path: gonePath, hash: 'abc' });

    const result = await watcher.check();
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toMatchObject({
      rid: res.rid,
      name: res.name,
      path: gonePath,
      issue: 'resource.missing'
    });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      type: 'resource.missing',
      source: res.rid,
      confidence: 1.0,
      priority: 'high',
      sourceCategory: 'watcher',
      reason: `File deleted: ${gonePath}`
    });
    expect(result.suggestions[0].payload.actions).toEqual(['restore', 'remove_relation', 'ignore']);
  });

  test('check should flag modified file when hash differs', async () => {
    const filePath = await testUtils.createTestFile(tempDir, 'note.md', 'aaa');
    const res = await seedResource({ path: filePath, hash: HashUtils.fromString('aaa') });
    await fs.writeFile(filePath, 'bbb');

    const result = await watcher.check();
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0]).toMatchObject({
      rid: res.rid,
      path: filePath,
      oldHash: HashUtils.fromString('aaa'),
      newHash: HashUtils.fromString('bbb'),
      issue: 'resource.modified'
    });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      type: 'resource.modified',
      confidence: 0.9,
      priority: 'medium',
      sourceCategory: 'watcher'
    });
    expect(result.suggestions[0].payload).toEqual({
      rid: res.rid,
      path: filePath,
      oldHash: HashUtils.fromString('aaa'),
      newHash: HashUtils.fromString('bbb')
    });
  });

  test('check should ignore files whose hash matches', async () => {
    const filePath = await testUtils.createTestFile(tempDir, 'ok.md', 'same');
    await seedResource({ path: filePath, hash: HashUtils.fromString('same') });

    const result = await watcher.check();
    expect(result.missing).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });

  test('check should flag unreadable paths without emitting suggestion', async () => {
    const dirPath = path.join(tempDir, 'blocked-dir');
    await fs.ensureDir(dirPath);
    const res = await seedResource({ path: dirPath, hash: 'abc' });

    const result = await watcher.check();
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toMatchObject({
      rid: res.rid,
      issue: 'resource.unreadable'
    });
    expect(result.missing[0].error).toBeTruthy();
    expect(result.suggestions).toHaveLength(0);
  });

  test('check should combine missing and modified in one pass', async () => {
    const missingPath = path.join(tempDir, 'nope.md');
    const filePath = await testUtils.createTestFile(tempDir, 'changed.md', 'v1');
    await seedResource({ rid: 'res_missing', name: 'missing.md', path: missingPath, hash: 'x' });
    await seedResource({ rid: 'res_modified', name: 'modified.md', path: filePath, hash: HashUtils.fromString('v1') });
    await fs.writeFile(filePath, 'v2');

    const result = await watcher.check();
    expect(result.missing).toHaveLength(1);
    expect(result.modified).toHaveLength(1);
    expect(result.suggestions).toHaveLength(2);
  });

  test('recordEvent should insert a knowledge event', async () => {
    await watcher.recordEvent({ type: 'resource.missing', rid: 'res_1', payload: { path: '/x' } });
    const rows = await db.all('SELECT * FROM knowledge_events');
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('resource.missing');
    expect(rows[0].rid).toBe('res_1');
    expect(JSON.parse(rows[0].payload)).toEqual({ path: '/x' });
    expect(rows[0].created).toBeGreaterThan(0);
  });

  test('recordEvent should default payload to empty object', async () => {
    await watcher.recordEvent({ type: 'resource.modified', rid: 'res_2' });
    const rows = await db.all('SELECT * FROM knowledge_events');
    expect(JSON.parse(rows[0].payload)).toEqual({});
  });
});
