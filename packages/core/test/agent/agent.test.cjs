const Agent = require('../../src/agent/agent.cjs');

describe('Agent', () => {
  test('constructor throws without id', () => {
    expect(() => new Agent()).toThrow('Agent must have an id');
    expect(() => new Agent({})).toThrow('Agent must have an id');
  });

  test('constructor applies defaults', () => {
    const a = new Agent({ id: 'a1' });
    expect(a.name).toBe('a1');
    expect(a.type).toBe('knowledge');
    expect(a.description).toBe('');
    expect(a.capabilities).toEqual([]);
    expect(a.triggers).toEqual([]);
    expect(a.status).toBe('created');
    expect(a.createdAt).toBeGreaterThan(0);
    expect(a.updatedAt).toBeGreaterThan(0);
  });

  test('constructor keeps provided fields', () => {
    const a = new Agent({
      id: 'a2',
      name: 'Watcher',
      type: 'observer',
      description: 'desc',
      capabilities: ['graph.query'],
      triggers: [{ type: 'event', event: 'resource.created' }]
    });
    expect(a.name).toBe('Watcher');
    expect(a.type).toBe('observer');
    expect(a.description).toBe('desc');
    expect(a.capabilities).toEqual(['graph.query']);
    expect(a.triggers).toHaveLength(1);
  });

  test('validate accepts all valid types', () => {
    for (const t of ['knowledge', 'assistant', 'observer', 'maintenance', 'research']) {
      const a = new Agent({ id: 'x', type: t });
      expect(() => a.validate()).not.toThrow();
    }
  });

  test('validate rejects invalid type', () => {
    const a = new Agent({ id: 'x', type: 'robot' });
    expect(() => a.validate()).toThrow('Invalid agent type: robot');
  });

  test('matchesEvent returns true only for matching event trigger', () => {
    const a = new Agent({
      id: 'x',
      triggers: [
        { type: 'event', event: 'resource.created' },
        { type: 'schedule', schedule: { cron: 'daily' } }
      ]
    });
    expect(a.matchesEvent('resource.created')).toBe(true);
    expect(a.matchesEvent('resource.updated')).toBe(false);
  });

  test('matchesEvent returns false when no event triggers', () => {
    const a = new Agent({ id: 'x' });
    expect(a.matchesEvent('anything')).toBe(false);
  });

  test('scheduleTrigger getter returns schedule trigger or null', () => {
    const a = new Agent({
      id: 'x',
      triggers: [{ type: 'schedule', schedule: { cron: 'daily' } }]
    });
    expect(a.scheduleTrigger).toEqual({ type: 'schedule', schedule: { cron: 'daily' } });

    const b = new Agent({ id: 'y' });
    expect(b.scheduleTrigger).toBeNull();
  });

  test('toJSON returns all fields', () => {
    const a = new Agent({ id: 'a1', name: 'N', type: 'research', capabilities: ['c'] });
    const json = a.toJSON();
    expect(json).toMatchObject({
      id: 'a1', name: 'N', type: 'research', capabilities: ['c'],
      triggers: [], status: 'created'
    });
    expect(json.createdAt).toBeDefined();
  });

  test('fromJSON reconstructs agent and restores timestamps/status', () => {
    const json = {
      id: 'a1', name: 'N', type: 'maintenance', description: 'd',
      capabilities: ['x'], triggers: [], status: 'running',
      createdAt: 100, updatedAt: 200
    };
    const a = Agent.fromJSON(json);
    expect(a).toBeInstanceOf(Agent);
    expect(a.id).toBe('a1');
    expect(a.status).toBe('running');
    expect(a.createdAt).toBe(100);
    expect(a.updatedAt).toBe(200);
  });

  test('fromJSON defaults status and timestamps', () => {
    const a = Agent.fromJSON({ id: 'a1' });
    expect(a.status).toBe('created');
    expect(a.createdAt).toBeGreaterThan(0);
    expect(a.updatedAt).toBeGreaterThan(0);
  });
});
