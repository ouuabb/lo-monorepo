/**
 * KnowledgeReasoner — 知识推理器
 *
 * Phase 6.7: 专门处理知识图谱的推理。
 *
 * 能力:
 *   analyzeGraph() — 图谱分析
 *   suggestRelations() — 自动关系建议
 *   detectKnowledgeGaps() — 知识缺口检测
 *   conceptDiscovery() — 概念发现
 */

class KnowledgeReasoner {
  /**
   * @param {object} [services]
   * @param {object} [services.repository]
   * @param {object} [services.graphEngine]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.repository = services.repository || null;
    this.graphEngine = services.graphEngine || null;
    this.logger = services.logger || console;
  }

  /**
   * 分析图谱状态
   */
  async analyzeGraph() {
    const result = { nodeCount: 0, edgeCount: 0, islandCount: 0, orphanCount: 0 };

    if (this.repository) {
      try {
        const stats = await this.repository.getStats();
        result.nodeCount = stats.resourceCount || 0;
        result.edgeCount = stats.relationCount || 0;
      } catch (e) { this.logger.error('knowledgeReasoner: get repository stats failed', e); }
    }

    if (this.graphEngine) {
      try {
        // graphEngine 可能是异步装配返回的 Promise，await 解析后再使用 stats()
        const engine = await this.graphEngine;
        if (engine && typeof engine.stats === 'function') {
          const stats = engine.stats();
          result.nodeCount = stats.nodeCount || result.nodeCount;
          result.edgeCount = stats.edgeCount || result.edgeCount;
        }
      } catch (e) { this.logger.error('knowledgeReasoner: graph stats failed', e); }
    }

    return result;
  }

  /**
   * 自动关系建议（基于资源标题相似度）
   */
  async suggestRelations(limit = 10) {
    if (!this.repository) return [];
    try {
      const recs = await this.repository.getRelationSuggestions(limit);
      return recs || [];
    } catch (e) { this.logger.error('knowledgeReasoner: relation suggestions failed', e); return []; }
  }

  /**
   * 知识缺口检测
   */
  async detectKnowledgeGaps() {
    const gaps = [];

    if (this.repository) {
      try {
        const lifecycle = await this.repository.getKnowledgeLifecycle();
        if (lifecycle && lifecycle.forgotten > 0) {
          gaps.push({ type: 'forgotten', count: lifecycle.forgotten, suggestion: 'Review forgotten resources' });
        }
      } catch (e) { this.logger.error('knowledgeReasoner: knowledge lifecycle query failed', e); }
    }

    if (this.graphEngine) {
      try {
        const graph = await this.graphEngine.build();
        const orphans = (graph.nodes || []).filter(n => {
          const edges = (graph.edges || []).filter(e => e.from === n.id || e.to === n.id);
          return edges.length === 0;
        });
        if (orphans.length > 0) {
          gaps.push({ type: 'orphan', count: orphans.length, suggestion: 'Connect orphan nodes' });
        }
      } catch (e) { this.logger.error('knowledgeReasoner: build graph for gap detection failed', e); }
    }

    return gaps;
  }

  /**
   * 概念发现
   */
  async conceptDiscovery() {
    return { discovered: 0, suggestions: [] };
  }
}

module.exports = KnowledgeReasoner;
