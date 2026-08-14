const KnowledgeAssistant = require('../../src/ai/knowledgeAssistant.cjs');

describe('KnowledgeAssistant', () => {
  function makeServices() {
    return {
      reasoningEngine: {},
      planner: {},
      executor: {},
      semanticMemory: {
        save: jest.fn().mockResolvedValue({}),
        stats: jest.fn().mockResolvedValue({ entryCount: 2, byType: { experience: 2, pattern: 1 } })
      },
      conceptMemory: {
        save: jest.fn().mockResolvedValue({}),
        stats: jest.fn().mockResolvedValue({ conceptCount: 4 })
      },
      eventBus: { on: jest.fn(), emit: jest.fn() },
      logger: { log: jest.fn(), error: jest.fn() }
    };
  }

  test('constructor should register event listeners', () => {
    const services = makeServices();
    new KnowledgeAssistant(services);
    expect(services.eventBus.on).toHaveBeenCalledWith('resource.created', expect.any(Function));
    expect(services.eventBus.on).toHaveBeenCalledWith('resource.updated', expect.any(Function));
    expect(services.eventBus.on).toHaveBeenCalledWith('relation.created', expect.any(Function));
    expect(services.eventBus.on).toHaveBeenCalledWith('WorkflowTransitionCompleted', expect.any(Function));
    expect(services.eventBus.on).toHaveBeenCalledWith('agent.completed', expect.any(Function));
  });

  test('constructor should work without eventBus', () => {
    const assistant = new KnowledgeAssistant({ logger: console });
    expect(assistant.eventBus).toBeNull();
  });

  test('_onResourceCreated should save concept and experience', async () => {
    const services = makeServices();
    const assistant = new KnowledgeAssistant(services);
    await assistant._onResourceCreated({ title: 'Doc A', content: 'long content here', rid: 'r1' }, {});
    expect(services.logger.log).toHaveBeenCalledWith('[assistant] Resource created: Doc A');
    expect(services.conceptMemory.save).toHaveBeenCalledWith({ name: 'Doc A', meaning: 'long content here', confidence: 0.5 });
    expect(services.semanticMemory.save).toHaveBeenCalledWith({
      type: 'experience',
      concept: 'Doc A',
      value: 'Resource created: Doc A',
      confidence: 0.5
    });
  });

  test('_onResourceCreated should use rid when title missing', async () => {
    const services = makeServices();
    const assistant = new KnowledgeAssistant(services);
    await assistant._onResourceCreated({ rid: 'r1', content: 'c' }, {});
    expect(services.conceptMemory.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'r1' }));
  });

  test('_onResourceCreated should not save concept for unknown title', async () => {
    const services = makeServices();
    const assistant = new KnowledgeAssistant(services);
    await assistant._onResourceCreated({}, {});
    expect(services.conceptMemory.save).not.toHaveBeenCalled();
    expect(services.semanticMemory.save).toHaveBeenCalledWith(expect.objectContaining({ concept: 'unknown' }));
  });

  test('_onResourceUpdated should save an experience', async () => {
    const services = makeServices();
    const assistant = new KnowledgeAssistant(services);
    await assistant._onResourceUpdated({ title: 'Doc B' }, {});
    expect(services.logger.log).toHaveBeenCalledWith('[assistant] Resource updated: Doc B');
    expect(services.semanticMemory.save).toHaveBeenCalledWith(expect.objectContaining({ concept: 'Doc B', confidence: 0.3 }));
  });

  test('_onResourceUpdated should tolerate empty payload', async () => {
    const services = makeServices();
    const assistant = new KnowledgeAssistant(services);
    await assistant._onResourceUpdated(null, {});
    expect(services.semanticMemory.save).toHaveBeenCalled();
  });

  test('_onRelationCreated should save a pattern', async () => {
    const services = makeServices();
    const assistant = new KnowledgeAssistant(services);
    await assistant._onRelationCreated({ from: 'a', to: 'b', type: 'related' }, {});
    expect(services.logger.log).toHaveBeenCalledWith('[assistant] Relation created: a → b');
    expect(services.semanticMemory.save).toHaveBeenCalledWith({
      type: 'pattern',
      concept: 'a → b',
      value: 'User created relation',
      confidence: 0.4,
      tags: ['related']
    });
  });

  test('_onWorkflowFinished should log workflow id', async () => {
    const services = makeServices();
    const assistant = new KnowledgeAssistant(services);
    await assistant._onWorkflowFinished({ workflowId: 'wf1' });
    expect(services.logger.log).toHaveBeenCalledWith('[assistant] Workflow finished: wf1');
  });

  test('_onWorkflowFinished should handle missing payload', async () => {
    const services = makeServices();
    const assistant = new KnowledgeAssistant(services);
    await assistant._onWorkflowFinished(null);
    expect(services.logger.log).toHaveBeenCalledWith('[assistant] Workflow finished: ?');
  });

  test('_onAgentCompleted should log agent id', async () => {
    const services = makeServices();
    const assistant = new KnowledgeAssistant(services);
    await assistant._onAgentCompleted({ agentId: 'ag1' });
    expect(services.logger.log).toHaveBeenCalledWith('[assistant] Agent completed: ag1');
  });

  test('generateInsights should combine concept and memory insights', async () => {
    const services = makeServices();
    const assistant = new KnowledgeAssistant(services);
    const insights = await assistant.generateInsights();
    expect(insights).toContainEqual({ type: 'concept', content: '4 concepts learned', confidence: 1.0 });
    expect(insights).toContainEqual({ type: 'memory', content: '2 experience experiences recorded', confidence: 0.8 });
    expect(insights).toContainEqual({ type: 'memory', content: '1 pattern experiences recorded', confidence: 0.8 });
  });

  test('generateInsights should return empty when no memories', async () => {
    const assistant = new KnowledgeAssistant({ logger: console });
    expect(await assistant.generateInsights()).toEqual([]);
  });
});
