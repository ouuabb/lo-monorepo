const Agent = require('../../src/agent/agent.cjs');
const AgentRegistry = require('../../src/agent/agentRegistry.cjs');

function makeAgent(id, overrides = {}) {
  return new Agent({ id, ...overrides });
}

describe('AgentRegistry', () => {
  test('register adds and validates agent', () => {
    const r = new AgentRegistry();
    const a = makeAgent('a1');
    r.register(a);
    expect(r.count()).toBe(1);
    expect(r.get('a1')).toBe(a);
  });

  test('register rejects duplicate id', () => {
    const r = new AgentRegistry();
    r.register(makeAgent('a1'));
    expect(() => r.register(makeAgent('a1'))).toThrow("Agent 'a1' is already registered");
  });

  test('register rejects invalid agent type', () => {
    const r = new AgentRegistry();
    expect(() => r.register(makeAgent('a1', { type: 'robot' }))).toThrow('Invalid agent type: robot');
  });

  test('remove deletes agent', () => {
    const r = new AgentRegistry();
    r.register(makeAgent('a1'));
    r.remove('a1');
    expect(r.count()).toBe(0);
    expect(r.get('a1')).toBeNull();
  });

  test('get returns null for unknown id', () => {
    const r = new AgentRegistry();
    expect(r.get('nope')).toBeNull();
  });

  test('list returns summary objects', () => {
    const r = new AgentRegistry();
    r.register(makeAgent('a1', { name: 'One', type: 'observer', capabilities: ['graph.query'] }));
    const list = r.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'a1', name: 'One', type: 'observer',
      description: '', status: 'created', capabilityCount: 1
    });
  });

  test('list reflects status changes', () => {
    const r = new AgentRegistry();
    const a = makeAgent('a1');
    r.register(a);
    a.status = 'running';
    expect(r.list()[0].status).toBe('running');
  });

  test('getAllAgents returns instances', () => {
    const r = new AgentRegistry();
    const a = makeAgent('a1');
    r.register(a);
    expect(r.getAllAgents()).toEqual([a]);
  });

  test('count is zero initially', () => {
    const r = new AgentRegistry();
    expect(r.count()).toBe(0);
  });
});
