const TaskPlanner = require('../../src/collaboration/taskPlanner.cjs');

describe('TaskPlanner', () => {
  test('should match template by dashed goal', () => {
    const planner = new TaskPlanner();
    const team = { id: 'team-1' };
    const task = planner.plan({ goal: 'knowledge research', team });
    expect(task.teamId).toBe('team-1');
    expect(task.subtasks.map(s => s.goal)).toEqual(['收集相关概念', '分析知识结构', '生成学习路径']);
    expect(task.status).toBe('planning');
  });

  test('should match template by underscored goal', () => {
    const planner = new TaskPlanner();
    const task = planner.plan({ goal: 'graph_build' });
    expect(task.subtasks.map(s => s.goal)).toEqual(['收集资源', '建立关系', '分析完整性']);
  });

  test('should match review template', () => {
    const planner = new TaskPlanner();
    const task = planner.plan({ goal: 'knowledge_review' });
    expect(task.subtasks.map(s => s.goal)).toEqual(['扫描知识状态', '检测问题', '生成修复建议']);
  });

  test('should fall back to single task when no template matches', () => {
    const planner = new TaskPlanner();
    const task = planner.plan({ goal: 'build a website' });
    expect(task.subtasks).toHaveLength(1);
    expect(task.subtasks[0].goal).toBe('build a website');
    expect(task.status).toBe('planning');
  });

  test('should handle undefined team', () => {
    const planner = new TaskPlanner();
    const task = planner.plan({ goal: 'completely unique no match goal' });
    expect(task.teamId).toBe('');
    expect(task.subtasks).toHaveLength(1);
    expect(task.subtasks[0].goal).toBe('completely unique no match goal');
  });

  test('plan should return a Task instance', () => {
    const planner = new TaskPlanner();
    const task = planner.plan({ goal: 'x' });
    expect(task).toHaveProperty('addSubtask');
    expect(task.status).toBe('planning');
  });
});
