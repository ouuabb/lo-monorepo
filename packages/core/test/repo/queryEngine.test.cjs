const path = require('path');
const Database = require('../../src/repo/database.cjs');
const QueryEngine = require('../../src/repo/queryEngine.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

async function insertResource(db, { rid, name, type, path: p, metadata = {}, created = 1, updated = 1, deleted = 0 }) {
  await db.run(
    'INSERT INTO resources (rid, name, layer, type, path, hash, metadata, encrypted, created, updated, deleted) VALUES (?, ?, 0, ?, ?, ?, ?, 0, ?, ?, ?)',
    [rid, name, type, p, `hash-${  rid}`, JSON.stringify(metadata), created, updated, deleted]
  );
}

async function insertRelation(db, from, to, type = 'reference') {
  await db.run(
    'INSERT INTO relations (from_rid, to_rid, type, created, metadata, deleted) VALUES (?, ?, ?, ?, ?, 0)',
    [from, to, type, Date.now(), '{}']
  );
}

describe('QueryEngine', () => {
  let tempDir, db, qe;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    await db.run("DELETE FROM resources WHERE rid = '__system__'");
    qe = new QueryEngine(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  describe('queryResources', () => {
    test('should return hydrated resources with default ordering by created DESC', async () => {
      await insertResource(db, { rid: 'res_1', name: 'one', type: 'note', path: '/1.md', created: 10 });
      await insertResource(db, { rid: 'res_2', name: 'two', type: 'note', path: '/2.md', created: 20 });
      const rows = await qe.queryResources();
      expect(rows.map(r => r.rid)).toEqual(['res_2', 'res_1']);
      expect(rows[0].metadata).toEqual({});
    });

    test('should filter by type', async () => {
      await insertResource(db, { rid: 'res_1', name: 'one', type: 'note', path: '/1.md' });
      await insertResource(db, { rid: 'res_2', name: 'two', type: 'image', path: '/2.png' });
      const rows = await qe.queryResources({ type: 'note' });
      expect(rows.map(r => r.rid)).toEqual(['res_1']);
    });

    test('should exclude deleted resources', async () => {
      await insertResource(db, { rid: 'res_1', name: 'one', type: 'note', path: '/1.md' });
      await insertResource(db, { rid: 'res_2', name: 'two', type: 'note', path: '/2.md', deleted: 1 });
      const rows = await qe.queryResources();
      expect(rows.map(r => r.rid)).toEqual(['res_1']);
    });

    test('should support sortBy, sortOrder, limit and offset', async () => {
      await insertResource(db, { rid: 'res_1', name: 'one', type: 'note', path: '/1.md', created: 10 });
      await insertResource(db, { rid: 'res_2', name: 'two', type: 'note', path: '/2.md', created: 20 });
      await insertResource(db, { rid: 'res_3', name: 'three', type: 'note', path: '/3.md', created: 30 });
      const asc = await qe.queryResources({ sortBy: 'created', sortOrder: 'ASC' });
      expect(asc[0].rid).toBe('res_1');
      const limited = await qe.queryResources({ type: 'note', limit: 2, offset: 1, sortBy: 'created', sortOrder: 'DESC' });
      expect(limited.map(r => r.rid)).toEqual(['res_2', 'res_1']);
    });
  });

  describe('queryUnreferenced', () => {
    test('should return resources without incoming relations', async () => {
      await insertResource(db, { rid: 'res_a', name: 'a', type: 'note', path: '/a.md' });
      await insertResource(db, { rid: 'res_b', name: 'b', type: 'note', path: '/b.md' });
      await insertResource(db, { rid: 'res_c', name: 'c', type: 'note', path: '/c.md' });
      await insertRelation(db, 'res_a', 'res_b');
      const rows = await qe.queryUnreferenced();
      const rids = rows.map(r => r.rid);
      expect(rids).toContain('res_c');
      expect(rids).not.toContain('res_b');
    });
  });

  describe('queryRecent', () => {
    test('should return recent resources limited by count', async () => {
      for (let i = 1; i <= 5; i++) {
        await insertResource(db, { rid: `res_${i}`, name: `n${i}`, type: 'note', path: `/${i}.md`, created: i });
      }
      const rows = await qe.queryRecent(3);
      expect(rows).toHaveLength(3);
      expect(rows.map(r => r.rid)).toEqual(['res_5', 'res_4', 'res_3']);
    });
  });

  describe('queryByType and queryByPathPattern', () => {
    test('queryByType should filter by type', async () => {
      await insertResource(db, { rid: 'res_a', name: 'a', type: 'code', path: '/a.js' });
      const rows = await qe.queryByType('code');
      expect(rows.map(r => r.rid)).toEqual(['res_a']);
    });

    test('queryByPathPattern should match path substring', async () => {
      await insertResource(db, { rid: 'res_a', name: 'a', type: 'note', path: '/docs/note.md' });
      await insertResource(db, { rid: 'res_b', name: 'b', type: 'note', path: '/src/other.md' });
      const rows = await qe.queryByPathPattern('docs');
      expect(rows.map(r => r.rid)).toEqual(['res_a']);
    });
  });

  describe('queryByName and queryByNamePattern', () => {
    test('queryByName should return hydrated resource or null', async () => {
      await insertResource(db, { rid: 'res_a', name: 'alpha', type: 'note', path: '/a.md' });
      const found = await qe.queryByName('alpha');
      expect(found.rid).toBe('res_a');
      expect(await qe.queryByName('missing')).toBeNull();
    });

    test('queryByNamePattern should match name substring', async () => {
      await insertResource(db, { rid: 'res_a', name: 'alpha.md', type: 'note', path: '/a.md' });
      await insertResource(db, { rid: 'res_b', name: 'beta.md', type: 'note', path: '/b.md' });
      const rows = await qe.queryByNamePattern('pha');
      expect(rows.map(r => r.rid)).toEqual(['res_a']);
    });
  });

  describe('search', () => {
    test('should match across name, metadata and path', async () => {
      await insertResource(db, { rid: 'res_a', name: 'needle-name', type: 'note', path: '/a.md' });
      await insertResource(db, { rid: 'res_b', name: 'b', type: 'note', path: '/needle-path.md', metadata: { title: 'x' } });
      await insertResource(db, { rid: 'res_c', name: 'c', type: 'note', path: '/c.md', metadata: { title: 'needle-meta' } });
      const rows = await qe.search('needle');
      expect(rows.map(r => r.rid).sort()).toEqual(['res_a', 'res_b', 'res_c']);
    });

    test('should escape single quotes in query', async () => {
      await insertResource(db, { rid: 'res_a', name: "it's-a-note", type: 'note', path: '/a.md' });
      const rows = await qe.search("it's");
      expect(rows.map(r => r.rid)).toEqual(['res_a']);
    });
  });

  describe('getGraph', () => {
    test('should return outgoing and incoming relations', async () => {
      await insertResource(db, { rid: 'res_a', name: 'a', type: 'note', path: '/a.md' });
      await insertResource(db, { rid: 'res_b', name: 'b', type: 'note', path: '/b.md' });
      await insertResource(db, { rid: 'res_c', name: 'c', type: 'note', path: '/c.md' });
      await insertRelation(db, 'res_a', 'res_b', 'reference');
      await insertRelation(db, 'res_c', 'res_a', 'wikilink');

      const graph = await qe.getGraph('res_a');
      expect(graph.outgoing.map(r => ({ rid: r.rid, type: r.relation_type }))).toEqual([{ rid: 'res_b', type: 'reference' }]);
      expect(graph.incoming.map(r => ({ rid: r.rid, type: r.relation_type }))).toEqual([{ rid: 'res_c', type: 'wikilink' }]);
    });

    test('should return empty arrays for unknown rid', async () => {
      const graph = await qe.getGraph('res_missing');
      expect(graph.outgoing).toEqual([]);
      expect(graph.incoming).toEqual([]);
    });
  });

  describe('getStats', () => {
    test('should compute total, byType, relations and latest activity', async () => {
      await insertResource(db, { rid: 'res_a', name: 'a', type: 'note', path: '/a.md', created: 10 });
      await insertResource(db, { rid: 'res_b', name: 'b', type: 'note', path: '/b.md', created: 20 });
      await insertResource(db, { rid: 'res_c', name: 'c', type: 'image', path: '/c.png', created: 30 });
      await insertRelation(db, 'res_a', 'res_b');
      const stats = await qe.getStats();
      expect(stats.totalResources).toBe(3);
      expect(stats.resourcesByType.find(t => t.type === 'image').count).toBe(1);
      expect(stats.totalRelations).toBe(1);
      expect(stats.latestActivity).toBe(30);
    });
  });
});
