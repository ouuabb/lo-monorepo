const path = require('path');
const Database = require('../../src/repo/database.cjs');
const KnowledgeRepair = require('../../src/repo/knowledgeRepair.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('KnowledgeRepair', () => {
  let tempDir, db, repair;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    repair = new KnowledgeRepair(db, null);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function addResource(rid, name) {
    const now = Date.now();
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, path, hash, metadata, encrypted, created, updated, deleted)
       VALUES (?, ?, 0, 'note', ?, '', '{}', 0, ?, ?, 0)`,
      [rid, name, `/${rid}`, now, now]
    );
  }

  async function addRelation(from, to) {
    const now = Date.now();
    await db.run(
      `INSERT INTO relations (from_rid, to_rid, type, created, updated, deleted)
       VALUES (?, ?, 'reference', ?, ?, 0)`,
      [from, to, now, now]
    );
  }

  describe('findBrokenRelations', () => {
    test('detects relations pointing to missing resources', async () => {
      await addResource('a', 'A');
      await addResource('b', 'B');
      await addRelation('a', 'b');
      await addRelation('a', 'ghost');
      await addRelation('phantom', 'b');

      const broken = await repair.findBrokenRelations();
      expect(broken).toHaveLength(2);
      const byFrom = broken.find(r => r.from_rid === 'a');
      expect(byFrom).toMatchObject({ to_rid: 'ghost', issue: 'broken_relation' });
      expect(byFrom.suggestion.type).toBe('repair.remove_relation');
      expect(broken.find(r => r.from_rid === 'phantom').to_rid).toBe('b');
    });

    test('returns empty when all relations are valid', async () => {
      await addResource('a', 'A');
      await addResource('b', 'B');
      await addRelation('a', 'b');
      expect(await repair.findBrokenRelations()).toEqual([]);
    });
  });

  describe('findOrphanResources', () => {
    test('detects resources with no relations', async () => {
      await addResource('a', 'A');
      await addResource('b', 'B');
      await addResource('c', 'C');
      await addRelation('a', 'b');

      const orphans = await repair.findOrphanResources();
      expect(orphans.some(o => o.rid === 'c')).toBe(true);
      expect(orphans.some(o => o.rid === 'a')).toBe(false);
      expect(orphans.find(o => o.rid === 'c')).toMatchObject({
        issue: 'orphan_resource',
        name: 'C'
      });
    });
  });

  describe('findDuplicateCandidates', () => {
    test('detects resources with similar names', async () => {
      await addResource('d1', 'My Note');
      await addResource('d2', 'my note');
      await addResource('d3', 'Totally Different');

      const candidates = await repair.findDuplicateCandidates();
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const pair = candidates.find(c => c.similarity === 1);
      expect(pair).toBeDefined();
      expect([pair.resourceA.name, pair.resourceB.name].sort()).toEqual(['My Note', 'my note']);
      expect(pair.suggestion.type).toBe('repair.merge_suggestion');
    });

    test('returns empty when names differ', async () => {
      await addResource('e1', 'Alpha');
      await addResource('e2', 'Beta');
      expect(await repair.findDuplicateCandidates()).toEqual([]);
    });
  });

  describe('_nameSimilarity', () => {
    test('identical names score 1', () => {
      expect(repair._nameSimilarity('Hello', 'hello')).toBe(1);
    });

    test('unrelated names score 0', () => {
      expect(repair._nameSimilarity('abc', 'xyz')).toBe(0);
    });

    test('empty input scores 0', () => {
      expect(repair._nameSimilarity('', 'abc')).toBe(0);
      expect(repair._nameSimilarity(null, null)).toBe(0);
    });

    test('partial overlap scores between 0 and 1', () => {
      const score = repair._nameSimilarity('note', 'notes');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });

  describe('diagnose', () => {
    test('returns summary counts across all detectors', async () => {
      await addResource('a', 'A');
      await addResource('b', 'B');
      await addResource('dup', 'Same Title');
      await addResource('dup2', 'same title');
      await addRelation('a', 'missing-target');

      const result = await repair.diagnose();
      expect(result.brokenRelations).toHaveLength(1);
      expect(result.orphanResources.length).toBeGreaterThanOrEqual(2);
      expect(result.duplicateCandidates.length).toBeGreaterThanOrEqual(1);
      expect(result.summary.brokenCount).toBe(1);
      expect(result.summary.orphanCount).toBe(result.orphanResources.length);
      expect(result.summary.duplicateCount).toBe(result.duplicateCandidates.length);
      expect(result.summary.totalIssues).toBe(
        result.summary.brokenCount + result.summary.orphanCount + result.summary.duplicateCount
      );
    });
  });
});
