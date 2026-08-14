const VisualGraph = require('../../src/domain/visualGraph.cjs');
const Graph = require('../../src/domain/graph.cjs');

describe('VisualGraph', () => {
  test('should start empty', () => {
    const vg = new VisualGraph();
    expect(vg.nodeCount()).toBe(0);
    expect(vg.edgeCount()).toBe(0);
  });

  test('addNode should be chainable and apply defaults', () => {
    const vg = new VisualGraph();
    const ret = vg.addNode('a');
    expect(ret).toBe(vg);
    expect(vg.getNode('a')).toEqual({
      id: 'a',
      label: 'a',
      group: 'default',
      degree: 0,
      pageRank: undefined,
      x: undefined,
      y: undefined,
      r: undefined,
      color: undefined,
      metadata: {}
    });
  });

  test('addNode should store provided options', () => {
    const vg = new VisualGraph();
    vg.addNode('a', {
      label: 'Node A',
      group: 'hub',
      degree: 5,
      pageRank: 0.8,
      x: 10,
      y: 20,
      r: 5,
      color: '#f00',
      metadata: { kind: 'note' }
    });
    expect(vg.getNode('a')).toMatchObject({
      label: 'Node A',
      group: 'hub',
      degree: 5,
      pageRank: 0.8,
      x: 10,
      y: 20,
      r: 5,
      color: '#f00',
      metadata: { kind: 'note' }
    });
  });

  test('addEdge should default type to reference and weight to 1', () => {
    const vg = new VisualGraph();
    const ret = vg.addEdge('a', 'b');
    expect(ret).toBe(vg);
    expect(vg.edges[0]).toEqual({
      source: 'a',
      target: 'b',
      type: 'reference',
      weight: 1,
      metadata: {}
    });
  });

  test('addEdge should store custom type/weight/metadata', () => {
    const vg = new VisualGraph();
    vg.addEdge('a', 'b', 'relation', { weight: 3, metadata: { via: 'test' } });
    expect(vg.edges[0]).toMatchObject({
      type: 'relation',
      weight: 3,
      metadata: { via: 'test' }
    });
  });

  test('getNode should return undefined for missing node', () => {
    const vg = new VisualGraph();
    expect(vg.getNode('nope')).toBeUndefined();
  });

  test('toJSON should serialize nodes and edges', () => {
    const vg = new VisualGraph();
    vg.addNode('a', { label: 'A', degree: 2 });
    vg.addEdge('a', 'b', 'reference', { weight: 2 });
    expect(vg.toJSON()).toEqual({
      nodes: [
        expect.objectContaining({ id: 'a', label: 'A', degree: 2 })
      ],
      edges: [
        expect.objectContaining({ source: 'a', target: 'b', weight: 2 })
      ]
    });
  });

  describe('fromGraph', () => {
    function buildGraph() {
      const g = new Graph();
      g.addNode('hub', { label: 'Hub Node' });
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addNode('x');
      g.addNode('y');
      g.addNode('p');
      g.addNode('q');
      g.addNode('r');
      g.addNode('z');
      // hub: 3 outgoing + 2 incoming = degree 5
      g.addEdge('hub', 'a', 'reference');
      g.addEdge('hub', 'b', 'reference');
      g.addEdge('hub', 'c', 'reference');
      g.addEdge('x', 'hub', 'reference');
      g.addEdge('y', 'hub', 'reference');
      // q: 1 incoming + 1 outgoing = degree 2 connector
      g.addEdge('p', 'q', 'reference');
      g.addEdge('q', 'r', 'reference');
      // z: isolated leaf
      return g;
    }

    function stubEngine(prMap) {
      return {
        pageRank: () =>
          Object.entries(prMap).map(([rid, score]) => ({ rid, score }))
      };
    }

    test('should build nodes with groups and labels', () => {
      const g = buildGraph();
      const vg = VisualGraph.fromGraph(g, stubEngine({ hub: 0.8, a: 0.1 }));

      expect(vg.nodeCount()).toBe(10);
      expect(vg.getNode('hub').group).toBe('hub');
      expect(vg.getNode('hub').label).toBe('Hub Node');
      expect(vg.getNode('hub').pageRank).toBe(0.8);
      expect(vg.getNode('q').group).toBe('connector');
      expect(vg.getNode('x').group).toBe('source');
      expect(vg.getNode('a').group).toBe('sink');
      expect(vg.getNode('z').group).toBe('leaf');
    });

    test('should copy all graph edges with weight 1', () => {
      const g = buildGraph();
      const vg = VisualGraph.fromGraph(g, stubEngine({}));
      expect(vg.edgeCount()).toBe(7);
      expect(vg.edges[0]).toMatchObject({ source: 'hub', target: 'a', type: 'reference', weight: 1 });
    });
  });
});
