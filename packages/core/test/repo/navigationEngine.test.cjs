const Graph = require('../../src/domain/graph.cjs');
const GraphEngine = require('../../src/repo/graphEngine.cjs');
const NavigationEngine = require('../../src/repo/navigationEngine.cjs');

function buildNavigation() {
  const g = new Graph();
  g.addEdge('A', 'B', 'reference');
  g.addEdge('A', 'C', 'reference');
  g.addEdge('B', 'D', 'reference');
  g.addEdge('C', 'D', 'reference');
  g.addEdge('D', 'E', 'reference');
  g.addEdge('X', 'A', 'reference');
  g.addEdge('Y', 'X', 'reference');
  g.addEdge('Z', 'Y', 'reference');
  g.addNode('Isolated');
  const engine = new GraphEngine(g);
  return new NavigationEngine(engine);
}

describe('NavigationEngine', () => {
  let nav;

  beforeEach(() => {
    nav = buildNavigation();
  });

  describe('related', () => {
    test('returns second-degree candidates ranked by shared neighbors', () => {
      const results = nav.related('A', { topN: 10 });
      expect(results.length).toBeGreaterThanOrEqual(2);
      const d = results.find(r => r.rid === 'D');
      const y = results.find(r => r.rid === 'Y');
      expect(d).toBeDefined();
      expect(y).toBeDefined();
      expect(d.sharedNeighbors).toBe(2);
      expect(y.sharedNeighbors).toBe(1);
      expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score);
    });

    test('returns empty for missing node', () => {
      expect(nav.related('nope')).toEqual([]);
    });

    test('returns empty for isolated node', () => {
      expect(nav.related('Isolated')).toEqual([]);
    });

    test('respects topN limit', () => {
      expect(nav.related('A', { topN: 1 }).length).toBe(1);
    });
  });

  describe('backlinks', () => {
    test('returns incoming references with types', () => {
      const links = nav.backlinks('A');
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ rid: 'X', type: 'reference' });
    });

    test('returns empty for missing node', () => {
      expect(nav.backlinks('nope')).toEqual([]);
    });
  });

  describe('neighborhood', () => {
    test('returns null for missing center', () => {
      expect(nav.neighborhood('nope')).toBeNull();
    });

    test('collects nodes and edges up to depth', () => {
      const result = nav.neighborhood('D', { depth: 1 });
      expect(result.center).toBe('D');
      expect(result.nodes.sort()).toEqual(['B', 'C', 'E']);
      expect(result.edges).toHaveLength(3);
      expect(result.depth).toBe(1);
    });

    test('default depth is 2', () => {
      const result = nav.neighborhood('D');
      expect(result.nodes.sort()).toEqual(['A', 'B', 'C', 'E']);
    });
  });

  describe('explainPath', () => {
    test('annotates each hop with relation type', () => {
      const result = nav.explainPath('A', 'E');
      expect(result.path).toEqual(['A', 'B', 'D', 'E']);
      expect(result.length).toBe(3);
      expect(result.explanation).toContain('A --[reference]--> B');
      expect(result.explanation).toContain('B --[reference]--> D');
    });

    test('returns null when no path exists', () => {
      expect(nav.explainPath('E', 'A')).toBeNull();
      expect(nav.explainPath('A', 'nope')).toBeNull();
    });

    test('explains single-hop path', () => {
      const result = nav.explainPath('C', 'D');
      expect(result.explanation).toContain('C --[reference]--> D');
    });
  });

  describe('impact', () => {
    test('returns direct and indirect impacted nodes with score', () => {
      const result = nav.impact('A', { depth: 3 });
      expect(result.resource).toBe('A');
      expect(result.direct).toBe(1);
      expect(result.directList[0].rid).toBe('X');
      expect(result.indirectList.sort()).toEqual(['Y', 'Z']);
      expect(result.totalImpacted).toBe(3);
      expect(typeof result.score).toBe('number');
    });

    test('returns null for missing node', () => {
      expect(nav.impact('nope')).toBeNull();
    });

    test('impact on isolated node has no direct references', () => {
      const result = nav.impact('Isolated');
      expect(result.direct).toBe(0);
      expect(result.indirect).toBe(0);
      expect(result.totalImpacted).toBe(0);
    });
  });
});
