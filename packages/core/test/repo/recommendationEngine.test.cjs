const RecommendationEngine = require('../../src/repo/recommendationEngine.cjs');

function makeGraph(edges) {
  const nodeSet = new Set();
  const out = new Map();
  const inn = new Map();
  for (const [from, to] of edges) {
    nodeSet.add(from);
    nodeSet.add(to);
    if (!out.has(from)) out.set(from, []);
    out.get(from).push({ from, to });
    if (!inn.has(to)) inn.set(to, []);
    inn.get(to).push({ from, to });
  }
  return {
    hasNode: (rid) => nodeSet.has(rid),
    outgoing: (rid) => out.get(rid) || [],
    incoming: (rid) => inn.get(rid) || [],
    degree: (rid) => {
      return (out.get(rid) || []).length + (inn.get(rid) || []).length;
    }
  };
}

function makeEngine({ graph, pageRank, incoming, neighbors }) {
  const incomingMock = jest.fn((rid) => (incoming ? incoming[rid] || [] : []));
  return {
    graph,
    pageRank: jest.fn(() => pageRank),
    incoming: incomingMock,
    neighbors: jest.fn((rid) => (neighbors ? neighbors[rid] || [] : []))
  };
}

describe('RecommendationEngine', () => {
  describe('related', () => {
    test('should return empty when no candidates', () => {
      const engine = makeEngine({ graph: makeGraph([]), pageRank: [] });
      const nav = { related: jest.fn(() => []) };
      const rec = new RecommendationEngine(engine, nav);
      expect(rec.related('a')).toEqual([]);
    });

    test('should score, rank and order candidates with reason branches', () => {
      const graph = makeGraph([]);
      const engine = makeEngine({
        graph,
        pageRank: [
          { rid: 'x', score: 0.5 },
          { rid: 'y', score: 0.05 },
          { rid: 'z', score: 1.0 },
          { rid: 'w', score: 0.1 }
        ],
        incoming: {
          x: ['n1'],
          y: ['n1'],
          z: Array.from({ length: 10 }, (_, i) => `in${i}`),
          w: ['n1']
        }
      });
      jest.spyOn(graph, 'degree').mockImplementation((rid) => ({ x: 1, y: 1, z: 10, w: 1 }[rid]));
      const nav = { related: jest.fn(() => [
        { rid: 'x', score: 0.9, sharedNeighbors: 4 },
        { rid: 'y', score: 0.5, sharedNeighbors: 1 },
        { rid: 'z', score: 0.2, sharedNeighbors: 0 },
        { rid: 'w', score: 0.7, sharedNeighbors: 1 }
      ]) };
      const rec = new RecommendationEngine(engine, nav);

      const result = rec.related('a');
      expect(result.map(r => r.rid)).toEqual(['z', 'x', 'w', 'y']);
      const byRid = Object.fromEntries(result.map(r => [r.rid, r]));
      expect(byRid.x.reason).toBe('strongly connected');
      expect(byRid.w.reason).toBe('high value');
      expect(byRid.z.reason).toBe('core resource');
      expect(byRid.z.rank).toBe('core');
      expect(byRid.y.reason).toBe('shared knowledge');
      expect(nav.related).toHaveBeenCalledWith('a', { topN: 20 });
    });

    test('should respect topN', () => {
      const graph = makeGraph([]);
      const engine = makeEngine({ graph, pageRank: [] });
      const nav = { related: jest.fn(() => [
        { rid: 'a', score: 0.1, sharedNeighbors: 1 },
        { rid: 'b', score: 0.1, sharedNeighbors: 1 },
        { rid: 'c', score: 0.1, sharedNeighbors: 1 }
      ]) };
      const rec = new RecommendationEngine(engine, nav);
      const result = rec.related('x', { topN: 2 });
      expect(result).toHaveLength(2);
    });
  });

  describe('nextLearning', () => {
    test('should return empty when rid is not in graph', () => {
      const engine = makeEngine({ graph: makeGraph([]), pageRank: [] });
      const rec = new RecommendationEngine(engine, { related: jest.fn(() => []) });
      expect(rec.nextLearning('missing')).toEqual([]);
    });

    test('should return empty when no candidates found', () => {
      const graph = makeGraph([['a', 'b']]);
      const engine = makeEngine({ graph, pageRank: [] });
      const rec = new RecommendationEngine(engine, { related: jest.fn(() => []) });
      expect(rec.nextLearning('a')).toEqual([]);
    });

    test('should discover second-degree candidates with scores and reasons', () => {
      const graph = makeGraph([
        ['a', 'b'], ['a', 'c'],
        ['b', 'x'], ['y', 'b'],
        ['c', 'x'], ['c', 'z'], ['z', 'c']
      ]);
      const engine = makeEngine({
        graph,
        neighbors: { a: ['b', 'c'] },
        pageRank: [
          { rid: 'x', score: 0.05 },
          { rid: 'y', score: 0.05 },
          { rid: 'z', score: 0.2 }
        ]
      });
      const rec = new RecommendationEngine(engine, { related: jest.fn(() => []) });

      const result = rec.nextLearning('a');
      const byRid = Object.fromEntries(result.map(r => [r.rid, r]));
      expect(Object.keys(byRid).sort()).toEqual(['x', 'y', 'z']);
      expect(byRid.z.linkCount).toBe(2);
      expect(byRid.z.reason).toBe('important concept');
      expect(byRid.x.reason).toBe('connected to your knowledge');
      const scores = result.map(r => r.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    });
  });

  describe('forgotten', () => {
    test('should return high page-rank nodes with low degree and reason branches', () => {
      const graph = makeGraph([]);
      const engine = makeEngine({
        graph,
        pageRank: [
          { rid: 'hi', score: 0.2 },
          { rid: 'iso', score: 0.3 },
          { rid: 'conn', score: 0.15 },
          { rid: 'low', score: 0.01 },
          { rid: 'busy', score: 0.5 }
        ],
        incoming: {
          hi: ['n1'],
          iso: [],
          conn: []
        }
      });
      jest.spyOn(graph, 'degree').mockImplementation((rid) => ({ hi: 1, iso: 0, conn: 2, low: 0, busy: 5 }[rid]));
      const rec = new RecommendationEngine(engine, { related: jest.fn(() => []) });

      const result = rec.forgotten();
      const byRid = Object.fromEntries(result.map(r => [r.rid, r]));
      expect(Object.keys(byRid).sort()).toEqual(['conn', 'hi', 'iso']);
      expect(byRid.iso.reason).toBe('completely isolated');
      expect(byRid.hi.reason).toBe('only one connection');
      expect(byRid.conn.reason).toBe('high potential, few connections');
      expect(result[0].rid).toBe('hi');
    });

    test('should respect topN', () => {
      const graph = makeGraph([]);
      const engine = makeEngine({
        graph,
        pageRank: [
          { rid: 'p1', score: 0.2 },
          { rid: 'p2', score: 0.2 },
          { rid: 'p3', score: 0.2 }
        ]
      });
      jest.spyOn(graph, 'degree').mockImplementation(() => 1);
      const rec = new RecommendationEngine(engine, { related: jest.fn(() => []) });
      expect(rec.forgotten({ topN: 2 })).toHaveLength(2);
    });
  });
});
