/**
 * SystemObserver — 系统观察器
 *
 * Phase 6.8: 扫描整个 Knowledge OS 并生成 SystemSnapshot。
 *
 * 连接: Resource / Relation / Graph / Workflow / Agent / Plugin / AI / Event
 */

class SystemObserver {
  /**
   * @param {object} [services]
   * @param {object} [services.repository]
   * @param {object} [services.graphEngine]
   * @param {object} [services.agentEngine]
   * @param {object} [services.workflowEngine]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.repository = services.repository || null;
    this.graphEngine = services.graphEngine || null;
    this.agentEngine = services.agentEngine || null;
    this.workflowEngine = services.workflowEngine || null;
    this.logger = services.logger || console;
  }

  /**
   * 生成系统快照
   */
  async snapshot() {
    const snap = {
      resources: 0,
      relations: 0,
      orphanNodes: 0,
      agents: 0,
      workflows: 0,
      timestamp: Date.now()
    };

    if (this.repository) {
      try {
        const stats = await this.repository.getStats();
        snap.resources = stats.resourceCount || 0;
        snap.relations = stats.relationCount || 0;
      } catch (e) { this.logger.error('systemObserver: get repository stats failed', e); }
    }

    // 孤独节点
    if (this.repository) {
      try {
        const lifecycle = await this.repository.getKnowledgeLifecycle();
        snap.orphanNodes = lifecycle.forgotten || 0;
      } catch (e) { this.logger.error('systemObserver: get lifecycle failed', e); }
    }

    if (this.agentEngine) {
      try {
        const agents = this.agentEngine.listAgents();
        snap.agents = agents.length;
      } catch (e) { this.logger.error('systemObserver: get agent list failed', e); }
    }

    if (this.workflowEngine) {
      try {
        const workflows = this.workflowEngine.list ? this.workflowEngine.list() : [];
        snap.workflows = Array.isArray(workflows) ? workflows.length : 0;
      } catch (e) { this.logger.error('systemObserver: get workflow list failed', e); }
    }

    return snap;
  }

  /**
   * 观察系统指标
   */
  async observe() {
    const snap = await this.snapshot();

    // 连通性：relations / resources
    const connectivity = snap.resources > 0
      ? Math.min(1, snap.relations / (snap.resources * 3))
      : 0;

    // 健康度：基于孤点比例
    const orphanRatio = snap.resources > 0 ? snap.orphanNodes / snap.resources : 0;
    const health = Math.max(0, 1 - orphanRatio);

    // 复杂度：简单估算
    const complexity = snap.resources > 100
      ? Math.min(1, snap.relations / 800)
      : snap.resources / 200;

    return {
      ...snap,
      connectivity: Math.round(connectivity * 100) / 100,
      health: Math.round(health * 100) / 100,
      complexity: Math.round(complexity * 100) / 100
    };
  }
}

module.exports = SystemObserver;
