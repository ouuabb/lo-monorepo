/**
 * SemanticRelationEngine — 语义关系推理引擎
 *
 * Phase 5.8: 基于启发式规则推断潜在关系，不直接写入数据库。
 * AI-ready 接口：当前用规则引擎，可替换为 LLM 调用。
 *
 * 算法:
 *   1. 共享邻居分析 — 两节点有多个共同邻居但无直接连接
 *   2. 关系类型推断 — 根据已有关联模式推断建议的关系类型
 *   3. 反向链接补全 — 缺失的反向链接
 */

class SemanticRelationEngine {
  /**
   * @param {import('./graphEngine.cjs')} graphEngine
   * @param {import('./navigationEngine.cjs')} navEngine
   */
  constructor(graphEngine, navEngine) {
    this.engine = graphEngine;
    this.nav = navEngine;
  }

  /**
   * 生成关系建议
   * @param {{ maxSuggestions?: number }} options
   * @returns {Array<{ source: string, target: string, suggestedType: string, confidence: number, reason: string }>}
   */
  suggest(options = {}) {
    const { maxSuggestions = 20 } = options;
    const suggestions = [];

    // 1. 共享邻居建议
    suggestions.push(...this._sharedNeighborSuggestions());

    // 2. 反向链接补全
    suggestions.push(...this._reverseLinkSuggestions());

    // 3. 高价值节点互联
    suggestions.push(...this._centralNodeSuggestions());

    // 去重 + 排除已有连接
    const existingEdges = new Set();
    for (const e of this.engine.graph.allEdges()) {
      existingEdges.add(`${e.from}→${e.to}`);
    }

    const seen = new Set();
    const filtered = suggestions.filter(s => {
      const key = `${s.source}|${s.target}`;
      const edgeKey = `${s.source}→${s.target}`;
      if (seen.has(key)) return false;
      if (existingEdges.has(edgeKey)) return false;
      seen.add(key);
      return true;
    });

    return filtered.sort((a, b) => b.confidence - a.confidence).slice(0, maxSuggestions);
  }

  /**
   * 共享邻居分析：两个节点有共同邻居但无直接关系
   */
  _sharedNeighborSuggestions() {
    const results = [];
    const nodeIds = [...this.engine.graph.getNodeIds()];
    const allNeighbors = new Map();
    for (const rid of nodeIds) {
      allNeighbors.set(rid, new Set(this.engine.neighbors(rid)));
    }

    const pr = this.engine.pageRank();
    const prMap = new Map(pr.map(p => [p.rid, p.score]));

    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = nodeIds[i];
        const b = nodeIds[j];
        const na = allNeighbors.get(a);
        const nb = allNeighbors.get(b);
        if (!na || !nb) continue;
        if (na.has(b)) continue; // 已有连接

        const shared = [...na].filter(n => nb.has(n));
        if (shared.length < 2) continue;

        // 推断关系类型
        const suggestedType = this._inferType(a, b, shared);

        const prA = prMap.get(a) || 0;
        const prB = prMap.get(b) || 0;
        const confidence = Math.min(
          (shared.length / 10) * 0.5 + (prA + prB) * 0.5,
          0.95
        );

        results.push({
          source: a,
          target: b,
          suggestedType,
          confidence: Math.round(confidence * 100) / 100,
          reason: `共享 ${shared.length} 个邻居: ${shared.slice(0, 3).join(', ')}`
        });
      }
    }

    return results;
  }

  /**
   * 反向链接补全：A→B 存在但 B→A 可能缺失
   */
  _reverseLinkSuggestions() {
    const results = [];
    const edges = this.engine.graph.allEdges();

    for (const e of edges) {
      // 检查反向连接是否存在
      const reverse = edges.find(r => r.from === e.to && r.to === e.from);
      if (reverse) continue;

      // 如果 A→B 且 B 没有引用 A，建议 B→A
      const degA = this.engine.graph.degree(e.from);
      const degB = this.engine.graph.degree(e.to);

      if (degB >= 2 && degA >= 2) {
        results.push({
          source: e.to,
          target: e.from,
          suggestedType: 'reference',
          confidence: 0.45,
          reason: `${e.from} 已引用 ${e.to}，建议建立反向连接`
        });
      }
    }

    return results;
  }

  /**
   * 高价值节点互联建议
   */
  _centralNodeSuggestions() {
    const results = [];
    const central = this.engine.centralNodes(10);
    if (central.length < 2) return results;

    const existing = new Set();
    for (const e of this.engine.graph.allEdges()) {
      existing.add(`${e.from}→${e.to}`);
    }

    for (let i = 0; i < central.length; i++) {
      for (let j = i + 1; j < central.length; j++) {
        const a = central[i].rid;
        const b = central[j].rid;
        if (existing.has(`${a}→${b}`) || existing.has(`${b}→${a}`)) continue;

        const avgDegree = (central[i].degree + central[j].degree) / 2;
        const confidence = Math.min(avgDegree / 20, 0.7);

        if (confidence > 0.2) {
          results.push({
            source: a,
            target: b,
            suggestedType: 'reference',
            confidence: Math.round(confidence * 100) / 100,
            reason: `两个中心节点（度 ${central[i].degree}+${central[j].degree}）未连接`
          });
        }
      }
    }

    return results;
  }

  /**
   * 推断关系类型
   */
  _inferType(a, b, shared) {
    // 检查共享邻居中的边类型模式
    const typeCounts = new Map();
    for (const e of this.engine.graph.allEdges()) {
      if (shared.includes(e.from) || shared.includes(e.to)) {
        typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
      }
    }

    if (typeCounts.size === 0) return 'reference';

    // 返回最常见的类型
    let maxType = 'reference';
    let maxCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxType = type;
      }
    }

    return maxType;
  }
}

module.exports = SemanticRelationEngine;
