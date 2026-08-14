const AgentMessage = require('../../src/collaboration/agentMessage.cjs');

describe('AgentMessage', () => {
  test('constructor should apply defaults', () => {
    const m = new AgentMessage({ from: 'a', to: 'b' });
    expect(m.from).toBe('a');
    expect(m.to).toBe('b');
    expect(m.type).toBe('notification');
    expect(m.payload).toEqual({});
    expect(m.priority).toBe(5);
    expect(m.threadId).toBe(m.id);
    expect(m.id).toMatch(/^amsg_/);
    expect(typeof m.createdAt).toBe('number');
  });

  test('constructor should require sender', () => {
    expect(() => new AgentMessage({ to: 'b' })).toThrow('sender (from)');
  });

  test('constructor should require receiver', () => {
    expect(() => new AgentMessage({ from: 'a' })).toThrow('receiver (to)');
  });

  test('constructor should preserve explicit fields', () => {
    const m = new AgentMessage({
      from: 'a',
      to: 'b',
      type: 'request',
      payload: { n: 1 },
      priority: 10,
      threadId: 'thread-1'
    });
    expect(m.type).toBe('request');
    expect(m.payload).toEqual({ n: 1 });
    expect(m.priority).toBe(10);
    expect(m.threadId).toBe('thread-1');
  });

  test('toJSON should return all fields', () => {
    const m = new AgentMessage({ from: 'a', to: 'b', type: 'proposal', payload: { x: 2 } });
    const json = m.toJSON();
    expect(json).toEqual({
      id: m.id,
      from: 'a',
      to: 'b',
      type: 'proposal',
      payload: { x: 2 },
      priority: 5,
      threadId: m.id,
      createdAt: m.createdAt
    });
  });

  test('fromJSON should restore fields', () => {
    const m = AgentMessage.fromJSON({
      id: 'amsg_x',
      from: 'a',
      to: 'b',
      type: 'response',
      payload: { ok: true },
      priority: 9,
      threadId: 't1',
      createdAt: 1234
    });
    expect(m.id).toBe('amsg_x');
    expect(m.from).toBe('a');
    expect(m.to).toBe('b');
    expect(m.type).toBe('response');
    expect(m.payload).toEqual({ ok: true });
    expect(m.priority).toBe(9);
    expect(m.threadId).toBe('t1');
    expect(m.createdAt).toBe(1234);
  });

  test('fromJSON should apply defaults for missing fields', () => {
    const m = AgentMessage.fromJSON({ from: 'a', to: 'b' });
    expect(m.from).toBe('a');
    expect(m.to).toBe('b');
    expect(m.payload).toEqual({});
    expect(m.priority).toBe(5);
    expect(typeof m.createdAt).toBe('number');
  });
});
