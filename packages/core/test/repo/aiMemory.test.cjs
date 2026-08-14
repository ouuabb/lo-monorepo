const path = require('path');
const Database = require('../../src/repo/database.cjs');
const AIMemory = require('../../src/repo/aiMemory.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('AIMemory', () => {
  let tempDir, db, memory;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    memory = new AIMemory(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function seed(type, rid, content, created) {
    await db.run(
      `INSERT INTO ai_memory (type, resource_rid, value, created_at) VALUES (?, ?, ?, ?)`,
      [type, rid, JSON.stringify(content), created]
    );
  }

  describe('save', () => {
    test('persists a memory row and returns an id', async () => {
      const id = await memory.save({ rid: 'r1', type: 'summary', content: { x: 1 } });
      expect(typeof id).toBe('number');
      const rows = await db.all('SELECT * FROM ai_memory WHERE id = ?', [id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].resource_rid).toBe('r1');
      expect(rows[0].type).toBe('summary');
      expect(JSON.parse(rows[0].value)).toEqual({ x: 1 });
      expect(rows[0].created_at).toBeGreaterThan(0);
    });

    test('stores null rid when not provided', async () => {
      await memory.save({ type: 'global', content: { a: 1 } });
      const rows = await db.all('SELECT * FROM ai_memory');
      expect(rows[0].resource_rid).toBeNull();
    });
  });

  describe('getByResource', () => {
    test('returns memories for a resource in descending order', async () => {
      await seed('summary', 'r1', { n: 1 }, 100);
      await seed('summary', 'r1', { n: 2 }, 200);
      await seed('note', 'r1', { n: 3 }, 300);
      await seed('summary', 'r2', { n: 4 }, 400);

      const rows = await memory.getByResource('r1');
      expect(rows).toHaveLength(3);
      expect(rows.map(r => r.content.n)).toEqual([3, 2, 1]);
      expect(rows[0].rid).toBe('r1');
    });

    test('filters by type', async () => {
      await seed('summary', 'r1', { n: 1 }, 100);
      await seed('note', 'r1', { n: 2 }, 200);
      const rows = await memory.getByResource('r1', { type: 'note' });
      expect(rows).toHaveLength(1);
      expect(rows[0].content.n).toBe(2);
    });

    test('respects limit option', async () => {
      await seed('summary', 'r1', { n: 1 }, 100);
      await seed('summary', 'r1', { n: 2 }, 200);
      const rows = await memory.getByResource('r1', { limit: 1 });
      expect(rows).toHaveLength(1);
    });

    test('returns empty for unknown resource', async () => {
      expect(await memory.getByResource('ghost')).toEqual([]);
    });
  });

  describe('getByType', () => {
    test('returns all memories of a type', async () => {
      await seed('summary', 'r1', { n: 1 }, 100);
      await seed('summary', 'r2', { n: 2 }, 200);
      await seed('note', 'r1', { n: 3 }, 300);
      const rows = await memory.getByType('summary');
      expect(rows).toHaveLength(2);
      expect(rows[0].content.n).toBe(2);
    });
  });

  describe('cleanup', () => {
    test('deletes memories older than the cutoff', async () => {
      await seed('summary', 'r1', { n: 1 }, 100);
      await seed('summary', 'r1', { n: 2 }, 500);
      await memory.cleanup(300);
      const remaining = await memory.getByType('summary');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].content.n).toBe(2);
    });
  });

  describe('_parse', () => {
    test('parses value json and maps columns', () => {
      const parsed = memory._parse({
        id: 5,
        resource_rid: 'r9',
        type: 't',
        value: '{"k":"v"}',
        created_at: 42
      });
      expect(parsed).toEqual({ id: 5, rid: 'r9', type: 't', content: { k: 'v' }, created: 42 });
    });

    test('tolerates invalid json', () => {
      const parsed = memory._parse({ id: 1, resource_rid: 'r', type: 't', value: 'not-json', created_at: 1 });
      expect(parsed.content).toEqual({});
    });
  });
});
