const Graph = require('../../src/domain/graph.cjs');
const GraphEngine = require('../../src/repo/graphEngine.cjs');
const NavigationEngine = require('../../src/repo/navigationEngine.cjs');
const AIContextBuilder = require('../../src/repo/aiContextBuilder.cjs');

function setup(analyzer) {
  const g = new Graph();
  g.addEdge('A', 'B', 'reference');
  g.addEdge('A', 'C', 'wikilink');
  g.addEdge('B', 'C', 'reference');
  g.addNode('D');
  const engine = new GraphEngine(g);
  const nav = new NavigationEngine(engine);
  const resolveName = (rid) => ({ name: `name-${rid}`, type: 'note', layer: 0 });
  const builder = new AIContextBuilder(engine, nav, analyzer, resolveName);
  return { builder, engine, nav };
}

describe('AIContextBuilder', () => {
  describe('buildResourceContext', () => {
    test('returns null for missing node', () => {
      const { builder } = setup();
      expect(builder.buildResourceContext('nope')).toBeNull();
    });

    test('builds resource metadata with relations and neighborhood', () => {
      const { builder } = setup();
      const context = builder.buildResourceContext('A');
      expect(context.resource).toMatchObject({
        rid: 'A',
        name: 'name-A',
        degree: 2,
        incoming: 0,
        outgoing: 2
      });
      expect(typeof context.resource.pageRank).toBe('number');
      expect(context.relations).toHaveLength(2);
      expect(context.relations.find(r => r.target === 'B')).toMatchObject({
        type: 'reference',
        direction: 'outgoing',
        targetName: 'name-B'
      });
      expect(context.neighborhood.map(n => n.rid).sort()).toEqual(['B', 'C']);
    });

    test('includes incoming relations with target names', () => {
      const { builder } = setup();
      const context = builder.buildResourceContext('C');
      expect(context.resource.incoming).toBe(2);
      expect(context.relations.filter(r => r.direction === 'incoming')).toHaveLength(2);
    });

    test('works without navigation engine', () => {
      const g = new Graph();
      g.addEdge('A', 'B', 'reference');
      const engine = new GraphEngine(g);
      const builder = new AIContextBuilder(engine, null, null, (rid) => ({ name: rid }));
      const context = builder.buildResourceContext('A');
      expect(context.related).toEqual([]);
    });
  });

  describe('buildGlobalContext', () => {
    test('builds overview with analyzer metrics', () => {
      const analyzer = {
        density: jest.fn(() => ({ density: 0.75, level: 'moderate' })),
        gaps: jest.fn(() => [{ from: 'a', to: 'b', suggested: 'n' }])
      };
      const { builder } = setup(analyzer);
      const context = builder.buildGlobalContext();
      expect(context.overview).toEqual({
        totalResources: 4,
        totalRelations: 3,
        density: 0.75,
        densityLevel: 'moderate'
      });
      expect(context.topNodes.length).toBeGreaterThanOrEqual(1);
      expect(context.isolated).toContainEqual({ rid: 'D', name: 'name-D' });
      expect(context.gaps).toHaveLength(1);
    });

    test('defaults when no analyzer provided', () => {
      const { builder } = setup();
      const context = builder.buildGlobalContext();
      expect(context.overview.density).toBe(0);
      expect(context.overview.densityLevel).toBe('unknown');
      expect(context.gaps).toEqual([]);
    });

    test('maps central nodes to names', () => {
      const { builder } = setup();
      const context = builder.buildGlobalContext();
      const top = context.topNodes.find(n => n.rid === 'A');
      expect(top.name).toBe('name-A');
      expect(top.degree).toBe(2);
    });
  });

  describe('buildChatContext', () => {
    test('wraps global context with query and timestamp', () => {
      const { builder } = setup();
      const context = builder.buildChatContext('what is important?');
      expect(context.query).toBe('what is important?');
      expect(context.knowledgeGraph).toHaveProperty('overview');
      expect(context.timestamp).toBeGreaterThan(0);
    });
  });
});
