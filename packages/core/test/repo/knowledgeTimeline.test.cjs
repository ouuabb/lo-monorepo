const path = require('path');
const Database = require('../../src/repo/database.cjs');
const KnowledgeTimeline = require('../../src/repo/knowledgeTimeline.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

const SEC = (year, month, day) => Math.floor(new Date(year, month, day).getTime() / 1000);

describe('KnowledgeTimeline', () => {
  let tempDir, db, timeline;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    timeline = new KnowledgeTimeline(db);
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, path, hash, metadata, encrypted, created, updated, deleted)
       VALUES ('container-1', 'c1', 0, 'container', '/container-1', '', '{}', 0, ?, ?, 0)`,
      [Date.now(), Date.now()]
    );
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function addOp(operationId, type, createdSeconds) {
    await db.run(
      `INSERT INTO container_operations (operation_id, container_rid, type, created) VALUES (?, ?, ?, ?)`,
      [operationId, 'container-1', type, createdSeconds]
    );
  }

  describe('monthly', () => {
    test('groups operations by month and classifies types', async () => {
      await addOp('op1', 'member.add', SEC(2026, 0, 10));
      await addOp('op2', 'relation.create', SEC(2026, 0, 20));
      await addOp('op3', 'relation.update', SEC(2026, 1, 5));
      await addOp('op4', 'member.move', SEC(2026, 1, 12));
      await addOp('op5', 'member.add', SEC(2026, 1, 18));

      const result = await timeline.monthly();
      expect(result).toEqual([
        { month: '2026-01', total: 2, created: 1, linked: 1, changed: 0 },
        { month: '2026-02', total: 3, created: 1, linked: 0, changed: 2 }
      ]);
    });

    test('returns empty array when no operations', async () => {
      expect(await timeline.monthly()).toEqual([]);
    });

    test('sorts months in chronological order', async () => {
      await addOp('a', 'member.add', SEC(2026, 1, 1));
      await addOp('b', 'member.add', SEC(2026, 0, 1));
      const result = await timeline.monthly();
      expect(result.map(m => m.month)).toEqual(['2026-01', '2026-02']);
    });
  });

  describe('growthRate', () => {
    test('returns zeros for empty database', async () => {
      expect(await timeline.growthRate()).toEqual({ total: 0, months: 0, rate: 0, monthly: [] });
    });

    test('computes total and average relation rate', async () => {
      await addOp('a', 'relation.create', SEC(2026, 0, 1));
      await addOp('b', 'member.add', SEC(2026, 0, 2));
      await addOp('c', 'member.add', SEC(2026, 1, 1));
      await addOp('d', 'relation.create', SEC(2026, 1, 2));
      const result = await timeline.growthRate();
      expect(result.total).toBe(4);
      expect(result.linked).toBe(2);
      expect(result.months).toBe(2);
      expect(result.rate).toBe(1);
      expect(result.monthly).toHaveLength(2);
    });
  });

  describe('activity', () => {
    test('trend is stable when fewer than two months', async () => {
      await addOp('a', 'member.add', SEC(2026, 0, 1));
      const result = await timeline.activity();
      expect(result.trend).toBe('stable');
      expect(result.hotMonths).toHaveLength(1);
    });

    test('detects growing trend and hot months', async () => {
      await addOp('a', 'relation.create', SEC(2026, 0, 1));
      await addOp('b', 'relation.create', SEC(2026, 0, 2));
      await addOp('c', 'member.add', SEC(2026, 0, 3));
      await addOp('d', 'relation.create', SEC(2026, 1, 1));
      await addOp('e', 'relation.create', SEC(2026, 1, 2));
      await addOp('f', 'relation.create', SEC(2026, 1, 3));
      await addOp('g', 'relation.create', SEC(2026, 1, 4));
      await addOp('h', 'relation.create', SEC(2026, 1, 5));
      const result = await timeline.activity();
      expect(result.trend).toBe('growing');
      const hot = result.hotMonths.map(m => m.month);
      expect(hot).toContain('2026-02');
    });

    test('detects declining trend', async () => {
      await addOp('a', 'relation.create', SEC(2026, 0, 1));
      await addOp('b', 'relation.create', SEC(2026, 0, 2));
      await addOp('c', 'relation.create', SEC(2026, 0, 3));
      await addOp('d', 'relation.create', SEC(2026, 0, 4));
      await addOp('e', 'relation.create', SEC(2026, 0, 5));
      await addOp('f', 'relation.create', SEC(2026, 1, 1));
      await addOp('g', 'relation.create', SEC(2026, 1, 2));
      const result = await timeline.activity();
      expect(result.trend).toBe('declining');
    });
  });
});
