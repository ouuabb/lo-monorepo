/**
 * KnowledgeHealthAnalyzer — 知识健康度分析器
 *
 * Phase 6.8: 评估知识系统的健康状态。
 *
 * 指标:
 *   connectivity — 连接程度
 *   growth      — 增长趋势
 *   entropy     — 混乱程度
 *   coverage    — 领域覆盖
 */

class KnowledgeHealthAnalyzer {
  /**
   * @param {object} [services]
   * @param {object} [services.repository]
   * @param {object} [services.graphEngine]
   */
  constructor(services = {}) {
    this.repository = services.repository || null;
    this.graphEngine = services.graphEngine || null;
  }

  /**
   * 分析健康度
   */
  async analyze(snapshot) {
    const result = {
      healthScore: 0,
      connectivity: 0,
      issues: [],
      recommendations: []
    };

    if (!snapshot) return result;

    // 连通性（空库不报低连接）
    result.connectivity = snapshot.connectivity || 0;
    if (result.connectivity < 0.3 && snapshot.resources > 0) {
      result.issues.push({ type: 'low_connectivity', severity: 'high', description: '知识连接度过低' });
      result.recommendations.push({ action: 'suggest_relations', target: 'all', priority: 'high' });
    }

    // 孤点
    if (snapshot.orphanNodes > 0) {
      result.issues.push({ type: 'orphan_nodes', severity: 'medium', count: snapshot.orphanNodes });
      result.recommendations.push({ action: 'connect_orphans', priority: 'medium' });
    }

    // 无数据
    if (snapshot.resources === 0 && snapshot.relations === 0) {
      result.issues.push({ type: 'empty', severity: 'low', description: '知识库为空' });
      result.recommendations.push({ action: 'seed_knowledge', priority: 'low' });
    }

    // 健康分：连通性为主 + 修正
    result.healthScore = Math.round(result.connectivity * 60 + Math.min(40, (snapshot.resources || 0) / 25 * 10));

    return result;
  }
}

module.exports = KnowledgeHealthAnalyzer;
