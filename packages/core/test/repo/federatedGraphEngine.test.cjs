const path = require('path');
const Database = require('../../src/repo/database.cjs');
const FederatedGraphEngine = require('../../src/repo/federatedGraphEngine.cjs');
const Graph = require('../../src/domain/graph.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('FederatedGraphEngine', () => {
  let tempDir, db, engine;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    engine = new FederatedGraphEngine();
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function seedRepo(rdb, data) {
    await rdb.run("DELETE FROM resources WHERE rid = '__system__'");
    for (const row of data.resources || []) {
      await rdb.run(
        `INSERT INTO resources (rid, name, layer, type, path, hash, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [row.rid, row.name, 0, row.type || 'note', row.path || '', null, Date.now(), Date.now()]
      );
    }
    for (const row of data.relations || []) {
      await rdb.run(
        `INSERT INTO relations (from_rid, to_rid, type, created, deleted)
         VALUES (?, ?, ?, ?, 0)`,
        [row.from, row.to, row.type || 'reference', Date.now()]
      );
    }
  }

  async function makeRepo() {
    const dir = await testUtils.createTempRepo();
    const rdb = new Database(dir);
    await rdb.open();
    await runMigrations(rdb, path.join(__dirname, '../../src/repo/migrations'));
    return { dir, rdb };
  }

  test('constructor should instantiate without arguments', () => {
    expect(new FederatedGraphEngine()).toBeDefined();
  });

  test('_openReadOnly should resolve a db for existing path', async () => {
    const ext = await engine._openReadOnly(path.join(tempDir, '.repo', 'database.sqlite'));
    expect(ext).toBeDefined();
    await engine._close(ext);
  });

  test('_openReadOnly should reject for missing path', async () => {
    await expect(engine._openReadOnly(path.join(tempDir, 'missing.sqlite'))).rejects.toBeTruthy();
  });

  test('_all should resolve rows for valid sql', async () => {
    const ext = await engine._openReadOnly(path.join(tempDir, '.repo', 'database.sqlite'));
    const rows = await engine._all(ext, 'SELECT * FROM resources');
    expect(Array.isArray(rows)).toBe(true);
    await engine._close(ext);
  });

  test('_all should reject on bad sql', async () => {
    const ext = await engine._openReadOnly(path.join(tempDir, '.repo', 'database.sqlite'));
    await expect(engine._all(ext, 'SELECT * FROM missing_table')).rejects.toBeTruthy();
    await engine._close(ext);
  });

  test('_close should resolve even when close errors', async () => {
    await expect(engine._close({ close: (cb) => cb(new Error('boom')) })).resolves.toBeUndefined();
  });

  test('_loadGraph should map resources and relations to nodes and edges', async () => {
    await db.run("DELETE FROM resources WHERE rid = '__system__'");
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, path, hash, created, updated, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      ['r1', 'Graph Note', 0, 'doc', '', null, 1, 2]
    );
    await db.run(
      `INSERT INTO relations (from_rid, to_rid, type, created, deleted)
       VALUES (?, ?, ?, ?, 0)`,
      ['r1', 'r2', 'ref', 3]
    );
    const ext = await engine._openReadOnly(path.join(tempDir, '.repo', 'database.sqlite'));
    const { nodes, edges } = await engine._loadGraph(ext, 'ns');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ globalId: 'ns:r1', name: 'Graph Note', type: 'doc', source: 'ns' });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ from: 'ns:r1', to: 'ns:r2', type: 'ref', source: 'ns' });
    await engine._close(ext);
  });

  test('buildFederatedGraph should merge local and remote graphs', async () => {
    await db.run("DELETE FROM resources WHERE rid = '__system__'");
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, path, hash, created, updated, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      ['l1', 'Local A', 0, 'note', '', null, Date.now(), Date.now()]
    );
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, path, hash, created, updated, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      ['l2', 'Local B', 0, 'note', '', null, Date.now(), Date.now()]
    );
    await db.run(
      `INSERT INTO relations (from_rid, to_rid, type, created, deleted)
       VALUES (?, ?, ?, ?, 0)`,
      ['l1', 'l2', 'link', Date.now()]
    );

    const remote = await makeRepo();
    try {
      await seedRepo(remote.rdb, {
        resources: [
          { rid: 'r1', name: 'Remote A' },
          { rid: 'r2', name: 'Remote B' }
        ],
        relations: [{ from: 'r1', to: 'r2', type: 'link' }]
      });
      await remote.rdb.close();

      const result = await engine.buildFederatedGraph(
        [{ namespace: 'remote-ns', path: remote.dir }],
        tempDir,
        'local-ns'
      );
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0]).toMatchObject({ namespace: 'local-ns', type: 'local', nodeCount: 2 });
      expect(result.sources[1]).toMatchObject({ namespace: 'remote-ns', type: 'remote', nodeCount: 2 });
      expect(result.graph.nodeCount()).toBe(4);
      expect(result.graph.hasNode('local-ns:l1')).toBe(true);
      expect(result.graph.hasNode('remote-ns:r1')).toBe(true);
      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(2);
      expect(result.graph.edgeCount()).toBe(2);
    } finally {
      await testUtils.cleanupTempDir(remote.dir);
    }
  });

  test('buildFederatedGraph should dedupe nodes and edges across sources in the same namespace', async () => {
    await db.run("DELETE FROM resources WHERE rid = '__system__'");
    const dirA = await makeRepo();
    const dirB = await makeRepo();
    try {
      await seedRepo(dirA.rdb, {
        resources: [{ rid: 'x1', name: 'One' }, { rid: 'x2', name: 'Two' }],
        relations: [{ from: 'x1', to: 'x2', type: 'link' }]
      });
      await seedRepo(dirB.rdb, {
        resources: [{ rid: 'x1', name: 'One' }, { rid: 'x2', name: 'Two' }],
        relations: [{ from: 'x1', to: 'x2', type: 'link' }]
      });
      await dirA.rdb.close();
      await dirB.rdb.close();

      const result = await engine.buildFederatedGraph(
        [
          { namespace: 'same-ns', path: dirA.dir },
          { namespace: 'same-ns', path: dirB.dir }
        ],
        tempDir,
        'local'
      );
      expect(result.graph.hasNode('same-ns:x1')).toBe(true);
      expect(result.graph.nodeCount()).toBe(2);
      expect(result.graph.edgeCount()).toBe(1);
      expect(result.sources).toHaveLength(3);
    } finally {
      await testUtils.cleanupTempDir(dirA.dir);
      await testUtils.cleanupTempDir(dirB.dir);
    }
  });

  test('buildFederatedGraph should record local error when local db is missing', async () => {
    const result = await engine.buildFederatedGraph([], path.join(tempDir, 'nope'), 'local');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ namespace: 'local', type: 'local' });
    expect(result.sources[0].error).toBeDefined();
    expect(result.graph.nodeCount()).toBe(0);
    expect(result.nodes).toHaveLength(0);
  });

  test('buildFederatedGraph should record remote error for a bad remote path', async () => {
    await db.run("DELETE FROM resources WHERE rid = '__system__'");
    const result = await engine.buildFederatedGraph(
      [{ namespace: 'bad-remote', path: path.join(tempDir, 'missing') }],
      tempDir,
      'local'
    );
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toMatchObject({ namespace: 'local', type: 'local', nodeCount: 0 });
    expect(result.sources[1]).toMatchObject({ namespace: 'bad-remote', type: 'remote' });
    expect(result.sources[1].error).toBeDefined();
  });

  function makeGraph() {
    const g = new Graph();
    g.addNode('ns:a', { name: 'a', source: 'ns' });
    g.addNode('ns:b', { name: 'b', source: 'ns' });
    g.addNode('ns:c', { name: 'c', source: 'ns' });
    g.addNode('other:d', { name: 'd', source: 'other' });
    g.addEdge('ns:a', 'ns:b', 'link', { source: 'ns' });
    g.addEdge('ns:b', 'ns:c', 'link', { source: 'ns' });
    g.addEdge('ns:c', 'other:d', 'link', { source: 'other' });
    return g;
  }

  test('queryFederated should return empty when from node is missing', () => {
    expect(engine.queryFederated(makeGraph(), 'missing:x')).toEqual({ nodes: [], edges: [] });
  });

  test('queryFederated should BFS from the start node', () => {
    const result = engine.queryFederated(makeGraph(), 'ns:a', 2);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0]).toMatchObject({ id: 'ns:a', distance: 0, source: 'ns' });
    expect(result.edges).toHaveLength(2);
  });

  test('queryFederated should respect the depth limit', () => {
    const result = engine.queryFederated(makeGraph(), 'ns:a', 1);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[1]).toMatchObject({ id: 'ns:b', distance: 1 });
    expect(result.edges).toHaveLength(1);
  });

  test('queryFederated should filter nodes by sourceFilter', () => {
    const result = engine.queryFederated(makeGraph(), 'ns:a', 3, ['ns']);
    const ids = result.nodes.map((n) => n.id);
    expect(ids).toEqual(['ns:a', 'ns:b', 'ns:c']);
  });

  test('queryFederated should not filter when sourceFilter is empty', () => {
    const result = engine.queryFederated(makeGraph(), 'ns:a', 3, []);
    expect(result.nodes).toHaveLength(4);
  });

  test('queryFederated should cap result nodes at 1000', () => {
    const g = new Graph();
    const limit = 1005;
    for (let i = 0; i < limit; i++) {
      g.addNode(`ns:n${i}`, { name: `n${i}`, source: 'ns' });
    }
    for (let i = 0; i < limit - 1; i++) {
      g.addEdge(`ns:n${i}`, `ns:n${i + 1}`, 'link', { source: 'ns' });
    }
    const result = engine.queryFederated(g, 'ns:n0', limit);
    expect(result.nodes).toHaveLength(1000);
  });
});
