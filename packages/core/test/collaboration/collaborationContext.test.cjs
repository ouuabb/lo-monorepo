const CollaborationContext = require('../../src/collaboration/collaborationContext.cjs');

describe('CollaborationContext', () => {
  test('constructor should apply defaults', () => {
    const ctx = new CollaborationContext();
    expect(ctx.team).toBeNull();
    expect(ctx.task).toBeNull();
    expect(ctx.agents).toEqual([]);
    expect(ctx.sharedMemory).toBeNull();
    expect(ctx.messageBus).toBeNull();
    expect(ctx.results).toEqual([]);
  });

  test('constructor should accept options', () => {
    const team = { id: 't1' };
    const task = { id: 'task-1' };
    const ctx = new CollaborationContext({
      team,
      task,
      agents: ['a', 'b'],
      sharedMemory: { read: jest.fn() },
      messageBus: { send: jest.fn() }
    });
    expect(ctx.team).toBe(team);
    expect(ctx.task).toBe(task);
    expect(ctx.agents).toEqual(['a', 'b']);
    expect(ctx.sharedMemory).toHaveProperty('read');
    expect(ctx.messageBus).toHaveProperty('send');
  });

  test('addResult should append an entry with timestamp', () => {
    const ctx = new CollaborationContext();
    ctx.addResult('agent-1', { ok: true });
    expect(ctx.results).toHaveLength(1);
    expect(ctx.results[0].agentId).toBe('agent-1');
    expect(ctx.results[0].data).toEqual({ ok: true });
    expect(typeof ctx.results[0].timestamp).toBe('number');
  });

  test('toJSON should summarize state', () => {
    const ctx = new CollaborationContext({ team: { id: 't1' }, task: { id: 'task-1' }, agents: ['a', 'b', 'c'] });
    ctx.addResult('a', {});
    ctx.addResult('b', {});
    const json = ctx.toJSON();
    expect(json).toEqual({
      team: 't1',
      task: 'task-1',
      agentCount: 3,
      resultCount: 2
    });
  });

  test('toJSON should handle missing team and task', () => {
    const ctx = new CollaborationContext();
    expect(ctx.toJSON()).toEqual({
      team: null,
      task: null,
      agentCount: 0,
      resultCount: 0
    });
  });
});
