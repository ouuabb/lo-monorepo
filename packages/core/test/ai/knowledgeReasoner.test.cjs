const KnowledgeReasoner = require('../../src/ai/knowledgeReasoner.cjs');

describe('KnowledgeReasoner', () => {
  let logger;

  beforeEach(() => {
    logger = { error: jest.fn(), log: jest.fn() };
  });

  test('analyzeGraph should return zeros without services', async () => {
    const reasoner = new KnowledgeReasoner({ logger });
    expect(await reasoner.analyzeGraph()).toEqual({ nodeCount: 0, edgeCount: 0, islandCount: 0, orphanCount: 0 });
  });

  test('analyzeGraph should use repository stats', async () => {
    const repository = { getStats: jest.fn().mockResolvedValue({ resourceCount: 5, relationCount: 3 }) };
    const reasoner = new KnowledgeReasoner({ repository, logger });
    const result = await reasoner.analyzeGraph();
    expect(result.nodeCount).toBe(5);
    expect(result.edgeCount).toBe(3);
  });

  test('analyzeGraph should tolerate repository failure', async () => {
    const repository = { getStats: jest.fn().mockRejectedValue(new Error('stats')) };
    const reasoner = new KnowledgeReasoner({ repository, logger });
    const result = await reasoner.analyzeGraph();
    expect(result.nodeCount).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });

  test('analyzeGraph should use graphEngine stats from a resolved promise', async () => {
    const graphEngine = Promise.resolve({ stats: () => ({ nodeCount: 9, edgeCount: 4 }) });
    const reasoner = new KnowledgeReasoner({ graphEngine, logger });
    const result = await reasoner.analyzeGraph();
    expect(result.nodeCount).toBe(9);
    expect(result.edgeCount).toBe(4);
  });

  test('analyzeGraph should tolerate graphEngine failure', async () => {
    const graphEngine = Promise.reject(new Error('graph'));
    const reasoner = new KnowledgeReasoner({ graphEngine, logger });
    const result = await reasoner.analyzeGraph();
    expect(result.nodeCount).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });

  test('suggestRelations should return repository suggestions', async () => {
    const repository = { getRelationSuggestions: jest.fn().mockResolvedValue([{ from: 'a', to: 'b' }]) };
    const reasoner = new KnowledgeReasoner({ repository, logger });
    expect(await reasoner.suggestRelations(5)).toEqual([{ from: 'a', to: 'b' }]);
    expect(repository.getRelationSuggestions).toHaveBeenCalledWith(5);
  });

  test('suggestRelations should return empty without repository', async () => {
    const reasoner = new KnowledgeReasoner({ logger });
    expect(await reasoner.suggestRelations()).toEqual([]);
  });

  test('suggestRelations should tolerate repository failure', async () => {
    const repository = { getRelationSuggestions: jest.fn().mockRejectedValue(new Error('recs')) };
    const reasoner = new KnowledgeReasoner({ repository, logger });
    expect(await reasoner.suggestRelations()).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });

  test('detectKnowledgeGaps should flag forgotten resources', async () => {
    const repository = { getKnowledgeLifecycle: jest.fn().mockResolvedValue({ forgotten: 2 }) };
    const reasoner = new KnowledgeReasoner({ repository, logger });
    const gaps = await reasoner.detectKnowledgeGaps();
    expect(gaps).toContainEqual({ type: 'forgotten', count: 2, suggestion: 'Review forgotten resources' });
  });

  test('detectKnowledgeGaps should not flag zero forgotten', async () => {
    const repository = { getKnowledgeLifecycle: jest.fn().mockResolvedValue({ forgotten: 0 }) };
    const reasoner = new KnowledgeReasoner({ repository, logger });
    const gaps = await reasoner.detectKnowledgeGaps();
    expect(gaps.filter(g => g.type === 'forgotten')).toHaveLength(0);
  });

  test('detectKnowledgeGaps should flag orphan nodes from graph', async () => {
    const graphEngine = { build: jest.fn().mockResolvedValue({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ from: 'a', to: 'b' }] }) };
    const reasoner = new KnowledgeReasoner({ graphEngine, logger });
    const gaps = await reasoner.detectKnowledgeGaps();
    expect(gaps).toContainEqual({ type: 'orphan', count: 1, suggestion: 'Connect orphan nodes' });
  });

  test('detectKnowledgeGaps should tolerate repository failure', async () => {
    const repository = { getKnowledgeLifecycle: jest.fn().mockRejectedValue(new Error('lf')) };
    const reasoner = new KnowledgeReasoner({ repository, logger });
    const gaps = await reasoner.detectKnowledgeGaps();
    expect(gaps).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });

  test('detectKnowledgeGaps should tolerate graph build failure', async () => {
    const graphEngine = { build: jest.fn().mockRejectedValue(new Error('build')) };
    const reasoner = new KnowledgeReasoner({ graphEngine, logger });
    const gaps = await reasoner.detectKnowledgeGaps();
    expect(gaps).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });

  test('detectKnowledgeGaps should return empty without services', async () => {
    const reasoner = new KnowledgeReasoner({ logger });
    expect(await reasoner.detectKnowledgeGaps()).toEqual([]);
  });

  test('conceptDiscovery should return empty discovery', async () => {
    const reasoner = new KnowledgeReasoner({ logger });
    expect(await reasoner.conceptDiscovery()).toEqual({ discovered: 0, suggestions: [] });
  });
});
