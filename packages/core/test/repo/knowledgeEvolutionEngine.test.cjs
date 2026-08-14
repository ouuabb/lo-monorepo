const path = require('path');
const Database = require('../../src/repo/database.cjs');
const KnowledgeEvolutionEngine = require('../../src/repo/knowledgeEvolutionEngine.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

const DAY = 86400000;

describe('KnowledgeEvolutionEngine', () => {
  let tempDir, db, evolution;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    evolution = new KnowledgeEvolutionEngine(db, null);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function expireSystem() {
    const old = Date.now() - 1000 * DAY;
    await db.run("UPDATE resources SET created = ?, updated = ? WHERE rid = '__system__'", [old, old]);
  }

  async function removeSystem() {
    await db.run("DELETE FROM resources WHERE rid = '__system__'");
  }

  async function addResource(rid, type, created) {
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, path, hash, metadata, encrypted, created, updated, deleted)
       VALUES (?, ?, 0, ?, ?, '', '{}', 0, ?, ?, 0)`,
      [rid, rid, type, `/${rid}`, created, created]
    );
  }

  async function addRelation(from, to, created) {
    await db.run(
      `INSERT INTO relations (from_rid, to_rid, type, created, updated, deleted)
       VALUES (?, ?, 'reference', ?, ?, 0)`,
      [from, to, created, created]
    );
  }

  describe('growthRate', () => {
    test('counts resources and relations created within the period', async () => {
      await expireSystem();
      const recent = Date.now() - 1000;
      for (let i = 1; i <= 3; i++) await addResource(`r${i}`, 'note', recent);
      await addRelation('r1', 'r2', recent);
      await addRelation('r2', 'r3', recent);

      const result = await evolution.growthRate(30);
      expect(result.newResources).toBe(3);
      expect(result.newRelations).toBe(2);
      expect(result.total).toBe(5);
      expect(result.rate).toBe(0.17);
      expect(result.period).toBe(30);
    });

    test('excludes resources older than the period', async () => {
      await expireSystem();
      await addResource('old', 'note', Date.now() - 100 * DAY);
      const result = await evolution.growthRate(30);
      expect(result.newResources).toBe(0);
    });

    test('returns zero rate for zero-day period', async () => {
      await expireSystem();
      await addResource('r1', 'note', Date.now() - 1000);
      const result = await evolution.growthRate(0);
      expect(result.rate).toBe(0);
    });
  });

  describe('velocity', () => {
    test('classifies as connector when relations outpace resources', async () => {
      await expireSystem();
      const recent = Date.now() - 1000;
      await addResource('r1', 'note', recent);
      await addResource('r2', 'note', recent);
      const pairs = [['r1', 'r2'], ['r2', 'r1'], ['r1', 'r3'], ['r3', 'r1'], ['r1', 'r4'], ['r4', 'r1']];
      for (const [a, b] of pairs) await addRelation(a, b, recent);
      const result = await evolution.velocity(30);
      expect(result.value).toBe(3);
      expect(result.type).toBe('connector');
    });

    test('classifies as balanced when close to one-to-one', async () => {
      await expireSystem();
      const recent = Date.now() - 1000;
      await addResource('r1', 'note', recent);
      await addResource('r2', 'note', recent);
      const pairs = [['r1', 'r2'], ['r2', 'r1'], ['r1', 'r3']];
      for (const [a, b] of pairs) await addRelation(a, b, recent);
      const result = await evolution.velocity(30);
      expect(result.value).toBe(1.5);
      expect(result.type).toBe('balanced');
    });

    test('classifies as collector when resources outpace relations', async () => {
      await expireSystem();
      const recent = Date.now() - 1000;
      await addResource('r1', 'note', recent);
      await addResource('r2', 'note', recent);
      await addRelation('r1', 'r2', recent);
      const result = await evolution.velocity(30);
      expect(result.value).toBe(0.5);
      expect(result.type).toBe('collector');
    });

    test('returns zero when no resources', async () => {
      await expireSystem();
      const result = await evolution.velocity(30);
      expect(result.value).toBe(0);
      expect(result.type).toBe('collector');
    });
  });

  describe('entropy', () => {
    test('returns empty result when no resource types', async () => {
      await removeSystem();
      expect(await evolution.entropy()).toEqual({ value: 0, types: {} });
    });

    test('concentrated when a single type dominates', async () => {
      await removeSystem();
      const recent = Date.now() - 1000;
      await addResource('n1', 'note', recent);
      await addResource('n2', 'note', recent);
      await addResource('n3', 'note', recent);
      const result = await evolution.entropy();
      expect(result.interpretation).toBe('concentrated');
      expect(result.distribution).toEqual({ note: 1 });
      expect(result.typeCount).toBe(1);
    });

    test('balanced when types are evenly distributed', async () => {
      await removeSystem();
      const recent = Date.now() - 1000;
      await addResource('n1', 'note', recent);
      await addResource('n2', 'note', recent);
      await addResource('d1', 'doc', recent);
      await addResource('d2', 'doc', recent);
      const result = await evolution.entropy();
      expect(result.interpretation).toBe('balanced');
      expect(result.normalized).toBe(1);
    });

    test('moderate for uneven two-type split', async () => {
      await removeSystem();
      const recent = Date.now() - 1000;
      for (let i = 1; i <= 8; i++) await addResource(`n${i}`, 'note', recent);
      for (let i = 1; i <= 2; i++) await addResource(`d${i}`, 'doc', recent);
      const result = await evolution.entropy();
      expect(result.interpretation).toBe('moderate');
    });
  });

  describe('trend', () => {
    test('accelerating when recent growth exceeds previous window', async () => {
      await expireSystem();
      const recent = Date.now() - 1000;
      for (let i = 1; i <= 5; i++) await addResource(`r${i}`, 'note', recent);
      for (let i = 1; i <= 2; i++) await addResource(`o${i}`, 'note', Date.now() - 40 * DAY);
      const result = await evolution.trend(30);
      expect(result.direction).toBe('accelerating');
      expect(result.recent.resources).toBe(5);
      expect(result.previous.resources).toBe(2);
    });

    test('decelerating when recent growth lags previous window', async () => {
      await expireSystem();
      const recent = Date.now() - 1000;
      await addResource('r1', 'note', recent);
      for (let i = 1; i <= 5; i++) await addResource(`o${i}`, 'note', Date.now() - 40 * DAY);
      const result = await evolution.trend(30);
      expect(result.direction).toBe('decelerating');
    });

    test('stable when growth is comparable', async () => {
      await expireSystem();
      const recent = Date.now() - 1000;
      for (let i = 1; i <= 3; i++) await addResource(`r${i}`, 'note', recent);
      for (let i = 1; i <= 3; i++) await addResource(`o${i}`, 'note', Date.now() - 40 * DAY);
      const result = await evolution.trend(30);
      expect(result.direction).toBe('stable');
    });
  });

  describe('domainGrowth', () => {
    test('ranks domains by recent resource share', async () => {
      await expireSystem();
      const recent = Date.now() - 1000;
      await addResource('n1', 'note', recent);
      await addResource('n2', 'note', recent);
      await addResource('n3', 'note', recent);
      await addResource('d1', 'doc', recent);
      await addResource('old', 'old', Date.now() - 100 * DAY);

      const result = await evolution.domainGrowth(30);
      expect(result).toHaveLength(2);
      const note = result.find(r => r.type === 'note');
      const doc = result.find(r => r.type === 'doc');
      expect(note).toEqual({ type: 'note', count: 3, share: 0.75 });
      expect(doc).toEqual({ type: 'doc', count: 1, share: 0.25 });
    });
  });

  describe('analyze', () => {
    test('combines all evolution metrics', async () => {
      await expireSystem();
      const recent = Date.now() - 1000;
      await addResource('r1', 'note', recent);
      await addResource('r2', 'note', recent);
      await addResource('r3', 'note', recent);
      await addRelation('r1', 'r2', recent);

      const result = await evolution.analyze({ period: 30 });
      expect(result.growth).toHaveProperty('total');
      expect(result.velocity).toHaveProperty('type');
      expect(result.entropy).toHaveProperty('distribution');
      expect(result.trend).toHaveProperty('direction');
    });
  });
});
