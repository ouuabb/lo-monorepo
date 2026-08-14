/**
 * EvolutionStrategy — 进化策略
 *
 * Phase 6.8: 将检测到的问题转化为可执行的策略。
 *
 * 策略类型:
 *   expand    — 扩展
 *   refactor  — 重构
 *   merge     — 合并
 *   remove    — 移除
 *   optimize  — 优化
 *   learn     — 学习
 */

class EvolutionStrategy {
  constructor() {
    this._strategyMap = new Map();
    this._registerBuiltins();
  }

  _registerBuiltins() {
    this._strategyMap.set('knowledge_refactor', { type: 'refactor', description: '重构知识结构' });
    this._strategyMap.set('orphan_cleanup', { type: 'remove', description: '清理孤立节点' });
    this._strategyMap.set('knowledge_expand', { type: 'expand', description: '扩展知识网络' });
    this._strategyMap.set('merge_concepts', { type: 'merge', description: '合并重复概念' });
    this._strategyMap.set('optimize_graph', { type: 'optimize', description: '优化图谱结构' });
    this._strategyMap.set('learn_patterns', { type: 'learn', description: '学习知识模式' });
  }

  /**
   * 为检测到的机会生成策略
   */
  generate(opportunities) {
    return opportunities.map(opp => {
      const mapping = this._strategyMap.get(opp.type) || { type: 'optimize', description: opp.type };

      return {
        name: opp.type,
        type: mapping.type,
        description: mapping.description,
        priority: opp.priority || 'medium',
        details: opp.details || {}
      };
    });
  }
}

module.exports = EvolutionStrategy;
