const Graph = require('../../src/domain/graph.cjs');
const GraphEngine = require('../../src/repo/graphEngine.cjs');
const SemanticRelationEngine = require('../../src/repo/semanticRelationEngine.cjs');

describe('SemanticRelationEngine', () => {
  describe('_sharedNeighborSuggestions', () => {
    test('suggests relation between nodes sharing at least two neighbors', () => {
      const g = new Graph();
      g.addEdge('X', 'A', 'wikilink');
      g.addEdge('X', 'B', 'wikilink');
      g.addEdge('Y', 'A', 'reference');
      g.addEdge('Y', 'B', 'reference');
      const sem = new SemanticRelationEngine(new GraphEngine(g), null);
      const suggestions = sem._sharedNeighborSuggestions();
      expect(suggestions.length).toBe(2);
      const s = suggestions.find(x => [x.source, x.target].sort().join() === ['A', 'B'].join());
      expect(s).toBeDefined();
      expect(s.suggestedType).toBe('wikilink');
      expect(s.reason).toContain('共享 2 个邻居');
      expect(s.confidence).toBeGreaterThan(0);
    });

    test('returns empty when no nodes share neighbors', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'reference');
      g.addNode('C');
      const sem = new SemanticRelationEngine(new GraphEngine(g), null);
      expect(sem._sharedNeighborSuggestions()).toEqual([]);
    });
  });

  describe('_reverseLinkSuggestions', () => {
    test('suggests reverse link when both endpoints have degree >= 2', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'reference');
      g.addEdge('A', 'C', 'reference');
      g.addEdge('D', 'B', 'reference');
      const sem = new SemanticRelationEngine(new GraphEngine(g), null);
      const suggestions = sem._reverseLinkSuggestions();
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toMatchObject({
        source: 'B',
        target: 'A',
        suggestedType: 'reference',
        confidence: 0.45
      });
    });

    test('does not suggest when reverse link already exists', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'reference');
      g.addEdge('B', 'A', 'reference');
      g.addEdge('A', 'C', 'reference');
      g.addEdge('D', 'B', 'reference');
      const sem = new SemanticRelationEngine(new GraphEngine(g), null);
      expect(sem._reverseLinkSuggestions()).toEqual([]);
    });
  });

  describe('_centralNodeSuggestions', () => {
    test('suggests connecting two high-degree hubs', () => {
      const g = new Graph();
      for (const n of ['n1', 'n2', 'n3', 'n4', 'n5']) g.addEdge('A', n, 'reference');
      for (const n of ['m1', 'm2', 'm3', 'm4', 'm5']) g.addEdge('B', n, 'reference');
      const sem = new SemanticRelationEngine(new GraphEngine(g), null);
      const suggestions = sem._centralNodeSuggestions();
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions[0]).toMatchObject({ source: 'A', target: 'B', suggestedType: 'reference' });
      expect(suggestions[0].confidence).toBe(0.25);
    });

    test('returns empty when fewer than two central nodes', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'reference');
      const sem = new SemanticRelationEngine(new GraphEngine(g), null);
      expect(sem._centralNodeSuggestions()).toEqual([]);
    });
  });

  describe('_inferType', () => {
    test('returns reference when no edge touches shared neighbors', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'reference');
      const sem = new SemanticRelationEngine(new GraphEngine(g), null);
      expect(sem._inferType('A', 'B', [])).toBe('reference');
    });

    test('returns most common type among shared-neighbor edges', () => {
      const g = new Graph();
      g.addEdge('X', 'A', 'wikilink');
      g.addEdge('X', 'B', 'wikilink');
      g.addEdge('X', 'C', 'reference');
      const sem = new SemanticRelationEngine(new GraphEngine(g), null);
      expect(sem._inferType('A', 'B', ['X'])).toBe('wikilink');
    });
  });

  describe('suggest', () => {
    test('combines, deduplicates and sorts suggestions', () => {
      const g = new Graph();
      g.addEdge('X', 'A', 'wikilink');
      g.addEdge('X', 'B', 'wikilink');
      g.addEdge('Y', 'A', 'reference');
      g.addEdge('Y', 'B', 'reference');
      const sem = new SemanticRelationEngine(new GraphEngine(g), null);
      const suggestions = sem.suggest();
      expect(suggestions.length).toBe(6);
      const keys = suggestions.map(s => `${s.source}|${s.target}`);
      expect(new Set(keys).size).toBe(keys.length);
      const scores = suggestions.map(s => s.confidence);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
      expect(suggestions.some(s => s.source === 'A' && s.target === 'B')).toBe(true);
    });

    test('excludes suggestions for existing edges', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'reference');
      g.addEdge('A', 'C', 'reference');
      g.addEdge('D', 'B', 'reference');
      const sem = new SemanticRelationEngine(new GraphEngine(g), null);
      const suggestions = sem.suggest({ maxSuggestions: 20 });
      expect(suggestions.some(s => s.source === 'B' && s.target === 'A')).toBe(true);
    });

    test('respects maxSuggestions option', () => {
      const g = new Graph();
      for (const n of ['n1', 'n2', 'n3', 'n4', 'n5']) g.addEdge('A', n, 'reference');
      for (const n of ['m1', 'm2', 'm3', 'm4', 'm5']) g.addEdge('B', n, 'reference');
      const sem = new SemanticRelationEngine(new GraphEngine(g), null);
      expect(sem.suggest({ maxSuggestions: 1 }).length).toBe(1);
    });
  });
});
