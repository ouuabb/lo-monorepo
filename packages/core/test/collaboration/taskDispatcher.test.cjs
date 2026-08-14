const Task = require('../../src/collaboration/task.cjs');
const TaskDispatcher = require('../../src/collaboration/taskDispatcher.cjs');

function makeTask() {
  const t = new Task({ id: 'task-1', teamId: 'team-1', goal: 'g' });
  t.addSubtask({ id: 's1', goal: 'a' });
  t.addSubtask({ id: 's2', goal: 'b' });
  t.addSubtask({ id: 's3', goal: 'c' });
  return t;
}

describe('TaskDispatcher', () => {
  test('dispatch should return task untouched when team has no members', async () => {
    const dispatcher = new TaskDispatcher();
    const task = makeTask();
    const result = await dispatcher.dispatch(task, { members: [], strategy: 'pipeline' });
    expect(result).toBe(task);
    expect(task.status).toBe('created');
  });

  test('pipeline should assign subtasks round-robin by order', async () => {
    const messageBus = { send: jest.fn() };
    const dispatcher = new TaskDispatcher({ messageBus });
    const task = makeTask();
    await dispatcher.dispatch(task, { members: ['a', 'b'], strategy: 'pipeline' });
    expect(task.subtasks.map(s => s.assignedAgent)).toEqual(['a', 'b', 'a']);
    expect(task.subtasks.map(s => s.status)).toEqual(['assigned', 'assigned', 'assigned']);
    expect(messageBus.send).toHaveBeenCalledTimes(3);
    expect(messageBus.send.mock.calls[0][0].to).toBe('a');
    expect(messageBus.send.mock.calls[0][0].type).toBe('request');
    expect(messageBus.send.mock.calls[0][0].payload.taskId).toBe('task-1');
    expect(task.status).toBe('assigned');
  });

  test('pipeline should assign without messageBus', async () => {
    const dispatcher = new TaskDispatcher();
    const task = makeTask();
    await dispatcher.dispatch(task, { members: ['a', 'b'], strategy: 'pipeline' });
    expect(task.subtasks[0].assignedAgent).toBe('a');
    expect(task.subtasks[2].assignedAgent).toBe('a');
  });

  test('supervisor should assign everything to supervisorId', async () => {
    const messageBus = { send: jest.fn() };
    const dispatcher = new TaskDispatcher({ messageBus });
    const task = makeTask();
    await dispatcher.dispatch(task, { members: ['a', 'b'], strategy: 'supervisor', supervisorId: 'a' });
    expect(task.subtasks.map(s => s.assignedAgent)).toEqual(['a', 'a', 'a']);
    expect(messageBus.send).toHaveBeenCalledTimes(1);
    expect(messageBus.send.mock.calls[0][0].to).toBe('a');
    expect(messageBus.send.mock.calls[0][0].payload.subtasks).toHaveLength(3);
  });

  test('supervisor should fall back to first member when no supervisorId', async () => {
    const messageBus = { send: jest.fn() };
    const dispatcher = new TaskDispatcher({ messageBus });
    const task = makeTask();
    await dispatcher.dispatch(task, { members: ['a', 'b'], strategy: 'supervisor' });
    expect(task.subtasks.map(s => s.assignedAgent)).toEqual(['a', 'a', 'a']);
    expect(messageBus.send.mock.calls[0][0].to).toBe('a');
  });

  test('debate should send each subtask to every member', async () => {
    const messageBus = { send: jest.fn() };
    const dispatcher = new TaskDispatcher({ messageBus });
    const task = makeTask();
    await dispatcher.dispatch(task, { members: ['a', 'b'], strategy: 'debate' });
    expect(messageBus.send).toHaveBeenCalledTimes(6);
    const targets = messageBus.send.mock.calls.map(c => c[0].to);
    expect(targets.filter(t => t === 'a')).toHaveLength(3);
    expect(targets.filter(t => t === 'b')).toHaveLength(3);
    expect(messageBus.send.mock.calls[0][0].payload.mode).toBe('debate');
  });

  test('broadcast should notify every member', async () => {
    const messageBus = { send: jest.fn() };
    const dispatcher = new TaskDispatcher({ messageBus });
    const task = makeTask();
    await dispatcher.dispatch(task, { members: ['a', 'b'], strategy: 'broadcast' });
    expect(messageBus.send).toHaveBeenCalledTimes(2);
    expect(messageBus.send.mock.calls[0][0].type).toBe('notification');
    expect(messageBus.send.mock.calls[0][0].payload.goal).toBe('g');
    expect(task.status).toBe('assigned');
  });

  test('default strategy should round-robin assign', async () => {
    const dispatcher = new TaskDispatcher();
    const task = makeTask();
    await dispatcher.dispatch(task, { members: ['a', 'b'], strategy: 'custom' });
    expect(task.subtasks.map(s => s.assignedAgent)).toEqual(['a', 'b', 'a']);
    expect(task.subtasks.map(s => s.status)).toEqual(['assigned', 'assigned', 'assigned']);
  });
});
