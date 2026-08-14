/**
 * graphQuery 测试（Phase 5.3 新架构）
 *
 * 新架构使用内存图（Graph）+ 图引擎（GraphEngine）+ 查询构建器（GraphQueryBuilder）。
 * 不再直接操作 SQLite，改为构建 Graph 实例后通过 Engine/QueryBuilder 查询。
 */

const Graph = require('../../src/domain/graph.cjs');
const GraphEngine = require('../../src/repo/graphEngine.cjs');
const GraphQueryBuilder = require('../../src/domain/graphQuery.cjs');

// ────────── 构建测试用图 ──────────
function buildTestGraph() {
  const g = new Graph();
  // 节点: a, b, c, d, e（a 是中心节点）
  // 关系:
  //   a → b (reference)
  //   a → c (reference)
  //   b → c (wikilink)
  //   d → a (reference)    ← incoming to a
  //   a → e (wikilink)
  // e 是中心节点（有许多出入关系）
  g.addEdge('res_a', 'res_b', 'reference');
  g.addEdge('res_a', 'res_c', 'reference');
  g.addEdge('res_b', 'res_c', 'wikilink');
  g.addEdge('res_d', 'res_a', 'reference');
  g.addEdge('res_a', 'res_e', 'wikilink');
  // 孤岛节点 f——没有边的孤立节点
  g.addNode('res_f');
  // 环: x → y → z → x
  g.addEdge('res_x', 'res_y', 'reference');
  g.addEdge('res_y', 'res_z', 'reference');
  g.addEdge('res_z', 'res_x', 'reference');
  return g;
}

describe('Graph (memory graph)', () => {
  let graph;

  beforeEach(() => {
    graph = buildTestGraph();
  });

  test('should have correct node count', () => {
    // addEdge 自动 addNode，重复调用不重复创建
    expect(graph.nodeCount()).toBe(9); // a,b,c,d,e,f,x,y,z
  });

  test('should have correct edge count', () => {
    expect(graph.edgeCount()).toBe(8);
  });

  test('outgoing edges from a', () => {
    const out = graph.outgoing('res_a');
    const targets = out.map(e => e.to);
    expect(targets).toContain('res_b');
    expect(targets).toContain('res_c');
    expect(targets).toContain('res_e');
    expect(out.length).toBe(3);
  });

  test('incoming edges to a', () => {
    const incoming = graph.incoming('res_a');
    expect(incoming.length).toBe(1);
    expect(incoming[0].from).toBe('res_d');
  });

  test('neighbors of a (deduplicated union of in+out)', () => {
    const neighbors = graph.neighbors('res_a');
    expect(neighbors.sort()).toEqual(['res_b', 'res_c', 'res_d', 'res_e']);
  });

  test('degree of a', () => {
    expect(graph.degree('res_a')).toBe(4);
  });

  test('toJSON and fromJSON should round-trip', () => {
    const json = graph.toJSON();
    const restored = Graph.fromJSON(json);
    expect(restored.nodeCount()).toBe(graph.nodeCount());
    expect(restored.edgeCount()).toBe(graph.edgeCount());
  });
});

