const ResourceRuntime = require('../../src/runtime/resourceRuntime.cjs');

describe('ResourceRuntime', () => {
  test('constructor applies defaults', () => {
    const r = new ResourceRuntime();
    expect(r.rid).toBe('');
    expect(r.type).toBe('unknown');
    expect(r.metadata).toEqual({});
    expect(r.state).toBe('created');
    expect(r.id).toBe('');
    expect(r.recentEvents).toEqual([]);
  });

  test('constructor accepts options', () => {
    const r = new ResourceRuntime({ rid: 'r1', type: 'note', metadata: { x: 1 }, state: 'indexed', createdAt: 10, updatedAt: 20 });
    expect(r.rid).toBe('r1');
    expect(r.type).toBe('note');
    expect(r.metadata).toEqual({ x: 1 });
    expect(r.state).toBe('indexed');
    expect(r.id).toBe('r1');
    expect(r.toJSON().createdAt).toBe(10);
    expect(r.toJSON().updatedAt).toBe(20);
  });

  test('transition moves forward through the lifecycle', () => {
    const r = new ResourceRuntime({ rid: 'r1' });
    r.transition('indexed');
    r.transition('linked');
    r.transition('analyzed');
    r.transition('evolved');
    expect(r.state).toBe('evolved');
    expect(r.recentEvents.filter(e => e.type === 'state_change')).toHaveLength(4);
  });

  test('transition to the same state is allowed', () => {
    const r = new ResourceRuntime({ rid: 'r1' });
    r.transition('created');
    expect(r.state).toBe('created');
  });

  test('transition ignores backward moves', () => {
    const r = new ResourceRuntime({ rid: 'r1', state: 'analyzed' });
    r.transition('indexed');
    expect(r.state).toBe('analyzed');
  });

  test('transition throws for invalid target state', () => {
    const r = new ResourceRuntime({ rid: 'r1' });
    expect(() => r.transition('bogus')).toThrow('Invalid state: bogus');
  });

  test('convenience lifecycle methods advance state', () => {
    const r = new ResourceRuntime({ rid: 'r1' });
    r.indexed();
    expect(r.state).toBe('indexed');
    r.linked();
    expect(r.state).toBe('linked');
    r.analyzed();
    expect(r.state).toBe('analyzed');
    r.evolved();
    expect(r.state).toBe('evolved');
  });

  test('convenience methods chain', () => {
    const r = new ResourceRuntime({ rid: 'r1' });
    expect(r.indexed()).toBe(r);
    expect(r.linked()).toBe(r);
  });

  test('registerBehavior and executeBehavior call the handler with args', async () => {
    const r = new ResourceRuntime({ rid: 'r1' });
    const fn = jest.fn((res, ...args) => args.join('-'));
    r.registerBehavior('summarize', fn);
    const result = await r.executeBehavior('summarize', 'a', 'b');
    expect(result).toBe('a-b');
    expect(fn).toHaveBeenCalledWith(r, 'a', 'b');
    expect(r.recentEvents.some(e => e.type === 'behavior_executed')).toBe(true);
  });

  test('executeBehavior throws for unknown behavior', async () => {
    const r = new ResourceRuntime({ rid: 'r1' });
    await expect(r.executeBehavior('nope')).rejects.toThrow('Unknown behavior: nope');
  });

  test('recentEvents caps at 20 entries', async () => {
    const r = new ResourceRuntime({ rid: 'r1' });
    r.registerBehavior('b', () => {});
    for (let i = 0; i < 25; i++) {
      await r.executeBehavior('b');
    }
    expect(r.recentEvents).toHaveLength(20);
    expect(r.toJSON().events).toBe(25);
  });

  test('toJSON exposes shape', () => {
    const r = new ResourceRuntime({ rid: 'r1', type: 'note', metadata: { a: 1 } });
    r.registerBehavior('b', () => {});
    r.indexed();
    const json = r.toJSON();
    expect(json).toEqual(expect.objectContaining({
      rid: 'r1',
      type: 'note',
      state: 'indexed',
      events: 1,
      behaviors: ['b']
    }));
    expect(json.createdAt).toBeTruthy();
    expect(json.updatedAt).toBeTruthy();
  });
});
