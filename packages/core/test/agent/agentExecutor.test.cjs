const AgentExecutor = require('../../src/agent/agentExecutor.cjs');
const AgentContext = require('../../src/agent/agentContext.cjs');

describe('AgentExecutor', () => {
  let logger;
  beforeEach(() => {
    logger = { log: jest.fn(), error: jest.fn() };
  });

  function makeCtx(overrides = {}) {
    return new AgentContext({ agent: { id: 'a1' }, logger, ...overrides });
  }

  test('unknown action returns skipped', async () => {
    const ex = new AgentExecutor({ logger });
    const res = await ex.execute({ action: 'dance', target: 'x' }, makeCtx());
    expect(res).toEqual({ action: 'dance', status: 'skipped', reason: 'unknown_action' });
    expect(logger.log).toHaveBeenCalledWith('[agent:exec] Unknown action: dance');
  });

  test('inspect returns completed', async () => {
    const ex = new AgentExecutor({ logger });
    const res = await ex.execute({ action: 'inspect', target: 'resource' }, makeCtx());
    expect(res).toEqual({ action: 'inspect', target: 'resource', status: 'completed', note: 'inspection performed' });
  });

  describe('analyze', () => {
    test('graph target with analyzer', async () => {
      const repository = {
        _getKnowledgeAnalyzer: jest.fn(async () => ({ report: jest.fn(async () => ({ ok: 1 })) })),
        getKnowledgeLifecycle: jest.fn(async () => ({})),
        getRecommendations: jest.fn(async () => [])
      };
      const ex = new AgentExecutor({ repository, logger });
      const ctx = makeCtx();
      const res = await ex.execute({ action: 'analyze', target: 'graph' }, ctx);
      expect(res.status).toBe('completed');
      expect(res.data).toEqual({ type: 'graph', report: { ok: 1 } });
      expect(ctx.observations[0].type).toBe('graph_analyzed');
      expect(repository._getKnowledgeAnalyzer).toHaveBeenCalled();
    });

    test('resources target', async () => {
      const repository = {
        _getKnowledgeAnalyzer: jest.fn(async () => null),
        getKnowledgeLifecycle: jest.fn(async () => ({ life: 1 })),
        getRecommendations: jest.fn(async () => [])
      };
      const ex = new AgentExecutor({ repository, logger });
      const ctx = makeCtx();
      const res = await ex.execute({ action: 'analyze', target: 'resources' }, ctx);
      expect(res.data).toEqual({ lifecycle: { life: 1 } });
      expect(ctx.observations[0].type).toBe('resources_analyzed');
    });

    test('recommendations target', async () => {
      const repository = {
        _getKnowledgeAnalyzer: jest.fn(async () => null),
        getKnowledgeLifecycle: jest.fn(async () => ({})),
        getRecommendations: jest.fn(async () => [{ r: 1 }])
      };
      const ex = new AgentExecutor({ repository, logger });
      const ctx = makeCtx();
      const res = await ex.execute({ action: 'analyze', target: 'recommendations' }, ctx);
      expect(res.data).toEqual({ recommendations: [{ r: 1 }] });
      expect(ctx.observations[0].type).toBe('recommendations_generated');
    });

    test('all target covers graph, resources, recommendations', async () => {
      const repository = {
        _getKnowledgeAnalyzer: jest.fn(async () => ({ report: jest.fn(async () => ({ r: 1 })) })),
        getKnowledgeLifecycle: jest.fn(async () => ({ l: 1 })),
        getRecommendations: jest.fn(async () => [{ s: 1 }])
      };
      const ex = new AgentExecutor({ repository, logger });
      const ctx = makeCtx();
      const res = await ex.execute({ action: 'analyze', target: 'all' }, ctx);
      expect(res.data).toEqual({
        type: 'graph', report: { r: 1 },
        lifecycle: { l: 1 },
        recommendations: [{ s: 1 }]
      });
      expect(ctx.observations).toHaveLength(3);
    });

    test('analyzer failure is swallowed', async () => {
      const repository = {
        _getKnowledgeAnalyzer: jest.fn(async () => { throw new Error('analyzer down'); }),
        getKnowledgeLifecycle: jest.fn(async () => ({})),
        getRecommendations: jest.fn(async () => [])
      };
      const ex = new AgentExecutor({ repository, logger });
      const res = await ex.execute({ action: 'analyze', target: 'graph' }, ctx => ctx);
      const ctx = makeCtx();
      const r2 = await ex.execute({ action: 'analyze', target: 'graph' }, ctx);
      expect(r2.status).toBe('completed');
      expect(logger.error).toHaveBeenCalledWith('agentExecutor: get knowledge analyzer failed', expect.any(Error));
      expect(res).toBeDefined();
    });

    test('non-listed target leaves data null', async () => {
      const repository = { _getKnowledgeAnalyzer: jest.fn(), getKnowledgeLifecycle: jest.fn(), getRecommendations: jest.fn() };
      const ex = new AgentExecutor({ repository, logger });
      const res = await ex.execute({ action: 'analyze', target: 'content' }, makeCtx());
      expect(res.status).toBe('completed');
      expect(res.data).toBeNull();
    });

    test('repository missing returns completed with null data', async () => {
      const ex = new AgentExecutor({ logger });
      const res = await ex.execute({ action: 'analyze', target: 'all' }, makeCtx());
      expect(res.status).toBe('completed');
      expect(res.data).toBeNull();
    });

    test('each target failure is isolated and logged', async () => {
      const repository = {
        _getKnowledgeAnalyzer: jest.fn(async () => { throw new Error('a'); }),
        getKnowledgeLifecycle: jest.fn(async () => { throw new Error('b'); }),
        getRecommendations: jest.fn(async () => { throw new Error('c'); })
      };
      const ex = new AgentExecutor({ repository, logger });
      const ctx = makeCtx();
      const res = await ex.execute({ action: 'analyze', target: 'all' }, ctx);
      expect(res.status).toBe('completed');
      expect(res.data).toBeNull();
      expect(logger.error).toHaveBeenCalledTimes(3);
    });
  });

  describe('workflow', () => {
    test('with getWorkflow returning workflow skips with state-machine reason', async () => {
      const workflowEngine = { getWorkflow: jest.fn(() => ({ id: 'wf' })) };
      const ex = new AgentExecutor({ workflowEngine, logger });
      const res = await ex.execute({ action: 'workflow', target: 'wf' }, makeCtx());
      expect(res.status).toBe('skipped');
      expect(res.reason).toContain('状态转换需通过 attach + transition');
      expect(res.workflowId).toBe('wf');
    });

    test('with getWorkflow returning null skips unavailable', async () => {
      const workflowEngine = { getWorkflow: jest.fn(() => null) };
      const ex = new AgentExecutor({ workflowEngine, logger });
      const res = await ex.execute({ action: 'workflow', target: 'wf' }, makeCtx());
      expect(res.status).toBe('skipped');
      expect(res.reason).toBe("Workflow 'wf' not available");
    });

    test('getWorkflow throws skips unavailable', async () => {
      const workflowEngine = { getWorkflow: jest.fn(() => { throw new Error('no'); }) };
      const ex = new AgentExecutor({ workflowEngine, logger });
      const res = await ex.execute({ action: 'workflow', target: 'wf' }, makeCtx());
      expect(res.status).toBe('skipped');
      expect(res.reason).toBe("Workflow 'wf' not available");
    });

    test('engine without getWorkflow skips unsupported', async () => {
      const workflowEngine = {};
      const ex = new AgentExecutor({ workflowEngine, logger });
      const res = await ex.execute({ action: 'workflow', target: 'wf' }, makeCtx());
      expect(res.status).toBe('skipped');
      expect(res.reason).toBe('workflow engine 不支持 execute');
    });

    test('no workflow engine skips', async () => {
      const ex = new AgentExecutor({ logger });
      const res = await ex.execute({ action: 'workflow', target: 'wf' }, makeCtx());
      expect(res.status).toBe('skipped');
      expect(res.reason).toBe('no workflow engine');
    });
  });

  describe('suggest', () => {
    test('with repository records suggestion count', async () => {
      const repository = { generateSuggestions: jest.fn(async () => [1, 2, 3]) };
      const ex = new AgentExecutor({ repository, logger });
      const ctx = makeCtx();
      const res = await ex.execute({ action: 'suggest', target: 'tag' }, ctx);
      expect(res.status).toBe('completed');
      expect(res.data).toEqual({ suggestionCount: 3 });
      expect(ctx.observations[0].type).toBe('suggestions_generated');
    });

    test('generateSuggestions error sets status error', async () => {
      const repository = { generateSuggestions: jest.fn(async () => { throw new Error('sug fail'); }) };
      const ex = new AgentExecutor({ repository, logger });
      const res = await ex.execute({ action: 'suggest', target: 'tag' }, makeCtx());
      expect(res.status).toBe('error');
      expect(res.error).toBe('sug fail');
    });

    test('without repository returns completed', async () => {
      const ex = new AgentExecutor({ logger });
      const res = await ex.execute({ action: 'suggest', target: 'tag' }, makeCtx());
      expect(res.status).toBe('completed');
      expect(res.data).toBeUndefined();
    });
  });

  describe('notify', () => {
    test('emits notification event', async () => {
      const eventBus = { emit: jest.fn(async () => {}) };
      const ex = new AgentExecutor({ eventBus, logger });
      const res = await ex.execute({ action: 'notify', target: 'hello' }, makeCtx());
      expect(res).toEqual({ action: 'notify', target: 'hello', status: 'sent' });
      expect(logger.log).toHaveBeenCalledWith('[agent:notify] hello');
      expect(eventBus.emit).toHaveBeenCalledWith({
        type: 'agent.notification',
        payload: { agent: 'a1', message: 'hello' },
        source: 'agent'
      });
    });

    test('emit failure is logged', async () => {
      const eventBus = { emit: jest.fn(async () => { throw new Error('bus down'); }) };
      const ex = new AgentExecutor({ eventBus, logger });
      const res = await ex.execute({ action: 'notify', target: 'hello' }, makeCtx());
      expect(res.status).toBe('sent');
      expect(logger.error).toHaveBeenCalledWith('agentExecutor: notification event emit failed', expect.any(Error));
    });

    test('without eventBus returns sent', async () => {
      const ex = new AgentExecutor({ logger });
      const res = await ex.execute({ action: 'notify' }, makeCtx());
      expect(res.status).toBe('sent');
      expect(logger.log).toHaveBeenCalled();
    });
  });

  test('executePlan runs all items in order', async () => {
    const ex = new AgentExecutor({ logger });
    const ctx = makeCtx();
    const results = await ex.executePlan([
      { action: 'inspect', target: 'r' },
      { action: 'notify', target: 'n' },
      { action: 'bogus', target: 'x' }
    ], ctx);
    expect(results).toHaveLength(3);
    expect(results.map(r => r.action)).toEqual(['inspect', 'notify', 'bogus']);
    expect(results[0].status).toBe('completed');
    expect(results[1].status).toBe('sent');
    expect(results[2].status).toBe('skipped');
  });
});
