const path = require('path');
const Database = require('../../src/repo/database.cjs');
const SemanticMemory = require('../../src/ai/semanticMemory.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('SemanticMemory', () => {
  let tempDir, db, memory;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    memory = new SemanticMemory(db);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('save should insert a row with defaults', async () => {
    const result = await memory.save({ concept: 'c1', value: 'some value' });
    expect(result.type).toBe('concept');
    expect(result.concept).toBe('c1');
    expect(result.confidence).toBe(0.5);
    const rows = await db.all('SELECT * FROM ai_memory');
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('concept');
    expect(rows[0].value).toBe('some value');
    expect(rows[0].tags).toBe('[]');
  });

  test('save should stringify non-string values', async () => {
    const result = await memory.save({ type: 'insight', concept: 'c2', value: { nested: true } });
    expect(result.value).toEqual({ nested: true });
    const rows = await db.all('SELECT * FROM ai_memory WHERE concept = ?', ['c2']);
    expect(JSON.parse(rows[0].value)).toEqual({ nested: true });
  });

  test('save should persist tags as JSON', async () => {
    await memory.save({ concept: 'c3', value: 'v', tags: ['t1', 't2'] });
    const rows = await db.all('SELECT * FROM ai_memory WHERE concept = ?', ['c3']);
    expect(JSON.parse(rows[0].tags)).toEqual(['t1', 't2']);
  });

  test('retrieve should find by concept case-insensitively', async () => {
    await memory.save({ concept: 'Foo Bar', value: 'alpha', confidence: 0.9 });
    const result = await memory.retrieve('foo');
    expect(result).toHaveLength(1);
    expect(result[0].concept).toBe('Foo Bar');
  });

  test('retrieve should return empty when no match', async () => {
    await memory.save({ concept: 'x', value: 'y' });
    expect(await memory.retrieve('zzz')).toEqual([]);
  });

  test('retrieve without query should return latest first reversed to oldest', async () => {
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(300);
    await memory.save({ concept: 'a', value: '1' });
    await memory.save({ concept: 'b', value: '2' });
    await memory.save({ concept: 'c', value: '3' });
    const result = await memory.retrieve(null, 10);
    expect(result.map(r => r.concept)).toEqual(['a', 'b', 'c']);
    Date.now.mockRestore();
  });

  test('retrieve without query should respect limit', async () => {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(1);
    for (let i = 0; i < 5; i++) {
      spy.mockReturnValue(i + 1);
      await memory.save({ concept: `c${  i}`, value: `v${  i}` });
    }
    const result = await memory.retrieve('', 2);
    expect(result).toHaveLength(2);
    spy.mockRestore();
  });

  test('getByType should filter by type', async () => {
    await memory.save({ type: 'preference', concept: 'p1', value: 'v' });
    await memory.save({ type: 'experience', concept: 'e1', value: 'v' });
    const result = await memory.getByType('preference');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('preference');
  });

  test('stats should report entryCount and byType', async () => {
    await memory.save({ type: 'experience', concept: 'a', value: 'v' });
    await memory.save({ type: 'experience', concept: 'b', value: 'v' });
    await memory.save({ type: 'pattern', concept: 'c', value: 'v' });
    const stats = await memory.stats();
    expect(stats.entryCount).toBe(3);
    expect(stats.byType).toEqual({ experience: 2, pattern: 1 });
  });

  test('hydrate should recover from malformed value and tags', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    try {
      await db.run(
        `INSERT INTO ai_memory (type, concept, value, confidence, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        ['concept', 'bad', '{not json', 0.5, '{broken', Date.now()]
      );
      const rows = await db.all('SELECT * FROM ai_memory WHERE concept = ?', ['bad']);
      const hydrated = memory._hydrate(rows[0]);
      expect(hydrated.value).toBe('{not json');
      expect(hydrated.tags).toEqual([]);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
