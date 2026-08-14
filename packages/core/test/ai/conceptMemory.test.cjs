const path = require('path');
const Database = require('../../src/repo/database.cjs');
const ConceptMemory = require('../../src/ai/conceptMemory.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('ConceptMemory', () => {
  let tempDir, db, memory;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    memory = new ConceptMemory(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('save should create a new concept', async () => {
    const result = await memory.save({ name: 'c1', meaning: 'meaning one', confidence: 0.8 });
    expect(result.name).toBe('c1');
    expect(result.meaning).toBe('meaning one');
    expect(result.confidence).toBe(0.8);
    expect(result.relations).toEqual([]);
    expect(result.history[0].action).toBe('created');
    const rows = await db.all('SELECT * FROM ai_concepts');
    expect(rows).toHaveLength(1);
  });

  test('save should return null when name is missing', async () => {
    expect(await memory.save({ meaning: 'x' })).toBeNull();
  });

  test('save should update an existing concept and keep max confidence', async () => {
    await memory.save({ name: 'c1', meaning: 'first', confidence: 0.3, relations: ['r1'] });
    const updated = await memory.save({ name: 'c1', meaning: 'second', confidence: 0.6 });
    expect(updated.meaning).toBe('second');
    expect(updated.confidence).toBe(0.6);
    expect(updated.relations).toEqual(['r1']);
    expect(updated.history).toHaveLength(2);
    expect(updated.history[1].action).toBe('updated');
  });

  test('save should preserve existing meaning when not provided on update', async () => {
    await memory.save({ name: 'c1', meaning: 'first', confidence: 0.5 });
    const updated = await memory.save({ name: 'c1', confidence: 0.9 });
    expect(updated.meaning).toBe('first');
    expect(updated.confidence).toBe(0.9);
  });

  test('save should not lower confidence on update', async () => {
    await memory.save({ name: 'c1', meaning: 'm', confidence: 0.9 });
    const updated = await memory.save({ name: 'c1', meaning: 'm2', confidence: 0.1 });
    expect(updated.confidence).toBe(0.9);
  });

  test('search should match name or meaning and order by confidence', async () => {
    await memory.save({ name: 'alpine', meaning: 'mountain', confidence: 0.4 });
    await memory.save({ name: 'apple', meaning: 'fruit', confidence: 0.9 });
    await memory.save({ name: 'grape', meaning: 'fruit with seed', confidence: 0.7 });
    const result = await memory.search('fruit');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('apple');
    const byName = await memory.search('ALPINE');
    expect(byName).toHaveLength(1);
  });

  test('search should respect limit', async () => {
    await memory.save({ name: 'a1', meaning: 'm', confidence: 0.8 });
    await memory.save({ name: 'a2', meaning: 'm', confidence: 0.6 });
    const result = await memory.search('m', 1);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('a1');
  });

  test('get should return a hydrated concept', async () => {
    await memory.save({ name: 'c1', meaning: 'm', confidence: 0.5, relations: ['x'] });
    const got = await memory.get('c1');
    expect(got.name).toBe('c1');
    expect(got.relations).toEqual(['x']);
  });

  test('get should return null for missing concept', async () => {
    expect(await memory.get('missing')).toBeNull();
  });

  test('count should count concepts', async () => {
    await memory.save({ name: 'a', confidence: 0.5 });
    await memory.save({ name: 'b', confidence: 0.5 });
    expect(await memory.count()).toBe(2);
  });

  test('list should return ordered by confidence descending', async () => {
    await memory.save({ name: 'low', confidence: 0.2 });
    await memory.save({ name: 'high', confidence: 0.9 });
    const list = await memory.list();
    expect(list.map(c => c.name)).toEqual(['high', 'low']);
  });

  test('stats should report count and rounded average confidence', async () => {
    await memory.save({ name: 'a', confidence: 0.5 });
    await memory.save({ name: 'b', confidence: 0.3 });
    await memory.save({ name: 'c', confidence: 0.1 });
    const stats = await memory.stats();
    expect(stats.conceptCount).toBe(3);
    expect(stats.avgConfidence).toBe(0.3);
  });

  test('stats should handle empty table', async () => {
    const stats = await memory.stats();
    expect(stats.conceptCount).toBe(0);
    expect(stats.avgConfidence).toBe(0);
  });

  test('hydrate should recover from malformed relations and metadata', async () => {
    await db.run(
      `INSERT INTO ai_concepts (name, meaning, confidence, metadata, relations, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ['bad', 'm', 0.5, '{broken', '{also broken', Date.now()]
    );
    const rows = await db.all('SELECT * FROM ai_concepts WHERE name = ?', ['bad']);
    const hydrated = memory._hydrate(rows[0]);
    expect(hydrated.relations).toEqual([]);
    expect(hydrated.history).toEqual([]);
  });
});
