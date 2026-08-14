/**
 * TaskPlanner — 任务计划器
 *
 * Phase 6.6: 将大目标拆解为子任务。
 */

const Task = require('./task.cjs');

class TaskPlanner {
  constructor() {
    this._templates = new Map();
    this._registerBuiltins();
  }

  _registerBuiltins() {
    // 知识研究
    this._templates.set('knowledge_research', [
      { goal: '收集相关概念', target: 'research' },
      { goal: '分析知识结构', target: 'analysis' },
      { goal: '生成学习路径', target: 'output' }
    ]);
    // 知识审查
    this._templates.set('knowledge_review', [
      { goal: '扫描知识状态', target: 'scan' },
      { goal: '检测问题', target: 'detect' },
      { goal: '生成修复建议', target: 'suggest' }
    ]);
    // 图谱构建
    this._templates.set('graph_build', [
      { goal: '收集资源', target: 'collect' },
      { goal: '建立关系', target: 'relate' },
      { goal: '分析完整性', target: 'analyze' }
    ]);
  }

  /**
   * 拆解任务
   * @param {{ goal: string, team: import('./agentTeam.cjs'), context: object }} input
   * @returns {Task}
   */
  plan(input) {
    const task = new Task({
      teamId: input.team ? input.team.id : '',
      goal: input.goal
    });

    // 按模板匹配
    for (const [key, template] of this._templates) {
      if (input.goal.toLowerCase().includes(key.replace(/_/g, ' ')) ||
          key.includes(input.goal.toLowerCase().replace(/\s+/g, '_'))) {
        for (const t of template) {
          task.addSubtask({ goal: t.goal });
        }
        break;
      }
    }

    // 无模板匹配 → 直接作为单一任务
    if (task.subtasks.length === 0) {
      task.addSubtask({ goal: input.goal });
    }

    task.status = 'planning';
    return task;
  }
}

module.exports = TaskPlanner;
