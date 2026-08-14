const path = require('path');
const Database = require('../../src/repo/database.cjs');
const SuggestionEngine = require('../../src/repo/suggestionEngine.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('SuggestionEngine', () => {
  let tempDir, db, engine;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    engine = new SuggestionEngine(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  describe('create', () => {
    test('should create suggestion with defaults', async () => {
      const s = await engine.create({});
      expect(s.id).toHaveLength(16);
      expect(typeof s.id).toBe('string');
      expect(s.type).toBe('relation');
      expect(s.source).toBeNull();
      expect(s.target).toBeNull();
      expect(s.payload).toEqual({});
      expect(s.confidence).toBe(0);
      expect(s.priority).toBe('medium');
      expect(s.sourceCategory).toBe('ai');
      expect(s.status).toBe('pending');
    });

    test('should create suggestion with full data', async () => {
      const s = await engine.create({
        type: 'resource.modified',
        source: 'res_1',
        target: 'res_2',
        confidence: 0.9,
        reason: 'because',
        payload: { a: 1 },
        priority: 'high',
        sourceCategory: 'watcher',
        expires: 12345
      });
      expect(s.type).toBe('resource.modified');
      expect(s.source).toBe('res_1');
      expect(s.target).toBe('res_2');
      expect(s.confidence).toBe(0.9);
      expect(s.reason).toBe('because');
      expect(s.payload).toEqual({ a: 1 });
      expect(s.priority).toBe('high');
      expect(s.sourceCategory).toBe('watcher');
      expect(s.expires).toBe(12345);
    });
  });

  describe('createBatch', () => {
    test('should create multiple suggestions', async () => {
      const results = await engine.createBatch([
        { source: 'res_a', reason: 'a' },
        { source: 'res_b', reason: 'b' }
      ]);
      expect(results).toHaveLength(2);
      expect(results[0].source).toBe('res_a');
      expect(results[1].source).toBe('res_b');
    });
  });

  describe('get', () => {
    test('should return null for missing id', async () => {
      expect(await engine.get('missing')).toBeNull();
    });

    test('should return parsed suggestion for existing id', async () => {
      const created = await engine.create({ source: 'res_1', payload: { x: 1 } });
      const got = await engine.get(created.id);
      expect(got.id).toBe(created.id);
      expect(got.payload).toEqual({ x: 1 });
    });
  });

  describe('list', () => {
    test('should list with default limit and priority ordering', async () => {
      await engine.create({ priority: 'low', reason: 'low' });
      await engine.create({ priority: 'high', reason: 'high' });
      await engine.create({ priority: 'medium', reason: 'med' });
      const rows = await engine.list();
      expect(rows.map(r => r.priority)).toEqual(['high', 'medium', 'low']);
    });

    test('should filter by status, priority and source', async () => {
      const high = await engine.create({ priority: 'high', sourceCategory: 'watcher', reason: 'h' });
      await engine.create({ priority: 'medium', sourceCategory: 'ai', reason: 'm' });
      await engine.approve(high.id);
      const byStatus = await engine.list({ status: 'approved' });
      expect(byStatus).toHaveLength(1);
      const byPriority = await engine.list({ priority: 'high' });
      expect(byPriority).toHaveLength(1);
      const bySource = await engine.list({ source: 'ai' });
      expect(bySource).toHaveLength(1);
      const limited = await engine.list({ limit: 1 });
      expect(limited).toHaveLength(1);
    });
  });

  describe('approve / reject / expire', () => {
    test('approve should set status to approved', async () => {
      const s = await engine.create({});
      const approved = await engine.approve(s.id);
      expect(approved.status).toBe('approved');
    });

    test('reject should set status to rejected', async () => {
      const s = await engine.create({});
      const rejected = await engine.reject(s.id);
      expect(rejected.status).toBe('rejected');
    });

    test('expire should set status to expired', async () => {
      const s = await engine.create({});
      const expired = await engine.expire(s.id);
      expect(expired.status).toBe('expired');
    });

    test('transitions should not affect unrelated suggestions', async () => {
      const a = await engine.create({});
      const b = await engine.create({});
      await engine.approve(a.id);
      expect((await engine.get(b.id)).status).toBe('pending');
    });
  });

  describe('cleanupExpired', () => {
    test('should expire pending suggestions past their expires', async () => {
      await engine.create({ expires: Date.now() - 1000 });
      const future = await engine.create({ expires: Date.now() + 100000 });
      await engine.create({ expires: Date.now() - 1000, priority: 'high' });
      const approved = await engine.create({ expires: Date.now() - 1000, priority: 'high' });
      await engine.approve(approved.id);

      const changed = await engine.cleanupExpired();
      expect(changed).toBe(2);
      expect((await engine.get(future.id)).status).toBe('pending');
      expect((await engine.get(approved.id)).status).toBe('approved');
    });

    test('should return 0 when nothing to clean', async () => {
      await engine.create({});
      expect(await engine.cleanupExpired()).toBe(0);
    });
  });

  describe('stats', () => {
    test('should report counts by status and priority', async () => {
      const a = await engine.create({ priority: 'high', sourceCategory: 'watcher' });
      const b = await engine.create({ priority: 'low' });
      await engine.approve(a.id);
      await engine.reject(b.id);
      const stats = await engine.stats();
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(0);
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.byPriority.high).toBe(0);
      expect(stats.byPriority.low).toBe(0);
    });

    test('should report pending by priority', async () => {
      await engine.create({ priority: 'high' });
      await engine.create({ priority: 'medium' });
      await engine.create({ priority: 'low' });
      const stats = await engine.stats();
      expect(stats.byPriority).toEqual({ high: 1, medium: 1, low: 1 });
      expect(stats.pending).toBe(3);
    });
  });
});
