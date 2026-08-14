/**
 * AgentContext — Agent 执行上下文
 *
 * Phase 6.5: 连接 Agent ↔ Event ↔ Workflow ↔ Permission。
 */

class AgentContext {
  /**
   * @param {object} opts
   * @param {import('./agent.cjs')} opts.agent
   * @param {object} [opts.event] — 触发事件
   * @param {any[]} [opts.resources] — 相关资源
   * @param {Array} [opts.memory] — 历史记忆
   * @param {object} [opts.workflowEngine]
   * @param {object} [opts.permissionManager]
   * @param {object} [opts.repository]
   * @param {object} [opts.logger]
   */
  constructor(opts = {}) {
    this.agent = opts.agent || null;
    this.event = opts.event || null;
    this.resources = opts.resources || [];
    this.memory = opts.memory || [];
    this.workflowEngine = opts.workflowEngine || null;
    this.permissionManager = opts.permissionManager || null;
    this.repository = opts.repository || null;
    this.logger = opts.logger || console;

    /** 本次执行收集的观察数据 */
    this.observations = [];

    /** 本次执行的决策记录 */
    this.decisions = [];
  }

  /**
   * 记录观察
   */
  observe(type, data) {
    this.observations.push({ type, data, timestamp: Date.now() });
  }

  /**
   * 记录决策
   */
  decide(action, reason) {
    this.decisions.push({ action, reason, timestamp: Date.now() });
  }

  toJSON() {
    return {
      agent: this.agent ? this.agent.id : null,
      event: this.event ? (this.event.type || this.event) : null,
      observations: this.observations,
      decisions: this.decisions
    };
  }
}

module.exports = AgentContext;