describe('GraphEngine', () => {
  let engine;
  let graph;

  beforeEach(() => {
    graph = buildTestGraph();
    engine = new GraphEngine(graph);
  });

  test('neighbors returns all adjacent node RIDs', () => {
    const n = engine.neighbors('res_a');
    expect(n.sort()).toEqual(['res_b', 'res_c', 'res_d', 'res_e']);
  });

  test('outgoing returns outgoing RIDs', () => {
    const out = engine.outgoing('res_a');
    expect(out.sort()).toEqual(['res_b', 'res_c', 'res_e']);
  });

  test('incoming returns incoming RIDs', () => {
    const incoming = engine.incoming('res_a');
    expect(incoming).toEqual(['res_d']);
  });

  test('findPath returns shortest path', () => {
    const result = engine.findPath('res_d', 'res_c');
    expect(result).not.toBeNull();
    expect(result.path).toEqual(['res_d', 'res_a', 'res_c']);
    expect(result.length).toBe(2);
  });

  test('findPath returns null when no path exists', () => {
    const result = engine.findPath('res_a', 'res_f');
    expect(result).toBeNull();
  });

  test('isReachable returns boolean', () => {
    expect(engine.isReachable('res_d', 'res_c')).toBe(true);
    expect(engine.isReachable('res_a', 'res_f')).toBe(false);
  });

  test('reachable returns all reachable node RIDs', () => {
    const r = engine.reachable('res_a');
    expect(r.sort()).toEqual(['res_b', 'res_c', 'res_e']);
  });

  test('ancestors returns nodes that can reach the given node', () => {
    const ancestors = engine.ancestors('res_c');
    expect(ancestors).toContain('res_a');
    expect(ancestors).toContain('res_b');
    expect(ancestors).toContain('res_d');
  });

  test('detectCycles finds the x→y→z→x cycle', () => {
    const cycles = engine.detectCycles();
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    // detectCycles 返回 string[][]，直接用 flat()
    const allNodes = cycles.flat();
    expect(allNodes).toContain('res_x');
    expect(allNodes).toContain('res_y');
    expect(allNodes).toContain('res_z');
  });

  test('isolatedNodes returns nodes with no edges', () => {
    const isolated = engine.isolatedNodes();
    expect(isolated).toContain('res_f');
  });

  test('centralNodes returns top nodes by degree', () => {
    const top = engine.centralNodes(3);
    // res_a degree=4 应该排在前列
    const rids = top.map(n => n.rid);
    expect(rids).toContain('res_a');
  });

  test('clusters returns connected components', () => {
    const clusters = engine.clusters();
    // res_f 是孤立的，应该在单独的集群中
    expect(clusters.length).toBeGreaterThanOrEqual(2);
  });

  test('subGraph returns neighborhood within depth (outgoing only)', () => {
    const sub = engine.subGraph('res_a', 1);
    // subGraph 返回 Graph 实例，只沿出边遍历
    expect(sub.hasNode('res_a')).toBe(true);
    expect(sub.hasNode('res_b')).toBe(true);
    expect(sub.hasNode('res_c')).toBe(true);
    expect(sub.hasNode('res_e')).toBe(true);
    expect(sub.hasNode('res_d')).toBe(false); // d→a 是入边，不会被包含
  });

  test('stats returns graph statistics', () => {
    const stats = engine.stats();
    expect(stats.nodeCount).toBe(9);
    expect(stats.edgeCount).toBe(8);
  });
});

describe('GraphQueryBuilder', () => {
  let engine, graph;

  beforeEach(() => {
    graph = buildTestGraph();
    engine = new GraphEngine(graph);
  });

  test('from().outgoing().run() returns outgoing neighbors', () => {
    const results = new GraphQueryBuilder(engine)
      .from('res_a')
      .outgoing()
      .run();
    
    const rids = results.map(r => r.rid);
    expect(rids.sort()).toEqual(['res_b', 'res_c', 'res_e']);
  });

  test('from().incoming().run() returns incoming neighbors', () => {
    const results = new GraphQueryBuilder(engine)
      .from('res_a')
      .incoming()
      .run();
    
    const rids = results.map(r => r.rid);
    expect(rids).toEqual(['res_d']);
  });

  test('from().run() returns both directions by default (depth 1)', () => {
    const results = new GraphQueryBuilder(engine)
      .from('res_a')
      .run();
    
    const rids = results.map(r => r.rid).sort();
    expect(rids).toEqual(['res_b', 'res_c', 'res_d', 'res_e']);
  });

  test('from().outgoing().depth(2).run() returns 2-hop neighbors', () => {
    const results = new GraphQueryBuilder(engine)
      .from('res_a')
      .outgoing()
      .depth(2)
      .run();
    
    const rids = results.map(r => r.rid).sort();
    // a → b → c, a → c, a → e, b → c（深度 2 可达: b, c, e）
    expect(rids).toContain('res_b');
    expect(rids).toContain('res_c');
    expect(rids).toContain('res_e');
  });

  test('from().outgoing().type("wikilink").run() filters by relation type', () => {
    const results = new GraphQueryBuilder(engine)
      .from('res_a')
      .outgoing()
      .type('wikilink')
      .run();
    
    const rids = results.map(r => r.rid);
    expect(rids).toEqual(['res_e']); // only a→e is wikilink
  });

  test('query for isolated node returns empty', () => {
    const results = new GraphQueryBuilder(engine)
      .from('res_f')
      .run();
    
    expect(results).toEqual([]);
  });
});
