const ReasoningEngine = require('../../src/ai/reasoningEngine.cjs');

describe('ReasoningEngine', () => {
  let logger;

  beforeEach(() => {
    logger = { error: jest.fn(), log: jest.fn() };
  });

  function makeRequest(overrides = {}) {
    return { mode: 'chat', input: 'hello world', ...overrides };
  }

  test('reason in chat mode should record understanding and memory thoughts', async () => {
    const semanticMemory = { retrieve: jest.fn().mockResolvedValue([{}, {}]) };
    const engine = new ReasoningEngine({ semanticMemory, logger });
    const result = await engine.reason(makeRequest());
    expect(result.thoughts[0]).toEqual({ step: 'understand', content: 'Mode: chat, Input: hello world' });
    expect(result.evidence).toContainEqual({ source: 'semantic_memory', items: 2 });
    expect(result.conclusion).toBe('Processed: hello world');
    expect(result.confidence).toBe(0.5);
  });

  test('reason in chat mode should skip memory when semanticMemory is missing', async () => {
    const engine = new ReasoningEngine({ logger });
    const result = await engine.reason(makeRequest());
    expect(result.evidence).toHaveLength(0);
    expect(result.thoughts).toHaveLength(1);
  });

  test('reason in analysis mode should include graph analysis', async () => {
    const knowledgeReasoner = { analyzeGraph: jest.fn().mockResolvedValue({ nodeCount: 3, edgeCount: 2 }) };
    const engine = new ReasoningEngine({ knowledgeReasoner, logger });
    const result = await engine.reason(makeRequest({ mode: 'analysis' }));
    expect(result.evidence).toContainEqual({ source: 'graph_analysis', data: { nodeCount: 3, edgeCount: 2 } });
    expect(result.conclusion).toBe('Analysis completed. 1 evidence sources evaluated.');
    expect(result.confidence).toBe(0.7);
  });

  test('reason in analysis mode should not call concept memory', async () => {
    const conceptMemory = { search: jest.fn() };
    const engine = new ReasoningEngine({ conceptMemory, logger });
    await engine.reason(makeRequest({ mode: 'analysis' }));
    expect(conceptMemory.search).not.toHaveBeenCalled();
  });

  test('reason in research mode should include gaps and concepts', async () => {
    const knowledgeReasoner = { detectKnowledgeGaps: jest.fn().mockResolvedValue([{ type: 'orphan' }]) };
    const conceptMemory = { search: jest.fn().mockResolvedValue([{ name: 'c1' }]) };
    const engine = new ReasoningEngine({ knowledgeReasoner, conceptMemory, logger });
    const result = await engine.reason(makeRequest({ mode: 'research' }));
    expect(result.evidence).toContainEqual({ source: 'knowledge_gaps', items: 1 });
    expect(result.evidence).toContainEqual({ source: 'concept_memory', items: 1 });
    expect(result.conclusion).toBe('Research completed. 2 sources examined.');
    expect(result.confidence).toBe(0.6);
  });

  test('reason should tolerate semantic memory failure', async () => {
    const semanticMemory = { retrieve: jest.fn().mockRejectedValue(new Error('mem')) };
    const engine = new ReasoningEngine({ semanticMemory, logger });
    const result = await engine.reason(makeRequest());
    expect(result.evidence).toHaveLength(0);
    expect(logger.error).toHaveBeenCalled();
  });

  test('reason should tolerate graph analysis failure', async () => {
    const knowledgeReasoner = { analyzeGraph: jest.fn().mockRejectedValue(new Error('graph')) };
    const engine = new ReasoningEngine({ knowledgeReasoner, logger });
    const result = await engine.reason(makeRequest({ mode: 'analysis' }));
    expect(result.evidence).toHaveLength(0);
    expect(result.conclusion).toBe('Analysis completed. 0 evidence sources evaluated.');
  });

  test('reason should tolerate gap detection failure', async () => {
    const knowledgeReasoner = { detectKnowledgeGaps: jest.fn().mockRejectedValue(new Error('gaps')) };
    const engine = new ReasoningEngine({ knowledgeReasoner, logger });
    const result = await engine.reason(makeRequest({ mode: 'research' }));
    expect(result.evidence).toHaveLength(0);
    expect(logger.error).toHaveBeenCalled();
  });

  test('reason should tolerate concept search failure', async () => {
    const conceptMemory = { search: jest.fn().mockRejectedValue(new Error('concept')) };
    const engine = new ReasoningEngine({ conceptMemory, logger });
    const result = await engine.reason(makeRequest({ mode: 'research' }));
    expect(result.evidence).toHaveLength(0);
    expect(logger.error).toHaveBeenCalled();
  });
});
