const Agent = require('../../src/agent/agent.cjs');
const AgentRuntime = require('../../src/agent/agentRuntime.cjs');

function makeAgent(id, overrides = {}) {
  return new Agent({ id, ...overrides });
}

describe('AgentRuntime', () => {
  let executor, logger, memory, store, agent, runtime;

  function build(agentOpts = {}, services = {}) {
    agent = makeAgent(agentOpts.id || 'a1', agentOpts);
    agent.status = agentOpts.status || 'created';
    executor = {
      executePlan: jest.fn(async () => [{ action: 'inspect', status: 'completed' }])
    };
    logger = { log: jest.fn(), error: jest.fn() };
    memory = {
      save: jest.fn(async () => ({ id: 'm1' })),
      getRecent: jest.fn(async () => [{ id: 'mem1' }])
    };
    store = {
      saveRun: jest.fn(async () => {}),
      listRuns: jest.fn(async () => [])
    };
    runtime = new AgentRuntime({
      agent,
      executor,
      memory,
      store,
      repository: null,
      workflowEngine: null,
      eventBus: services.eventBus || null,
      logger
    });
    return runtime;
  }

  test('initialize transitions to initialized', async () => {
    build();
    const res = await runtime.initialize();
    expect(res).toBe(agent);
    expect(agent.status).toBe('initialized');
    expect(runtime.state.current).toBe('initialized');
    expect(memory.save).toHaveBeenCalledWith({
      agentId: 'a1',
      type: 'decision',
      content: { decision: 'initialize', reason: 'Agent activated' }
    });
  });

  test('initialize throws when transition not allowed', async () => {
    build();
    runtime.state.transition('initialized');
    await expect(runtime.initialize()).rejects.toThrow('Cannot transition from');
  });

  test('run executes full lifecycle and returns result', async () => {
    build({ status: 'initialized', triggers: [{ type: 'event', event: 'resource.created' }] });
    const res = await runtime.run({ event: { type: 'resource.created' }, goal: 'auto_tag' });
    expect(res.agentId).toBe('a1');
    expect(res.goal).toBe('auto_tag');
    expect(res.result.success).toBe(true);
    expect(res.plan).toEqual(['inspect', 'analyze', 'suggest']);
    expect(executor.executePlan).toHaveBeenCalled();
    expect(store.saveRun).toHaveBeenCalled();
    expect(runtime.state.current).toBe('waiting');
  });

  test('run without options infers generic goal', async () => {
    build();
    const res = await runtime.run();
    expect(res.goal).toBe('generic_analyze');
  });

  test('run infers goal from maintenance type', async () => {
    build({ type: 'maintenance' });
    const res = await runtime.run();
    expect(res.goal).toBe('cleanup_forgotten');
  });

  test('run infers goal from research type', async () => {
    build({ type: 'research' });
    const res = await runtime.run();
    expect(res.goal).toBe('expand_knowledge');
  });

  test('run infers goal from assistant type', async () => {
    build({ type: 'assistant' });
    const res = await runtime.run();
    expect(res.goal).toBe('auto_tag');
  });

  test('run infers goal from resource.created event', async () => {
    build();
    const res = await runtime.run({ event: { type: 'resource.created' } });
    expect(res.goal).toBe('auto_tag');
  });

  test('run infers review_graph from sync event', async () => {
    build();
    const res = await runtime.run({ event: { type: 'sync.completed' } });
    expect(res.goal).toBe('review_graph');
  });

  test('run emits started and finished events', async () => {
    const eventBus = { emit: jest.fn(async () => {}) };
    build({}, { eventBus });
    await runtime.run({ goal: 'auto_tag' });
    expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent.started', source: 'agent' }));
    expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent.finished', source: 'agent' }));
  });

  test('run logs event emit failures', async () => {
    const eventBus = { emit: jest.fn(async () => { throw new Error('bus'); }) };
    build({}, { eventBus });
    const res = await runtime.run();
    expect(res.result.success).toBe(true);
    expect(logger.error).toHaveBeenCalledWith('agentRuntime: agent started event emit failed', expect.any(Error));
    expect(logger.error).toHaveBeenCalledWith('agentRuntime: agent finished event emit failed', expect.any(Error));
  });

  test('run captures execution errors', async () => {
    build();
    executor.executePlan = jest.fn(async () => { throw new Error('plan boom'); });
    const res = await runtime.run();
    expect(res.result.success).toBe(false);
    expect(res.result.error).toBe('plan boom');
    expect(res.context.decisions.some(d => d.action === 'execution_error')).toBe(true);
    expect(store.saveRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  test('run without memory/store still works', async () => {
    agent = makeAgent('a1');
    executor = { executePlan: jest.fn(async () => []) };
    logger = { log: jest.fn(), error: jest.fn() };
    runtime = new AgentRuntime({ agent, executor, memory: null, store: null, logger });
    const res = await runtime.run({ goal: 'generic_analyze' });
    expect(res.result.success).toBe(true);
  });

  test('run works when agent starts from initialized state', async () => {
    build({ status: 'initialized' });
    const res = await runtime.run();
    expect(res.result.success).toBe(true);
    expect(runtime.state.current).toBe('waiting');
  });

  test('run throws when agent is disabled and cannot initialize', async () => {
    build({ status: 'disabled' });
    await expect(runtime.run()).rejects.toThrow('Cannot transition');
  });

  test('stop disables agent and records decision', async () => {
    build({ status: 'initialized' });
    await runtime.stop();
    expect(agent.status).toBe('disabled');
    expect(runtime.state.current).toBe('disabled');
    expect(memory.save).toHaveBeenCalledWith({
      agentId: 'a1',
      type: 'decision',
      content: { decision: 'stop', reason: 'Agent disabled' }
    });
  });

  test('stop without memory still disables', async () => {
    agent = makeAgent('a1');
    runtime = new AgentRuntime({ agent, executor: {}, memory: null, logger: { log: jest.fn() } });
    await runtime.stop();
    expect(agent.status).toBe('disabled');
  });

  test('run passes event context and observes event trigger', async () => {
    build();
    const res = await runtime.run({ event: { type: 'resource.updated', payload: { id: 1 } } });
    const obs = res.context.observations.find(o => o.type === 'event_triggered');
    expect(obs).toBeDefined();
    expect(obs.data).toEqual({ type: 'resource.updated', payload: { id: 1 } });
  });

  test('run auto-initializes a created agent', async () => {
    build();
    const res = await runtime.run({ goal: 'auto_tag' });
    expect(res.result.success).toBe(true);
    expect(runtime.state.current).toBe('initialized');
  });
});
