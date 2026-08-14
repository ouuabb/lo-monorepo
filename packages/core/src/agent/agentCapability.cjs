/**
 * AgentCapability — Agent 能力定义
 *
 * Phase 6.5: 定义 Agent 可执行的能力。
 *
 * 类似 Plugin Extension，但专为 Agent 设计。
 */

// 内置能力
const BUILTIN_CAPABILITIES = {
  'knowledge.analyze': {
    name: 'knowledge.analyze',
    description: '分析知识图谱状态',
    category: 'knowledge'
  },
  'graph.query': {
    name: 'graph.query',
    description: '查询知识图谱',
    category: 'graph'
  },
  'workflow.execute': {
    name: 'workflow.execute',
    description: '执行工作流',
    category: 'workflow'
  },
  'resource.inspect': {
    name: 'resource.inspect',
    description: '检查资源状态',
    category: 'resource'
  },
  'notification.send': {
    name: 'notification.send',
    description: '发送通知',
    category: 'notification'
  },
  'event.publish': {
    name: 'event.publish',
    description: '发布事件',
    category: 'event'
  },
  'suggestion.create': {
    name: 'suggestion.create',
    description: '创建建议',
    category: 'suggestion'
  }
};

class AgentCapability {
  /**
   * @param {object} opts
   * @param {string} opts.name
   * @param {string} [opts.description]
   * @param {string} [opts.category]
   */
  constructor({ name, description, category } = {}) {
    this.name = name;
    this.description = description || '';
    this.category = category || 'general';
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      category: this.category
    };
  }

  static builtins() {
    return Object.values(BUILTIN_CAPABILITIES).map(c => new AgentCapability(c));
  }
}

module.exports = AgentCapability;
