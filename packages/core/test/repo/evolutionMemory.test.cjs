const path = require('path');
const Database = require('../../src/repo/database.cjs');
const EvolutionMemory = require('../../src/repo/evolutionMemory.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('EvolutionMemory', () => {
  let tempDir, db, memory;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    memory = new EvolutionMemory(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function seedSnapshot(id, createdAt, resourceCount, relationCount, density) {
    await db.run(
      `INSERT INTO knowledge_snapshots (id, created_at, resource_count, relation_count, density, entropy, growth)
       VALUES (?, ?, ?, ?, ?, 0, 0)`,
      [id, createdAt, resourceCount, relationCount, density]
    );
  }

  describe('createSnapshot', () => {
    test('persists a snapshot and returns it with id', async () => {
      const snap = await memory.createSnapshot({ resourceCount: 5, relationCount: 3, density: 1.5 });
      expect(snap.id).toMatch(/^snap_/);
      expect(snap.created_at).toBeGreaterThan(0);
      expect(snap.resourceCount).toBe(5);

      const row = await db.get('SELECT * FROM knowledge_snapshots WHERE id = ?', [snap.id]);
      expect(row).toBeDefined();
      expect(row.resource_count).toBe(5);
      expect(row.relation_count).toBe(3);
      expect(row.density).toBe(1.5);
    });

    test('defaults missing metrics to zero', async () => {
      const snap = await memory.createSnapshot({});
      const row = await db.get('SELECT * FROM knowledge_snapshots WHERE id = ?', [snap.id]);
      expect(row.resource_count).toBe(0);
      expect(row.density).toBe(0);
      expect(row.growth).toBe(0);
    });
  });

  describe('list', () => {
    test('returns snapshots ordered newest first', async () => {
      await seedSnapshot('s1', 100, 1, 1, 0.1);
      await seedSnapshot('s2', 200, 2, 2, 0.2);
      await seedSnapshot('s3', 300, 3, 3, 0.3);
      const rows = await memory.list();
      expect(rows.map(r => r.id)).toEqual(['s3', 's2', 's1']);
      expect(rows[0]).toMatchObject({ resourceCount: 3, relationCount: 3, density: 0.3 });
    });

    test('respects limit option', async () => {
      await seedSnapshot('s1', 100, 1, 1, 0.1);
      await seedSnapshot('s2', 200, 2, 2, 0.2);
      const rows = await memory.list({ limit: 1 });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('s2');
    });

    test('returns empty when no snapshots', async () => {
      expect(await memory.list()).toEqual([]);
    });
  });

  describe('latest', () => {
    test('returns the newest snapshot', async () => {
      await seedSnapshot('s1', 100, 1, 1, 0.1);
      await seedSnapshot('s2', 200, 2, 2, 0.2);
      const latest = await memory.latest();
      expect(latest.id).toBe('s2');
      expect(latest.createdAt).toBe(200);
    });

    test('returns null when no snapshots', async () => {
      expect(await memory.latest()).toBeNull();
    });
  });

  describe('compare', () => {
    test('computes deltas between an older snapshot and the latest', async () => {
      await seedSnapshot('old', 1000, 5, 3, 0.5);
      await seedSnapshot('new', 9000000, 8, 6, 1.0);
      const result = await memory.compare('old');
      expect(result.from.id).toBe('old');
      expect(result.to.id).toBe('new');
      expect(result.delta.resources).toBe(3);
      expect(result.delta.relations).toBe(3);
      expect(result.delta.density).toBe(0.5);
      expect(result.delta.elapsedDays).toBe(Math.floor(8000000 / 86400000));
    });

    test('returns null for missing snapshot', async () => {
      expect(await memory.compare('ghost')).toBeNull();
    });

    test('returns null when no snapshots exist', async () => {
      expect(await memory.compare('old')).toBeNull();
    });
  });

  describe('cleanup', () => {
    test('removes all but the most recent snapshots', async () => {
      for (let i = 1; i <= 5; i++) await seedSnapshot(`s${i}`, i * 100, i, i, 0.1);
      const result = await memory.cleanup(2);
      expect(result.deleted).toBe(3);
      const remaining = await memory.list();
      expect(remaining).toHaveLength(2);
      expect(remaining.map(r => r.id)).toEqual(['s5', 's4']);
    });

    test('deletes nothing when count is small enough', async () => {
      await seedSnapshot('s1', 100, 1, 1, 0.1);
      const result = await memory.cleanup(50);
      expect(result.deleted).toBe(0);
      expect(await memory.list()).toHaveLength(1);
    });
  });
});
