const AIGateway = require('../../src/ai/aiGateway.cjs');

describe('AIGateway', () => {
  function makeServices(overrides = {}) {
    return {
      reasoningEngine: {
        reason: jest.fn().mockResolvedValue({ thoughts: [], evidence: [], conclusion: 'ok', confidence: 0.8 })
      },
      planner: {
        plan: jest.fn().mockResolvedValue([{ action: 'notify_user', target: 'x' }])
      },
      executor: {
        execute: jest.fn().mockResolvedValue({ success: true, results: [{ action: 'notify_user', status: 'sent' }] })
      },
      learningEngine: {
        record: jest.fn().mockResolvedValue({})
      },
      eventBus: {
        emit: jest.fn().mockResolvedValue({})
      },
      logger: { error: jest.fn(), log: jest.fn() },
      ...overrides
    };
  }

  test('request should run the full pipeline and return AIResponse', async () => {
    const services = makeServices();
    const gateway = new AIGateway(services);
    const resp = await gateway.request('hello', { mode: 'chat', user: 'u' });

    expect(resp.content).toBe('ok');
    expect(resp.requestId).toMatch(/^aireq_/);
    expect(resp.actions).toHaveLength(1);
    expect(resp.confidence).toBe(0.8);
    expect(services.reasoningEngine.reason).toHaveBeenCalled();
    expect(services.planner.plan).toHaveBeenCalled();
    expect(services.executor.execute).toHaveBeenCalled();
    expect(services.learningEngine.record).toHaveBeenCalled();
  });

  test('request should emit lifecycle events', async () => {
    const services = makeServices();
    const gateway = new AIGateway(services);
    await gateway.request('hi', {});
    const types = services.eventBus.emit.mock.calls.map(c => c[0].type);
    expect(types).toEqual(['ai.request.created', 'ai.reasoning.completed', 'ai.plan.created', 'ai.action.executed']);
  });

  test('request should fall back when reasoning fails', async () => {
    const services = makeServices({
      reasoningEngine: { reason: jest.fn().mockRejectedValue(new Error('reason-fail')) }
    });
    const gateway = new AIGateway(services);
    const resp = await gateway.request('hi', {});
    expect(resp.content).toBe('Reasoning failed');
    expect(resp.reasoning.confidence).toBe(0);
    expect(resp.reasoning.thoughts[0]).toEqual({ step: 'error', content: 'reason-fail' });
  });

  test('request should fall back to empty plan when planner fails', async () => {
    const services = makeServices({
      planner: { plan: jest.fn().mockRejectedValue(new Error('plan-fail')) },
      executor: { execute: jest.fn().mockResolvedValue({ success: true, results: [] }) }
    });
    const gateway = new AIGateway(services);
    const resp = await gateway.request('hi', {});
    expect(resp.actions).toEqual([]);
    expect(services.executor.execute).toHaveBeenCalledWith([], expect.anything());
  });

  test('request should fall back when executor fails', async () => {
    const services = makeServices({
      executor: { execute: jest.fn().mockRejectedValue(new Error('exec-fail')) }
    });
    const gateway = new AIGateway(services);
    const resp = await gateway.request('hi', {});
    expect(resp.actions).toEqual([]);
  });

  test('request should tolerate eventBus emit failures', async () => {
    const services = makeServices({
      eventBus: { emit: jest.fn().mockRejectedValue(new Error('emit-fail')) }
    });
    const gateway = new AIGateway(services);
    const resp = await gateway.request('hi', {});
    expect(resp.content).toBe('ok');
  });

  test('request should tolerate learning engine failure', async () => {
    const services = makeServices({
      learningEngine: { record: jest.fn().mockRejectedValue(new Error('learn-fail')) }
    });
    const gateway = new AIGateway(services);
    const resp = await gateway.request('hi', {});
    expect(resp.content).toBe('ok');
  });

  test('request should work without learning engine and eventBus', async () => {
    const services = makeServices();
    const gateway = new AIGateway({
      reasoningEngine: services.reasoningEngine,
      planner: services.planner,
      executor: services.executor
    });
    const resp = await gateway.request('hi', {});
    expect(resp.content).toBe('ok');
  });

  test('chat should request with chat mode', async () => {
    const services = makeServices();
    const gateway = new AIGateway(services);
    await gateway.chat('q', { k: 1 });
    expect(services.reasoningEngine.reason.mock.calls[0][0].mode).toBe('chat');
    expect(services.reasoningEngine.reason.mock.calls[0][0].context).toEqual({ k: 1 });
  });

  test('analyze should request with analysis mode', async () => {
    const services = makeServices();
    const gateway = new AIGateway(services);
    await gateway.analyze('q', { k: 2 });
    expect(services.reasoningEngine.reason.mock.calls[0][0].mode).toBe('analysis');
  });

  test('research should request with research mode', async () => {
    const services = makeServices();
    const gateway = new AIGateway(services);
    await gateway.research('q', { k: 3 });
    expect(services.reasoningEngine.reason.mock.calls[0][0].mode).toBe('research');
  });
});
