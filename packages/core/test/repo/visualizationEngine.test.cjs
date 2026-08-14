const Graph = require('../../src/domain/graph.cjs');
const GraphEngine = require('../../src/repo/graphEngine.cjs');
const VisualizationEngine = require('../../src/repo/visualizationEngine.cjs');
const VisualGraph = require('../../src/domain/visualGraph.cjs');

function buildVisualization() {
  const g = new Graph();
  g.addEdge('A', 'B', 'reference');
  g.addEdge('A', 'C', 'wikilink');
  g.addEdge('B', 'C', 'reference');
  g.addNode('D');
  const engine = new GraphEngine(g);
  return new VisualizationEngine(engine);
}

describe('VisualizationEngine', () => {
  let vis;

  beforeEach(() => {
    vis = buildVisualization();
  });

  describe('visualizeFull', () => {
    test('builds a VisualGraph for the whole graph with force layout', () => {
      const vg = vis.visualizeFull();
      expect(vg).toBeInstanceOf(VisualGraph);
      expect(vg.nodeCount()).toBe(4);
      expect(vg.edgeCount()).toBe(3);
      expect(vg.nodes.every(n => typeof n.x === 'number')).toBe(true);
      expect(vg.nodes.every(n => typeof n.y === 'number')).toBe(true);
    });

    test('supports tree layout', () => {
      const vg = vis.visualizeFull({ layout: 'tree' });
      expect(vg.nodeCount()).toBe(4);
      expect(vg.nodes.every(n => typeof n.x === 'number')).toBe(true);
    });

    test('supports radial layout', () => {
      const vg = vis.visualizeFull({ layout: 'radial' });
      expect(vg.nodeCount()).toBe(4);
      expect(vg.nodes.every(n => typeof n.x === 'number')).toBe(true);
    });
  });

  describe('visualizeNeighborhood', () => {
    test('returns null for missing center', () => {
      expect(vis.visualizeNeighborhood('nope')).toBeNull();
    });

    test('builds subgraph with center node highlighted', () => {
      const vg = vis.visualizeNeighborhood('A', { depth: 1 });
      expect(vg).toBeInstanceOf(VisualGraph);
      expect(vg.nodeCount()).toBe(3);
      const center = vg.getNode('A');
      expect(center.group).toBe('center');
      expect(vg.edgeCount()).toBe(3);
    });

    test('default depth is 2', () => {
      const vg = vis.visualizeNeighborhood('A');
      expect(vg.nodeCount()).toBe(3);
    });
  });

  describe('visualizeByType', () => {
    test('filters edges by relation type', () => {
      const vg = vis.visualizeByType('wikilink');
      expect(vg.nodeCount()).toBe(2);
      expect(vg.edgeCount()).toBe(1);
      expect(vg.edges[0]).toMatchObject({ source: 'A', target: 'C', type: 'wikilink' });
    });

    test('returns empty graph for unknown type', () => {
      const vg = vis.visualizeByType('nonexistent');
      expect(vg.nodeCount()).toBe(0);
      expect(vg.edgeCount()).toBe(0);
    });

    test('supports tree layout', () => {
      const vg = vis.visualizeByType('reference', { layout: 'tree' });
      expect(vg.nodeCount()).toBe(3);
    });
  });

  describe('visualize', () => {
    test('dispatches to neighborhood view', () => {
      const vg = vis.visualize({ type: 'neighborhood', rid: 'A', depth: 1 });
      expect(vg.nodeCount()).toBe(3);
    });

    test('dispatches to relation view', () => {
      const vg = vis.visualize({ type: 'relation', relType: 'wikilink' });
      expect(vg.edgeCount()).toBe(1);
    });

    test('falls back to full view', () => {
      const vg = vis.visualize({});
      expect(vg.nodeCount()).toBe(4);
    });

    test('neighborhood without rid falls back to full view', () => {
      const vg = vis.visualize({ type: 'neighborhood' });
      expect(vg.nodeCount()).toBe(4);
    });
  });
});
