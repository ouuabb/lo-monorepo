const path = require('path');
const Database = require('../../src/repo/database.cjs');
const Graph = require('../../src/domain/graph.cjs');
const GraphEngine = require('../../src/repo/graphEngine.cjs');
const KnowledgePatternEngine = require('../../src/repo/knowledgePatternEngine.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('KnowledgePatternEngine', () => {
  let tempDir, db, engine;

  function buildGraph() {
    const g = new Graph();
    for (const n of ['B', 'C', 'D', 'E', 'F']) g.addEdge('A', n, 'reference');
    g.addEdge('A', 'H', 'reference');
    for (const [a, b] of [['X1', 'X2'], ['X2', 'X3'], ['X3', 'X4']]) g.addEdge(a, b, 'reference');
    g.addEdge('BR', 'Y', 'reference');
    g.addEdge('BR', 'Z', 'reference');
    return new GraphEngine(g);
  }

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    engine = buildGraph();
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function addResource(rid, type) {
    const now = Date.now();
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
       VALUES (?, ?, 0, ?, ?, ?, '', '{}', 0, ?, ?, 0)`,
      [rid, rid, type, 'local', `/${rid}`, now, now]
    );
  }

  describe('detectHubs', () => {
    test('finds nodes with degree above threshold', async () => {
      const pattern = new KnowledgePatternEngine(engine, db);
      const hubs = await pattern.detectHubs(3, 20);
      expect(hubs).toHaveLength(1);
      expect(hubs[0]).toMatchObject({ rid: 'A', type: 'hub' });
      expect(hubs[0].degree).toBe(6);
      expect(hubs[0].outgoing).toBe(6);
    });

    test('respects minDegree threshold', async () => {
      const pattern = new KnowledgePatternEngine(engine, db);
      const hubs = await pattern.detectHubs(10, 20);
      expect(hubs).toEqual([]);
    });

    test('respects maxResults', async () => {
      const g = new Graph();
      g.addEdge('h1', 'a', 'reference');
      g.addEdge('h1', 'b', 'reference');
      g.addEdge('h1', 'c', 'reference');
      g.addEdge('h2', 'd', 'reference');
      g.addEdge('h2', 'e', 'reference');
      g.addEdge('h2', 'f', 'reference');
      const pattern = new KnowledgePatternEngine(new GraphEngine(g), db);
      const hubs = await pattern.detectHubs(3, 1);
      expect(hubs).toHaveLength(1);
    });
  });

  describe('detectChains', () => {
    test('finds linear paths of minimum length', async () => {
      const pattern = new KnowledgePatternEngine(engine, db);
      const chains = await pattern.detectChains(3, 20);
      expect(chains.length).toBeGreaterThanOrEqual(1);
      const chain = chains.find(c => c.nodes.includes('X1'));
      expect(chain.nodes).toEqual(['X1', 'X2', 'X3', 'X4']);
      expect(chain.length).toBe(4);
    });

    test('does not report chains shorter than minLength', async () => {
      const g = new Graph();
      g.addEdge('P', 'Q', 'reference');
      const pattern = new KnowledgePatternEngine(new GraphEngine(g), db);
      expect(await pattern.detectChains(3, 20)).toEqual([]);
    });
  });

  describe('detectBridges', () => {
    test('finds nodes connecting two or more resource types', async () => {
      await addResource('BR', 'note');
      await addResource('Y', 'note');
      await addResource('Z', 'doc');
      const pattern = new KnowledgePatternEngine(engine, db);
      const bridges = await pattern.detectBridges(20);
      expect(bridges.some(b => b.rid === 'BR')).toBe(true);
      const br = bridges.find(b => b.rid === 'BR');
      expect(br.bridges.sort()).toEqual(['doc', 'note']);
      expect(br.type).toBe('bridge');
    });

    test('returns empty when no node spans multiple types', async () => {
      await addResource('Y', 'note');
      await addResource('Z', 'note');
      const pattern = new KnowledgePatternEngine(engine, db);
      expect(await pattern.detectBridges(20)).toEqual([]);
    });
  });

  describe('detectDeadEnds', () => {
    test('finds nodes with incoming but no outgoing edges', async () => {
      const pattern = new KnowledgePatternEngine(engine, db);
      const deadEnds = await pattern.detectDeadEnds(20);
      expect(deadEnds.some(d => d.rid === 'H')).toBe(true);
      const h = deadEnds.find(d => d.rid === 'H');
      expect(h).toMatchObject({ incoming: 1, type: 'dead_end' });
      expect(h.description).toContain('no outgoing links');
    });

    test('respects maxResults', async () => {
      const pattern = new KnowledgePatternEngine(engine, db);
      const deadEnds = await pattern.detectDeadEnds(2);
      expect(deadEnds.length).toBeLessThanOrEqual(2);
    });
  });

  describe('detectAll', () => {
    test('combines all pattern detections', async () => {
      await addResource('BR', 'note');
      await addResource('Y', 'note');
      await addResource('Z', 'doc');
      const pattern = new KnowledgePatternEngine(engine, db);
      const result = await pattern.detectAll();
      expect(result.hubs.some(h => h.rid === 'A')).toBe(true);
      expect(result.chains.some(c => c.nodes.includes('X1'))).toBe(true);
      expect(result.bridges.some(b => b.rid === 'BR')).toBe(true);
      expect(result.deadEnds.some(d => d.rid === 'H')).toBe(true);
    });
  });
});
