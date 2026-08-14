const GraphBuilder = require('../../src/repo/graphBuilder.cjs');

describe('GraphBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new GraphBuilder();
  });

  describe('build', () => {
    test('returns empty graph for empty input', () => {
      const g = builder.build([]);
      expect(g.nodeCount()).toBe(0);
      expect(g.edgeCount()).toBe(0);
    });

    test('returns empty graph when called without args', () => {
      const g = builder.build();
      expect(g.nodeCount()).toBe(0);
      expect(g.edgeCount()).toBe(0);
    });

    test('builds nodes and edges from relations', () => {
      const g = builder.build([
        { id: 1, from_rid: 'a', to_rid: 'b', type: 'reference', metadata: { label: 'x' } },
        { id: 2, from_rid: 'b', to_rid: 'c', type: 'wikilink', metadata: { origin: 'md' } }
      ]);
      expect(g.nodeCount()).toBe(3);
      expect(g.edgeCount()).toBe(2);
      expect(g.hasNode('a')).toBe(true);
      expect(g.hasNode('b')).toBe(true);
      expect(g.hasNode('c')).toBe(true);
      expect(g.outgoing('a')[0].metadata).toEqual({ id: 1, label: 'x' });
      expect(g.outgoing('b')[0].type).toBe('wikilink');
    });

    test('handles relations without metadata', () => {
      const g = builder.build([{ id: 7, from_rid: 'a', to_rid: 'b', type: 'reference' }]);
      expect(g.outgoing('a')[0].metadata).toEqual({ id: 7 });
    });

    test('preserves relation type', () => {
      const g = builder.build([{ id: 3, from_rid: 'a', to_rid: 'b', type: 'dependency' }]);
      expect(g.outgoing('a')[0].type).toBe('dependency');
    });
  });

  describe('buildSubGraph', () => {
    const relations = [
      { id: 1, from_rid: 'root', to_rid: 'x', type: 'reference' },
      { id: 2, from_rid: 'x', to_rid: 'y', type: 'reference' },
      { id: 3, from_rid: 'root', to_rid: 'z', type: 'reference' },
      { id: 4, from_rid: 'unrelated', to_rid: 'n1', type: 'reference' }
    ];

    test('returns empty graph when root does not exist', () => {
      const g = builder.buildSubGraph(relations, 'missing');
      expect(g.nodeCount()).toBe(0);
      expect(g.edgeCount()).toBe(0);
    });

    test('extracts depth-1 subgraph around root', () => {
      const g = builder.buildSubGraph(relations, 'root', 1);
      expect(g.hasNode('root')).toBe(true);
      expect(g.hasNode('x')).toBe(true);
      expect(g.hasNode('z')).toBe(true);
      expect(g.hasNode('y')).toBe(false);
      expect(g.hasNode('unrelated')).toBe(false);
      expect(g.edgeCount()).toBe(2);
    });

    test('includes deeper nodes at higher depth', () => {
      const g = builder.buildSubGraph(relations, 'root', 2);
      expect(g.hasNode('y')).toBe(true);
      expect(g.edgeCount()).toBe(3);
    });

    test('default depth is 1', () => {
      const g = builder.buildSubGraph(relations, 'root');
      expect(g.hasNode('y')).toBe(false);
    });
  });
});
