const AgentCapability = require('../../src/agent/agentCapability.cjs');

describe('AgentCapability', () => {
  test('constructor applies defaults', () => {
    const c = new AgentCapability({ name: 'c1' });
    expect(c.name).toBe('c1');
    expect(c.description).toBe('');
    expect(c.category).toBe('general');
  });

  test('constructor keeps provided fields', () => {
    const c = new AgentCapability({ name: 'c1', description: 'd', category: 'graph' });
    expect(c.description).toBe('d');
    expect(c.category).toBe('graph');
  });

  test('toJSON returns fields', () => {
    const c = new AgentCapability({ name: 'c1', description: 'd', category: 'graph' });
    expect(c.toJSON()).toEqual({ name: 'c1', description: 'd', category: 'graph' });
  });

  test('builtins returns all builtin capabilities', () => {
    const list = AgentCapability.builtins();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toBeInstanceOf(AgentCapability);
    const names = list.map(c => c.name);
    expect(names).toContain('knowledge.analyze');
    expect(names).toContain('graph.query');
    expect(names).toContain('event.publish');
    for (const c of list) {
      expect(c.category).toBeTruthy();
    }
  });
});
