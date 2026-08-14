/**
 * AIPlanner — AI 计划器
 *
 * Phase 6.7: 根据推理结果生成执行计划。
 *
 * 输入: { request, reasoning }
 * 输出: [{ step, action, target, payload }]
 */

class AIPlanner {
  constructor() {
    this._templates = new Map();
    this._registerTemplates();
  }

  _registerTemplates() {
    // 整理知识库
    this._templates.set('整理', [
      { step: 'find_orphan_nodes', action: 'analysis', target: 'find_orphan_nodes' },
      { step: 'suggest_relation', action: 'analysis', target: 'suggest_relation' },
      { step: 'merge_concept', action: 'analysis', target: 'merge_concept' },
      { step: 'notify_user', action: 'notify_user', target: '整理完成' }
    ]);

    // 分析
    this._templates.set('分析', [
      { step: 'find_orphan_nodes', action: 'analysis', target: 'find_orphan_nodes' },
      { step: 'notify_user', action: 'notify_user', target: '分析结果已准备' }
    ]);

    // 研究
    this._templates.set('研究', [
      { step: 'collect', action: 'analysis', target: 'find_orphan_nodes' },
      { step: 'call_agent', action: 'call_agent', target: 'research-agent' },
      { step: 'notify_user', action: 'notify_user', target: '研究结果已准备' }
    ]);
  }

  /**
   * 生成计划
   */
  async plan(input) {
    const request = input.request;
    const userInput = request.input;

    // 尝试模板匹配
    for (const [key, template] of this._templates) {
      if (userInput.toLowerCase().includes(key.toLowerCase())) {
        return template;
      }
    }

    // analysis / research 模式
    if (request.mode === 'analysis') {
      return [
        { step: 'find_orphan_nodes', action: 'analysis', target: 'find_orphan_nodes' },
        { step: 'suggest_relation', action: 'analysis', target: 'suggest_relation' },
        { step: 'notify_user', action: 'notify_user', target: '分析完成' }
      ];
    }

    // 默认
    return [
      { step: 'notify_user', action: 'notify_user', target: `收到: ${userInput}` }
    ];
  }
}

module.exports = AIPlanner;
