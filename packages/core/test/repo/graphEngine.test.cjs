const Graph = require('../../src/domain/graph.cjs');
const GraphEngine = require('../../src/repo/graphEngine.cjs');

function makeGraph(edges) {
  const g = new Graph();
  for (const e of edges) {
    g.addEdge(e[0], e[1], e[2] || 'reference');
  }
  return g;
}

describe('GraphEngine', () => {
  test('neighbors returns deduplicated in and out targets', () => {
    const g = makeGraph([['a', 'b'], ['b', 'a'], ['a', 'c']]);
    const engine = new GraphEngine(g);
    expect(engine.neighbors('a').sort()).toEqual(['b', 'c']);
    expect(engine.neighbors('missing')).toEqual([]);
  });

  test('incoming returns sources pointing to rid', () => {
    const g = makeGraph([['a', 'b'], ['c', 'b'], ['b', 'd']]);
    const engine = new GraphEngine(g);
    expect(engine.incoming('b').sort()).toEqual(['a', 'c']);
    expect(engine.outgoing('b')).toEqual(['d']);
  });

  describe('findPath', () => {
    const g = makeGraph([['a', 'b'], ['b', 'c'], ['a', 'd']]);
    const engine = new GraphEngine(g);

    test('returns null when either node missing', () => {
      expect(engine.findPath('a', 'zzz')).toBeNull();
      expect(engine.findPath('zzz', 'a')).toBeNull();
    });

    test('returns zero-length path for same node', () => {
      expect(engine.findPath('a', 'a')).toEqual({ path: ['a'], length: 0 });
    });

    test('finds direct and multi-hop paths', () => {
      expect(engine.findPath('a', 'b').length).toBe(1);
      const p = engine.findPath('a', 'c');
      expect(p.path).toEqual(['a', 'b', 'c']);
      expect(p.length).toBe(2);
    });

    test('returns null when no path exists', () => {
      expect(engine.findPath('c', 'd')).toBeNull();
    });

    test('isReachable reflects path existence', () => {
      expect(engine.isReachable('a', 'c')).toBe(true);
      expect(engine.isReachable('c', 'a')).toBe(false);
    });
  });

  test('reachable returns all downstream nodes excluding self', () => {
    const g = makeGraph([['a', 'b'], ['b', 'c'], ['a', 'd']]);
    const engine = new GraphEngine(g);
    expect(engine.reachable('a').sort()).toEqual(['b', 'c', 'd']);
    expect(engine.reachable('c')).toEqual([]);
    expect(engine.reachable('missing')).toEqual([]);
  });

  test('ancestors returns all upstream nodes excluding self', () => {
    const g = makeGraph([['a', 'b'], ['b', 'c'], ['x', 'a']]);
    const engine = new GraphEngine(g);
    expect(engine.ancestors('c').sort()).toEqual(['a', 'b', 'x']);
    expect(engine.ancestors('missing')).toEqual([]);
  });

  describe('detectCycles', () => {
    test('detects a simple 2-node cycle', () => {
      const g = makeGraph([['a', 'b'], ['b', 'a']]);
      const cycles = new GraphEngine(g).detectCycles();
      expect(cycles.length).toBe(1);
      expect(cycles[0].sort()).toEqual(['a', 'b']);
    });

    test('returns empty for acyclic graph', () => {
      const g = makeGraph([['a', 'b'], ['b', 'c']]);
      expect(new GraphEngine(g).detectCycles()).toEqual([]);
    });

    test('returns empty for empty graph', () => {
      expect(new GraphEngine(new Graph()).detectCycles()).toEqual([]);
    });
  });

  describe('pageRank', () => {
    test('returns empty for empty graph', () => {
      expect(new GraphEngine(new Graph()).pageRank()).toEqual([]);
    });

    test('distributes rank over two-node graph', () => {
      const engine = new GraphEngine(makeGraph([['a', 'b'], ['b', 'a']]));
      const pr = engine.pageRank({ iterations: 20, damping: 0.85 });
      expect(pr).toHaveLength(2);
      const total = pr.reduce((s, p) => s + p.score, 0);
      expect(total).toBeCloseTo(1, 2);
      expect(pr[0].score).toBeCloseTo(pr[1].score, 2);
    });

    test('honours custom options and sorts descending', () => {
      const engine = new GraphEngine(makeGraph([['a', 'b'], ['b', 'c'], ['c', 'a'], ['a', 'd']]));
      const pr = engine.pageRank({ iterations: 5, damping: 0.5 });
      const scores = pr.map(p => p.score);
      expect([...scores].sort((x, y) => y - x)).toEqual(scores);
    });
  });

  test('centralNodes returns top nodes by degree', () => {
    const g = makeGraph([['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c']]);
    const engine = new GraphEngine(g);
    g.addNode('iso');
    const top = engine.centralNodes(2);
    expect(top.length).toBe(2);
    expect(top[0].rid).toBe('a');
    expect(top[0].degree).toBe(3);
  });

  test('isolatedNodes finds degree-zero nodes', () => {
    const g = makeGraph([['a', 'b']]);
    g.addNode('lonely');
    const engine = new GraphEngine(g);
    expect(engine.isolatedNodes()).toEqual(['lonely']);
  });

  describe('clusters', () => {
    test('groups connected components and sorts by size', () => {
      const g = makeGraph([['a', 'b'], ['b', 'c'], ['x', 'y']]);
      g.addNode('solo');
      const clusters = new GraphEngine(g).clusters();
      expect(clusters).toHaveLength(3);
      expect(clusters[0]).toMatchObject({ size: 3 });
      const sizes = clusters.map(c => c.size);
      expect([...sizes].sort((x, y) => y - x)).toEqual(sizes);
    });

    test('returns empty for empty graph', () => {
      expect(new GraphEngine(new Graph()).clusters()).toEqual([]);
    });
  });

  describe('subGraph', () => {
    const g = makeGraph([['a', 'b'], ['b', 'c'], ['a', 'd']]);
    const engine = new GraphEngine(g);

    test('returns empty graph for missing root', () => {
      const sg = engine.subGraph('missing');
      expect(sg.nodeCount()).toBe(0);
    });

    test('extracts depth-limited subgraph', () => {
      const sg = engine.subGraph('a', 1);
      expect(sg.hasNode('a')).toBe(true);
      expect(sg.hasNode('b')).toBe(true);
      expect(sg.hasNode('d')).toBe(true);
      expect(sg.hasNode('c')).toBe(false);
    });
  });

  describe('stats', () => {
    test('returns node and edge metrics with cycles', () => {
      const g = makeGraph([['a', 'b'], ['b', 'a'], ['a', 'c']]);
      const stats = new GraphEngine(g).stats();
      expect(stats.nodeCount).toBe(3);
      expect(stats.edgeCount).toBe(3);
      expect(stats.maxDegree).toBe(3);
      expect(stats.avgDegree).toBe(2);
      expect(stats.cycles).toBe(1);
    });

    test('handles empty graph', () => {
      const stats = new GraphEngine(new Graph()).stats();
      expect(stats).toMatchObject({ nodeCount: 0, edgeCount: 0, maxDegree: 0, avgDegree: 0, cycles: 0 });
    });
  });
});
