/**
 * AIContextBuilder — AI 上下文构建器
 *
 * Phase 5.8: 把内部知识图谱转换为 AI 可理解的上下文。
 * 不依赖 AI API，纯数据转换层。
 *
 * 职责:
 *   - 组装资源元数据
 *   - 收集关联关系和邻域
 *   - 附加分析指标（评分、密度、缺口）
 */

class AIContextBuilder {
  /**
   * @param {import('./graphEngine.cjs')} graphEngine
   * @param {import('./navigationEngine.cjs')} navEngine
   * @param {import('./knowledgeAnalyzer.cjs')} [analyzer]
   * @param {Function} [resolveName] - (rid) => { name, type, layer }
   */
  constructor(graphEngine, navEngine, analyzer, resolveName) {
    this.engine = graphEngine;
    this.nav = navEngine;
    this.analyzer = analyzer || null;
    this._resolveName = resolveName || ((rid) => ({ name: rid }));
  }

  /**
   * 构建单个资源的 AI 上下文
   * @param {string} rid
   * @returns {object|null}
   */
  buildResourceContext(rid) {
    if (!this.engine.graph.hasNode(rid)) return null;

    const res = this._resolveName(rid);
    const incoming = this.engine.incoming(rid);
    const outgoing = this.engine.outgoing(rid);
    const pr = this.engine.pageRank();
    const prItem = pr.find((p) => p.rid === rid);

    // 关系
    const relations = [];
    for (const r of this.engine.graph.incoming(rid)) {
      const info = this._resolveName(r.from);
      relations.push({
        type: r.type,
        direction: "incoming",
        target: r.from,
        targetName: info.name,
      });
    }
    for (const r of this.engine.graph.outgoing(rid)) {
      const info = this._resolveName(r.to);
      relations.push({
        type: r.type,
        direction: "outgoing",
        target: r.to,
        targetName: info.name,
      });
    }

    // 邻域
    const neighbors = this.engine.neighbors(rid).slice(0, 20);
    const neighborInfo = neighbors.map((n) => {
      const info = this._resolveName(n);
      return { rid: n, name: info.name };
    });

    // 相关推荐
    let related = [];
    if (this.nav) {
      related = this.nav.related(rid, { topN: 5 }).map((r) => {
        const info = this._resolveName(r.rid);
        return { rid: r.rid, name: info.name, score: r.score };
      });
    }

    return {
      resource: {
        rid,
        name: res.name || rid,
        degree: this.engine.graph.degree(rid),
        pageRank: prItem ? Math.round(prItem.score * 10000) / 10000 : 0,
        incoming: incoming.length,
        outgoing: outgoing.length,
      },
      relations,
      neighborhood: neighborInfo,
      related,
    };
  }

  /**
   * 构建全量知识上下文摘要（用于 AI 了解整体知识结构）
   * @returns {object}
   */
  buildGlobalContext() {
    const nodes = this.engine.graph.nodeCount();
    const edges = this.engine.graph.edgeCount();

    const centralNodes = this.engine.centralNodes(5);
    const isolated = this.engine.isolatedNodes();

    let density = null;
    let gaps = [];
    if (this.analyzer) {
      density = this.analyzer.density();
      gaps = this.analyzer.gaps({ maxGaps: 3 });
    }

    return {
      overview: {
        totalResources: nodes,
        totalRelations: edges,
        density: density ? density.density : 0,
        densityLevel: density ? density.level : "unknown",
      },
      topNodes: centralNodes.slice(0, 5).map((n) => {
        const info = this._resolveName(n.rid);
        return { rid: n.rid, name: info.name, degree: n.degree };
      }),
      isolated: isolated.slice(0, 10).map((n) => {
        const info = this._resolveName(n);
        return { rid: n, name: info.name };
      }),
      gaps,
    };
  }

  /**
   * 构建对话上下文（配合 AI 问答使用）
   * @param {string} query - 用户问题
   * @returns {object}
   */
  buildChatContext(query) {
    const global = this.buildGlobalContext();

    return {
      query,
      knowledgeGraph: global,
      timestamp: Date.now(),
    };
  }
}

module.exports = AIContextBuilder;
