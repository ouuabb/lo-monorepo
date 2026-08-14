const path = require('path');
const Database = require('../../src/repo/database.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const Agent = require('../../src/agent/agent.cjs');
const AgentEngine = require('../../src/agent/agentEngine.cjs');
const testUtils = global.testUtils;

function makeAgent(id, overrides = {}) {
  return new Agent({ id, ...overrides });
}

describe('AgentEngine', () => {
  let tempDir, db, registry, store, engine, logger;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));

    registry = {
      register: jest.fn(),
      get: jest.fn(),
      list: jest.fn()
    };
    store = {
      db,
      saveAgent: jest.fn(async () => {}),
      listRuns: jest.fn(async () => []),
      saveRun: jest.fn(async () => {})
    };
    logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
    engine = new AgentEngine({ registry, store, repository: null, workflowEngine: null, eventBus: null, logger });
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('constructor wires eventBus wildcard listener', () => {
    const eventBus = { on: jest.fn() };
    new AgentEngine({ registry, store, eventBus });
    expect(eventBus.on).toHaveBeenCalledWith('*', expect.any(Function));
  });

  test('register persists agent', async () => {
    const a = makeAgent('a1');
    await engine.register(a);
    expect(registry.register).toHaveBeenCalledWith(a);
    expect(store.saveAgent).toHaveBeenCalledWith(a);
  });

  test('start initializes runtime and persists', async () => {
    const a = makeAgent('a1');
    registry.get.mockReturnValue(a);
    const returned = await engine.start('a1');
    expect(returned).toBe(a);
    expect(a.status).toBe('initialized');
    expect(store.saveAgent).toHaveBeenCalledWith(a);
    expect(engine._runtimes.has('a1')).toBe(true);
    expect(logger.log).toHaveBeenCalledWith("[agent:engine] Agent 'a1' started");
  });

  test('start throws when agent missing', async () => {
    registry.get.mockReturnValue(null);
    await expect(engine.start('nope')).rejects.toThrow("Agent 'nope' not found");
  });

  test('stop stops runtime and disables agent', async () => {
    const a = makeAgent('a1');
    registry.get.mockReturnValue(a);
    await engine.start('a1');
    const runtime = engine._runtimes.get('a1');
    const stopSpy = jest.spyOn(runtime, 'stop').mockImplementation(async () => {});
    await engine.stop('a1');
    expect(stopSpy).toHaveBeenCalled();
    expect(engine._runtimes.has('a1')).toBe(false);
    expect(a.status).toBe('disabled');
    expect(logger.log).toHaveBeenCalledWith("[agent:engine] Agent 'a1' stopped");
  });

  test('stop for unknown id just logs', async () => {
    registry.get.mockReturnValue(null);
    await engine.stop('ghost');
    expect(logger.log).toHaveBeenCalledWith("[agent:engine] Agent 'ghost' stopped");
  });

  test('execute runs an agent runtime', async () => {
    const a = makeAgent('a1');
    registry.get.mockReturnValue(a);
    engine._executor.executePlan = jest.fn(async () => []);
    const res = await engine.execute('a1', { goal: 'auto_tag' });
    expect(res.agentId).toBe('a1');
    expect(res.result.success).toBe(true);
    expect(engine._runtimes.has('a1')).toBe(true);
  });

  test('execute throws when agent missing', async () => {
    registry.get.mockReturnValue(null);
    await expect(engine.execute('nope')).rejects.toThrow("Agent 'nope' not found");
  });

  test('execute reuses existing runtime', async () => {
    const a = makeAgent('a1');
    registry.get.mockReturnValue(a);
    engine._executor.executePlan = jest.fn(async () => []);
    await engine.execute('a1');
    const first = engine._runtimes.get('a1');
    await engine.execute('a1');
    expect(engine._runtimes.get('a1')).toBe(first);
  });

  test('trigger executes matching active agents', async () => {
    const a = makeAgent('a1', { triggers: [{ type: 'event', event: 'resource.created' }] });
    a.status = 'running';
    registry.list.mockReturnValue([{ id: 'a1', status: 'running' }]);
    registry.get.mockReturnValue(a);
    engine._executor.executePlan = jest.fn(async () => []);
    await engine.trigger({ type: 'resource.created' });
    expect(engine._executor.executePlan).toHaveBeenCalled();
  });

  test('trigger skips non-active and non-matching agents', async () => {
    const inactive = makeAgent('a1', { triggers: [{ type: 'event', event: 'resource.created' }] });
    inactive.status = 'disabled';
    registry.list.mockReturnValue([
      { id: 'a1', status: 'disabled' },
      { id: 'a2', status: 'running' }
    ]);
    registry.get.mockImplementation(id => {
      if (id === 'a1') return inactive;
      return makeAgent('a2');
    });
    engine._executor.executePlan = jest.fn(async () => []);
    await engine.trigger({ type: 'resource.created' });
    expect(engine._executor.executePlan).not.toHaveBeenCalled();
  });

  test('trigger catches execution errors per agent', async () => {
    const a = makeAgent('a1', { triggers: [{ type: 'event', event: 'evt' }] });
    a.status = 'running';
    registry.list.mockReturnValue([{ id: 'a1', status: 'running' }]);
    registry.get.mockReturnValue(a);
    engine.execute = jest.fn(async () => { throw new Error('exec boom'); });
    await engine.trigger({ type: 'evt' });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Triggered agent'));
  });

  test('trigger handles event passed as string', async () => {
    const a = makeAgent('a1', { triggers: [{ type: 'event', event: 'evt' }] });
    a.status = 'running';
    registry.list.mockReturnValue([{ id: 'a1', status: 'running' }]);
    registry.get.mockReturnValue(a);
    engine._executor.executePlan = jest.fn(async () => []);
    await engine.trigger('evt');
    expect(engine._executor.executePlan).toHaveBeenCalled();
  });

  test('listAgents delegates to registry', () => {
    registry.list.mockReturnValue([{ id: 'a1' }]);
    expect(engine.listAgents()).toEqual([{ id: 'a1' }]);
  });

  test('getRuns delegates to store', async () => {
    store.listRuns.mockResolvedValue([{ id: 'r1' }]);
    expect(await engine.getRuns('a1', 5)).toEqual([{ id: 'r1' }]);
    expect(store.listRuns).toHaveBeenCalledWith('a1', 5);
  });

  test('getMemory returns recent memory', async () => {
    const res = await engine.getMemory('a1', 3);
    expect(Array.isArray(res)).toBe(true);
  });

  test('_eventToGoal maps known and default events', () => {
    expect(engine._eventToGoal('resource.created')).toBe('auto_tag');
    expect(engine._eventToGoal('sync.completed')).toBe('review_graph');
    expect(engine._eventToGoal('ai.suggestion.created')).toBe('expand_knowledge');
    expect(engine._eventToGoal('mystery.event')).toBe('generic_analyze');
  });

  test('_onEvent triggers and logs handler errors', async () => {
    engine.trigger = jest.fn(async () => { throw new Error('trigger fail'); });
    await engine._onEvent({ type: 'x' }, { type: 'x' });
    await new Promise(r => setTimeout(r, 0));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Event handler error'));
  });

  test('full register-start-execute flow persists run', async () => {
    const a = makeAgent('a1');
    registry.register = jest.fn();
    registry.get.mockReturnValue(a);
    registry.list.mockReturnValue([]);
    await engine.register(a);
    await engine.start('a1');
    engine._executor.executePlan = jest.fn(async () => [{ action: 'inspect', status: 'completed' }]);
    const res = await engine.execute('a1', { goal: 'auto_tag' });
    expect(res.result.success).toBe(true);
    expect(store.saveAgent).toHaveBeenCalled();
    expect(store.saveRun).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'a1', status: 'completed' }));
  });
});
