/**
 * RuntimeContext — 统一运行上下文
 *
 * Phase 6.10: 整合所有子系统引用，Runtime 行为都通过 Context 访问。
 */

class RuntimeContext {
  /**
   * @param {object} services
   */
  constructor(services = {}) {
    this.repository = services.repository || null;
    this.eventBus = services.eventBus || null;
    this.workflowEngine = services.workflowEngine || null;
    this.agentEngine = services.agentEngine || null;
    this.aiOS = services.aiOS || null;
    this.security = services.security || null;
    this.plugins = services.plugins || null;
    this.collaboration = services.collaboration || null;
    this.evolution = services.evolution || null;
  }

  /**
   * 检查子系统是否可用
   */
  has(name) {
    return this[name] !== null;
  }

  /**
   * 获取可用的子系统列表
   */
  availableSystems() {
    const names = ['repository', 'eventBus', 'workflowEngine', 'agentEngine', 'aiOS', 'security', 'plugins', 'collaboration', 'evolution'];
    return names.filter(n => this[n] !== null);
  }
}

module.exports = RuntimeContext;
