const Task = require('../../src/collaboration/task.cjs');

describe('Task', () => {
  test('constructor should apply defaults', () => {
    const t = new Task();
    expect(t.id).toMatch(/^task_/);
    expect(t.teamId).toBe('');
    expect(t.goal).toBe('');
    expect(t.status).toBe('created');
    expect(t.subtasks).toEqual([]);
    expect(t.result).toBeNull();
    expect(typeof t.createdAt).toBe('number');
  });

  test('constructor should preserve explicit options', () => {
    const t = new Task({ id: 'task-1', teamId: 'team-1', goal: 'research', subtasks: [{ id: 's1' }] });
    expect(t.id).toBe('task-1');
    expect(t.teamId).toBe('team-1');
    expect(t.goal).toBe('research');
    expect(t.subtasks).toEqual([{ id: 's1' }]);
  });

  test('addSubtask should generate id and defaults', () => {
    const t = new Task({ id: 'task-1', goal: 'g' });
    t.addSubtask({ goal: 'sub' });
    expect(t.subtasks).toHaveLength(1);
    expect(t.subtasks[0].id).toMatch(/^st_/);
    expect(t.subtasks[0].goal).toBe('sub');
    expect(t.subtasks[0].assignedAgent).toBeNull();
    expect(t.subtasks[0].status).toBe('created');
  });

  test('addSubtask should preserve explicit id and assignedAgent', () => {
    const t = new Task({ id: 'task-1' });
    t.addSubtask({ id: 's-x', goal: 'g', assignedAgent: 'agent-1' });
    expect(t.subtasks[0].id).toBe('s-x');
    expect(t.subtasks[0].assignedAgent).toBe('agent-1');
  });

  test('updateSubtaskStatus should update an existing subtask', () => {
    const t = new Task({ id: 'task-1' });
    t.addSubtask({ id: 's1', goal: 'g' });
    t.updateSubtaskStatus('s1', 'completed');
    expect(t.subtasks[0].status).toBe('completed');
  });

  test('updateSubtaskStatus should ignore unknown ids', () => {
    const t = new Task({ id: 'task-1' });
    t.addSubtask({ id: 's1', goal: 'g' });
    t.updateSubtaskStatus('missing', 'completed');
    expect(t.subtasks[0].status).toBe('created');
  });

  test('toJSON should count completed subtasks', () => {
    const t = new Task({ id: 'task-1', teamId: 'team-1', goal: 'g' });
    t.addSubtask({ id: 's1', goal: 'a' });
    t.addSubtask({ id: 's2', goal: 'b' });
    t.updateSubtaskStatus('s1', 'completed');
    t.status = 'running';
    t.result = { ok: true };
    const json = t.toJSON();
    expect(json).toEqual({
      id: 'task-1',
      teamId: 'team-1',
      goal: 'g',
      status: 'running',
      subtaskCount: 2,
      completedSubtasks: 1,
      result: { ok: true },
      createdAt: t.createdAt
    });
  });

  test('fromJSON should restore fields', () => {
    const t = Task.fromJSON({
      id: 'task-9',
      teamId: 'team-9',
      goal: 'g',
      subtasks: [{ id: 's1', goal: 'a', status: 'completed' }],
      status: 'completed',
      result: { n: 1 },
      createdAt: 123
    });
    expect(t.id).toBe('task-9');
    expect(t.teamId).toBe('team-9');
    expect(t.status).toBe('completed');
    expect(t.result).toEqual({ n: 1 });
    expect(t.createdAt).toBe(123);
    expect(t.subtasks).toEqual([{ id: 's1', goal: 'a', status: 'completed' }]);
  });

  test('fromJSON should apply defaults', () => {
    const t = Task.fromJSON({ goal: 'g' });
    expect(t.status).toBe('created');
    expect(t.result).toBeNull();
    expect(typeof t.createdAt).toBe('number');
  });
});
