const Graph = require('../../src/domain/graph.cjs');
const GraphEngine = require('../../src/repo/graphEngine.cjs');
const KnowledgeAnalyzer = require('../../src/repo/knowledgeAnalyzer.cjs');

function analyzerFor(edges, extraNodes = []) {
  const g = new Graph();
  for (const e of edges) g.addEdge(e[0], e[1], e[2] || 'reference');
  for (const n of extraNodes) g.addNode(n);
  return new KnowledgeAnalyzer(new GraphEngine(g), null);
}

describe('KnowledgeAnalyzer', () => {
  describe('density', () => {
    test('empty graph is sparse with zero density', () => {
      const a = analyzerFor([]);
      expect(a.density()).toEqual({ resources: 0, relations: 0, density: 0, level: 'sparse' });
    });

    test('low density is sparse', () => {
      const a = analyzerFor([['A', 'B']]);
      expect(a.density()).toEqual({ resources: 2, relations: 1, density: 0.5, level: 'moderate' });
    });

    test('moderate density', () => {
      const a = analyzerFor([['A', 'B'], ['B', 'C'], ['A', 'C']]);
      expect(a.density().level).toBe('moderate');
    });

    test('high density is connected', () => {
      const a = analyzerFor([['A', 'B'], ['B', 'A'], ['B', 'C'], ['C', 'B'], ['A', 'C'], ['C', 'A'], ['A', 'D'], ['D', 'A']]);
      expect(a.density().density).toBe(2);
      expect(a.density().level).toBe('connected');
    });

    test('very high density is dense', () => {
      const a = analyzerFor([['A', 'A'], ['A', 'A'], ['A', 'A'], ['A', 'A'], ['A', 'A']]);
      expect(a.density().level).toBe('dense');
    });
  });

  describe('islands', () => {
    test('detects isolated clusters with isolation score', () => {
      const a = analyzerFor([['A', 'B'], ['D', 'E']], ['C']);
      const islands = a.islands();
      expect(islands).toHaveLength(3);
      const singleton = islands.find(i => i.size === 1);
      expect(singleton.nodes).toEqual(['C']);
      expect(singleton.isolation).toBe(0.8);
      const pair = islands.find(i => i.size === 2);
      expect(pair.isolation).toBe(0.6);
    });

    test('returns empty for empty graph', () => {
      expect(analyzerFor([]).islands()).toEqual([]);
    });
  });

  describe('gaps', () => {
    test('returns empty when fewer than two clusters', () => {
      const a = analyzerFor([['A', 'B'], ['B', 'C']]);
      expect(a.gaps()).toEqual([]);
    });

    test('returns empty across distinct connected clusters', () => {
      const a = analyzerFor([['A', 'B'], ['C', 'D']]);
      expect(a.gaps({ maxGaps: 5 })).toEqual([]);
    });
  });

  describe('report', () => {
    test('summarizes density, clusters and gaps', () => {
      const a = analyzerFor([['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E'], ['E', 'A']], ['F']);
      const report = a.report();
      expect(report.density).toMatchObject({ resources: 6 });
      expect(report.clusters.total).toBe(2);
      expect(report.clusters.core).toBe(1);
      expect(report.clusters.isolated).toBe(1);
      expect(report.clusters.largest).toBe(5);
      expect(report.gaps).toEqual([]);
    });
  });
});
