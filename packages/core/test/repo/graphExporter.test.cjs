const Graph = require('../../src/domain/graph.cjs');
const GraphExporter = require('../../src/repo/graphExporter.cjs');

function sampleGraph() {
  const g = new Graph();
  g.addNode('A', { label: 'Alpha' });
  g.addNode('B');
  g.addNode('Lonely');
  g.addEdge('A', 'B', 'reference');
  g.addEdge('A', 'Lonely', 'wikilink', { label: 'wiki' });
  return g;
}

describe('GraphExporter', () => {
  test('toJSON stringifies graph structure', () => {
    const exporter = new GraphExporter(sampleGraph());
    const parsed = JSON.parse(exporter.toJSON());
    expect(parsed.nodes.length).toBe(3);
    expect(parsed.edges.length).toBe(2);
    expect(parsed.nodes.find(n => n.rid === 'A').metadata).toEqual({ label: 'Alpha' });
  });

  describe('toDOT', () => {
    test('produces a directed graph by default', () => {
      const dot = new GraphExporter(sampleGraph()).toDOT();
      expect(dot).toContain('digraph "G" {');
      expect(dot).toContain('"A" [label="Alpha"];');
      expect(dot).toContain('"A" -> "B";');
      expect(dot).toContain('"A" -> "Lonely" [label="wiki"];');
      expect(dot).toContain('"Lonely";');
      expect(dot.trim().endsWith('}')).toBe(true);
    });

    test('non-reference edges get type label', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'dependency');
      const dot = new GraphExporter(g).toDOT();
      expect(dot).toContain('"A" -> "B" [label="dependency"];');
    });

    test('produces an undirected graph with custom name', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'reference');
      const dot = new GraphExporter(g).toDOT({ directed: false, graphName: 'X' });
      expect(dot).toContain('graph "X" {');
      expect(dot).toContain('"A" -- "B";');
    });

    test('escapes quotes and newlines in ids and labels', () => {
      const g = new Graph();
      g.addNode('has"quote', { label: 'line\nbreak' });
      g.addEdge('has"quote', 'B', 'reference');
      const dot = new GraphExporter(g).toDOT();
      expect(dot).toContain('"has\\"quote"');
      expect(dot).toContain('line\\nbreak');
    });
  });

  describe('toMermaid', () => {
    test('renders flowchart with edges and isolated nodes', () => {
      const mermaid = new GraphExporter(sampleGraph()).toMermaid();
      expect(mermaid).toContain('flowchart LR');
      expect(mermaid).toContain('A --> B');
      expect(mermaid).toContain('A |wikilink| Lonely');
    });

    test('respects custom format and direction', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'reference');
      const mermaid = new GraphExporter(g).toMermaid({ format: 'graph', direction: 'TD' });
      expect(mermaid).toContain('graph TD');
    });

    test('reference edges use plain arrow', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'reference');
      expect(new GraphExporter(g).toMermaid()).toContain('A --> B');
    });
  });

  describe('toAdjacencyList', () => {
    test('lists outgoing targets with type suffix', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'reference');
      g.addEdge('A', 'C', 'dependency');
      const list = new GraphExporter(g).toAdjacencyList();
      expect(list).toContain('A → B, C [dependency]');
    });

    test('omits nodes without outgoing edges', () => {
      const g = new Graph();
      g.addNode('A');
      g.addEdge('B', 'A', 'reference');
      const list = new GraphExporter(g).toAdjacencyList();
      expect(list).not.toContain('A →');
      expect(list).toContain('B → A');
    });

    test('returns empty string for empty graph', () => {
      expect(new GraphExporter(new Graph()).toAdjacencyList()).toBe('');
    });
  });
});
