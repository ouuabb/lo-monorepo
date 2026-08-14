const AgentContext = require('../../src/agent/agentContext.cjs');

describe('AgentContext', () => {
  test('constructor applies defaults', () => {
    const ctx = new AgentContext();
    expect(ctx.agent).toBeNull();
    expect(ctx.event).toBeNull();
    expect(ctx.resources).toEqual([]);
    expect(ctx.memory).toEqual([]);
    expect(ctx.workflowEngine).toBeNull();
    expect(ctx.permissionManager).toBeNull();
    expect(ctx.repository).toBeNull();
    expect(ctx.logger).toBe(console);
    expect(ctx.observations).toEqual([]);
    expect(ctx.decisions).toEqual([]);
  });

  test('constructor stores provided services', () => {
    const agent = { id: 'a1' };
    const logger = { log: jest.fn() };
    const ctx = new AgentContext({ agent, event: { type: 'evt' }, resources: [1], memory: [{ x: 1 }], logger });
    expect(ctx.agent).toBe(agent);
    expect(ctx.event).toEqual({ type: 'evt' });
    expect(ctx.resources).toEqual([1]);
    expect(ctx.memory).toEqual([{ x: 1 }]);
    expect(ctx.logger).toBe(logger);
  });

  test('observe records observation with timestamp', () => {
    const ctx = new AgentContext();
    ctx.observe('graph_analyzed', { count: 3 });
    expect(ctx.observations).toHaveLength(1);
    expect(ctx.observations[0].type).toBe('graph_analyzed');
    expect(ctx.observations[0].data).toEqual({ count: 3 });
    expect(ctx.observations[0].timestamp).toBeGreaterThan(0);
  });

  test('decide records decision with timestamp', () => {
    const ctx = new AgentContext();
    ctx.decide('select_goal', 'Goal: auto_tag');
    expect(ctx.decisions).toHaveLength(1);
    expect(ctx.decisions[0]).toMatchObject({ action: 'select_goal', reason: 'Goal: auto_tag' });
    expect(ctx.decisions[0].timestamp).toBeGreaterThan(0);
  });

  test('toJSON serializes agent id and event', () => {
    const ctx = new AgentContext({ agent: { id: 'a1' }, event: { type: 'resource.created' } });
    ctx.observe('x', 1);
    ctx.decide('y', 'z');
    const json = ctx.toJSON();
    expect(json.agent).toBe('a1');
    expect(json.event).toBe('resource.created');
    expect(json.observations).toHaveLength(1);
    expect(json.decisions).toHaveLength(1);
  });

  test('toJSON handles event as string', () => {
    const ctx = new AgentContext({ event: 'resource.updated' });
    expect(ctx.toJSON().event).toBe('resource.updated');
  });

  test('toJSON handles missing agent/event', () => {
    const ctx = new AgentContext();
    const json = ctx.toJSON();
    expect(json.agent).toBeNull();
    expect(json.event).toBeNull();
  });
});
