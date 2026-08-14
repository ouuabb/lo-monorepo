/**
 * EvolutionDetector — 进化检测器
 *
 * Phase 6.8: 发现系统需要改变的地方。
 *
 * 检测:
 *   knowledge_drift    — 知识漂移
 *   structural_problem — 结构问题
 *   agent_inefficiency — Agent 效率低下
 *   workflow_bottleneck — 工作流瓶颈
 */

class EvolutionDetector {
  /**
   * @param {object} [services]
   * @param {object} [services.repository]
   * @param {object} [services.agentEngine]
   * @param {object} [services.workflowEngine]
   */
  constructor(services = {}) {
    this.repository = services.repository || null;
    this.agentEngine = services.agentEngine || null;
    this.workflowEngine = services.workflowEngine || null;
  }

  /**
   * 检测进化机会
   * @param {object} snapshot — 来自 SystemObserver
   * @param {object} healthReport — 来自 KnowledgeHealthAnalyzer
   */
  async detect(snapshot = {}, healthReport = {}) {
    const opportunities = [];

    // 知识重构
    if (healthReport.issues) {
      const structuralIssues = healthReport.issues.filter(i =>
        ['low_connectivity', 'orphan_nodes'].includes(i.type)
      );
      if (structuralIssues.length > 0) {
        opportunities.push({
          type: 'knowledge_refactor',
          priority: structuralIssues.some(i => i.severity === 'high') ? 'high' : 'medium',
          details: structuralIssues
        });
      }
    }

    // 孤点清理
    if (snapshot.orphanNodes > 5) {
      opportunities.push({
        type: 'orphan_cleanup',
        priority: snapshot.orphanNodes > 20 ? 'high' : 'medium',
        details: { orphanCount: snapshot.orphanNodes }
      });
    }

    // 增长停滞
    if (snapshot.resources > 50 && snapshot.resources < 500 && snapshot.connectivity < 0.2) {
      opportunities.push({
        type: 'knowledge_expand',
        priority: 'medium',
        details: { message: 'Knowledge base needs expansion and connection' }
      });
    }

    return opportunities;
  }
}

module.exports = EvolutionDetector;
