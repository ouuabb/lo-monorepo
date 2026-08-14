/**
 * AgentPlanner — Agent 计划器
 *
 * Phase 6.5: 根据目标生成行动计划。
 *
 * 输入: { goal, context }
 * 输出: ActionPlan[]
 */

class AgentPlanner {
  constructor() {
    // 内置计划模板
    this._templates = new Map();
    this._registerBuiltins();
  }

  _registerBuiltins() {
    this._templates.set('cleanup_forgotten', [
      { action: 'analyze', target: 'resources', description: '扫描遗忘资源' },
      { action: 'analyze', target: 'graph', description: '检测孤立资源' },
      { action: 'suggest', target: 'review', description: '生成复习建议' }
    ]);

    this._templates.set('expand_knowledge', [
      { action: 'analyze', target: 'graph', description: '检测知识缺口' },
      { action: 'analyze', target: 'recommendations', description: '生成推荐' },
      { action: 'workflow', target: 'knowledge_expand', description: '扩展知识' }
    ]);

    this._templates.set('auto_tag', [
      { action: 'inspect', target: 'resource', description: '检查新资源' },
      { action: 'analyze', target: 'content', description: '分析内容' },
      { action: 'suggest', target: 'tag', description: '推荐标签' }
    ]);

    this._templates.set('review_graph', [
      { action: 'analyze', target: 'graph', description: '图谱分析' },
      { action: 'analyze', target: 'relations', description: '关系检查' },
      { action: 'notify', target: 'report', description: '生成报告' }
    ]);

    this._templates.set('generic_analyze', [
      { action: 'analyze', target: 'all', description: '综合分析' }
    ]);
  }

  /**
   * 生成计划
   * @param {{ goal: string, context?: object }} input
   * @returns {Array<{ action: string, target: string, description: string }>}
   */
  plan(input) {
    const goal = input.goal || '';

    // 直接匹配模板
    if (this._templates.has(goal)) {
      return this._templates.get(goal);
    }

    // 模糊匹配
    for (const [key, template] of this._templates) {
      if (goal.includes(key.replace(/_/g, ' ')) || key.includes(goal.toLowerCase())) {
        return template;
      }
    }

    // 默认：简单分析
    return [{
      action: 'analyze',
      target: goal || 'all',
      description: `分析: ${goal || 'all'}`
    }];
  }
}

module.exports = AgentPlanner;
