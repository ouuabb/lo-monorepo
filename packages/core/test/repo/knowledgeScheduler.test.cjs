const path = require('path');
const Database = require('../../src/repo/database.cjs');
const KnowledgeScheduler = require('../../src/repo/knowledgeScheduler.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

const DAY = 86400000;

describe('KnowledgeScheduler', () => {
  let tempDir, db, scheduler;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    scheduler = new KnowledgeScheduler(db, {});
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function addResource(rid, name, created, updated) {
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, path, hash, metadata, encrypted, created, updated, deleted)
       VALUES (?, ?, 0, 'note', ?, '', '{}', 0, ?, ?, 0)`,
      [rid, name, `/${rid}`, created, updated]
    );
  }

  describe('scanForgottenResources', () => {
    test('detects high-value resources not touched for 180 days', async () => {
      const old = Date.now() - 200 * DAY;
      await addResource('r1', 'old-important', old, old);
      await addResource('r2', 'recent', Date.now(), Date.now());

      const withEngine = new KnowledgeScheduler(db, {
        graphEngine: { pageRank: jest.fn(() => [{ rid: 'r1', score: 0.9 }]) }
      });
      const result = await withEngine.scanForgottenResources();
      expect(result.forgotten.map(f => f.rid)).toEqual(['r1']);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]).toMatchObject({
        type: 'resource.revisit',
        source: 'r1',
        confidence: 0.85,
        priority: 'high'
      });
    });

    test('returns no forgotten resources when everything is active', async () => {
      await addResource('r1', 'active', Date.now(), Date.now());
      const result = await scheduler.scanForgottenResources();
      expect(result.forgotten).toEqual([]);
      expect(result.suggestions).toEqual([]);
    });

    test('tolerates pageRank engine failures', async () => {
      const withEngine = new KnowledgeScheduler(db, {
        graphEngine: { pageRank: jest.fn(() => { throw new Error('boom'); }) }
      });
      const result = await withEngine.scanForgottenResources();
      expect(result.forgotten).toEqual([]);
    });
  });

  describe('analyzeKnowledgeHealth', () => {
    test('aggregates density, gaps, islands and event counts', async () => {
      await db.run(`INSERT INTO knowledge_events (type, rid, payload, created) VALUES ('a', null, '{}', 1)`);
      await db.run(`INSERT INTO knowledge_events (type, rid, payload, created) VALUES ('b', null, '{}', 1)`);
      await db.run(`INSERT INTO knowledge_events (type, rid, payload, created) VALUES ('b', null, '{}', 1)`);

      const withServices = new KnowledgeScheduler(db, {
        knowledgeAnalyzer: {
          density: jest.fn(() => ({ density: 1.5, level: 'moderate' })),
          gaps: jest.fn().mockResolvedValue([1, 2, 3])
        },
        knowledgeRepair: {
          findOrphanResources: jest.fn().mockResolvedValue([{ rid: 'o1' }, { rid: 'o2' }])
        }
      });
      const result = await withServices.analyzeKnowledgeHealth();
      expect(result.density).toEqual({ density: 1.5, level: 'moderate' });
      expect(result.gaps).toBe(3);
      expect(result.islands).toEqual({ count: 2 });
      expect(result.eventCounts).toEqual({ a: 1, b: 2 });
      expect(result.forgotten).toBe(0);
    });

    test('works without analyzer or repair services', async () => {
      const result = await scheduler.analyzeKnowledgeHealth();
      expect(result.density).toBeNull();
      expect(result.islands).toBeNull();
      expect(result.forgotten).toBe(0);
    });
  });

  describe('generateKnowledgeReport', () => {
    test('builds report and persists a monthly_report event', async () => {
      await addResource('r1', 'note-one', Date.now(), Date.now());
      const report = await scheduler.generateKnowledgeReport();
      expect(report.period).toBe('monthly');
      expect(report.resources).toBeGreaterThanOrEqual(2);
      expect(report.health).toBeDefined();

      const row = await db.get(
        "SELECT * FROM knowledge_events WHERE type = 'monthly_report' ORDER BY id DESC LIMIT 1"
      );
      expect(row).toBeDefined();
      expect(JSON.parse(row.payload).period).toBe('monthly');
    });
  });

  describe('runAll', () => {
    test('runs pipeline and persists repair suggestions', async () => {
      const createBatch = jest.fn().mockResolvedValue(undefined);
      const withServices = new KnowledgeScheduler(db, {
        knowledgeRepair: {
          diagnose: jest.fn().mockResolvedValue({
            summary: { brokenCount: 1, orphanCount: 1, duplicateCount: 1, totalIssues: 3 },
            brokenRelations: [
              { id: 1, from_rid: 'f', to_rid: 't', suggestion: { reason: 'missing endpoint' } }
            ],
            orphanResources: [
              { rid: 'o', name: 'Orphan', suggestion: { reason: 'no relations' } }
            ],
            duplicateCandidates: [
              {
                resourceA: { rid: 'a', name: 'A' },
                resourceB: { rid: 'b', name: 'B' },
                similarity: 0.9,
                suggestion: { reason: 'similar names' }
              }
            ]
          })
        },
        suggestionEngine: { createBatch }
      });

      const result = await withServices.runAll();
      expect(result.repair).toEqual({ brokenCount: 1, orphanCount: 1, duplicateCount: 1, totalIssues: 3 });
      expect(result.lifecycle).toHaveProperty('total');
      expect(result.suggestions).toHaveLength(3);
      expect(createBatch).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ type: 'repair.remove_relation' }),
        expect.objectContaining({ type: 'repair.connect_suggestion' }),
        expect.objectContaining({ type: 'repair.merge_suggestion' })
      ]));

      const row = await db.get(
        "SELECT * FROM knowledge_events WHERE type = 'automation_run' ORDER BY id DESC LIMIT 1"
      );
      expect(row).toBeDefined();
    });

    test('runs without repair services', async () => {
      await addResource('r1', 'note', Date.now(), Date.now());
      const result = await scheduler.runAll();
      expect(result.repair).toBeNull();
      expect(result.lifecycle).toHaveProperty('total');
      const row = await db.get(
        "SELECT * FROM knowledge_events WHERE type = 'automation_run' ORDER BY id DESC LIMIT 1"
      );
      expect(row).toBeDefined();
    });
  });
});
