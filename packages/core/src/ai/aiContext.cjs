/**
 * AIContext — AI 工作上下文
 *
 * Phase 6.7: 统一连接 AI ↔ Resource / Graph / Agent / Workflow / Permission。
 */

class AIContext {
  /**
   * @param {object} opts
   * @param {object} [opts.repository]
   * @param {object} [opts.graphEngine]
   * @param {object} [opts.agentEngine]
   * @param {object} [opts.workflowEngine]
   * @param {object} [opts.permissionManager]
   * @param {object} [opts.eventBus]
   * @param {object} [opts.semanticMemory]
   * @param {object} [opts.conceptMemory]
   * @param {object} [opts.logger]
   */
  constructor(opts = {}) {
    this.repository = opts.repository || null;
    this.graphEngine = opts.graphEngine || null;
    this.agentEngine = opts.agentEngine || null;
    this.workflowEngine = opts.workflowEngine || null;
    this.permissionManager = opts.permissionManager || null;
    this.eventBus = opts.eventBus || null;
    this.semanticMemory = opts.semanticMemory || null;
    this.conceptMemory = opts.conceptMemory || null;
    this.logger = opts.logger || console;
  }

  /**
   * 获取上下文摘要（给 LLM 使用）
   */
  async summarize() {
    const parts = [];

    if (this.repository) {
      try {
        const stats = await this.repository.getStats();
        parts.push(`Resources: ${stats.resourceCount || '?'}`);
        parts.push(`Relations: ${stats.relationCount || '?'}`);
      } catch (e) { this.logger.error('aiContext: get repository stats failed', e); }
    }

    if (this.semanticMemory) {
      const stats = await this.semanticMemory.stats();
      parts.push(`AI Memories: ${stats.entryCount}`);
    }

    return parts.join(', ');
  }
}

module.exports = AIContext;
