/**
 * NavigationEngine — 知识导航引擎
 *
 * Phase 5.5: 封装 Graph 能力，提供面向用户的导航 API。
 * 不依赖数据库，基于 GraphEngine 的纯计算。
 *
 * 职责:
 *   - related()        相关资源推荐（共享邻居 + PageRank）
 *   - backlinks()      反向链接导航（带关系类型）
 *   - neighborhood()   资源邻域视图
 *   - explainPath()    路径解释
 *   - impact()         影响分析
 */

class NavigationEngine {
  /**
   * @param {import('./graphEngine.cjs')} graphEngine
   */
  constructor(graphEngine) {
    this.engine = graphEngine;
  }

  /**
   * 相关资源推荐
   *
   * 算法: sharedNeighbors * 0.6 + pageRank * 0.4
   * 排除直接邻居和资源自身。
   *
   * @param {string} rid
   * @param {{ topN?: number }} options
   * @returns {Array<{ rid: string, score: number, sharedNeighbors: number, pageRank: number }>}
   */
  related(rid, { topN = 10 } = {}) {
    if (!this.engine.graph.hasNode(rid)) return [];

    const directNeighbors = new Set(this.engine.neighbors(rid));
    const candidates = new Map();

    // 遍历直接邻居，收集二级候选
    for (const neighbor of directNeighbors) {
      // 谁还连向这个邻居？
      for (const e of this.engine.graph.incoming(neighbor)) {
        if (e.from === rid) continue;
        if (directNeighbors.has(e.from)) continue;
        candidates.set(e.from, (candidates.get(e.from) || 0) + 1);
      }

      // 这个邻居还连向谁？
      for (const e of this.engine.graph.outgoing(neighbor)) {
        if (e.to === rid) continue;
        if (directNeighbors.has(e.to)) continue;
        candidates.set(e.to, (candidates.get(e.to) || 0) + 1);
      }
    }

    if (candidates.size === 0) return [];

    // PageRank 加权
    const pr = this.engine.pageRank();
    const prMap = new Map(pr.map(p => [p.rid, p.score]));
    const maxShared = Math.max(...candidates.values());
    const maxPr = pr.length > 0 ? Math.max(...pr.map(p => p.score)) : 1;

    const results = [];
    for (const [candidateRid, sharedCount] of candidates) {
      const normalizedShared = maxShared > 0 ? sharedCount / maxShared : 0;
      const prScore = prMap.get(candidateRid) || 0;
      const normalizedPR = maxPr > 0 ? prScore / maxPr : 0;
      const score = normalizedShared * 0.6 + normalizedPR * 0.4;

      results.push({
        rid: candidateRid,
        score: Math.round(score * 10000) / 10000,
        sharedNeighbors: sharedCount,
        pageRank: Math.round(prScore * 10000) / 10000
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topN);
  }

  /**
   * 反向链接导航（谁引用了我）
   *
   * @param {string} rid
   * @returns {Array<{ rid: string, type: string, metadata?: object }>}
   */
  backlinks(rid) {
    if (!this.engine.graph.hasNode(rid)) return [];
    const edges = this.engine.graph.incoming(rid);
    return edges.map(e => ({
      rid: e.from,
      type: e.type,
      metadata: e.metadata
    }));
  }

  /**
   * 资源邻域视图
   *
   * BFS 从中心节点出发，同时探索 incoming 和 outgoing。
   *
   * @param {string} rid
   * @param {{ depth?: number }} options
   * @returns {{ center: string, nodes: string[], edges: Array<{from:string,to:string,type:string}>, depth: number } | null}
   */
  neighborhood(rid, { depth = 2 } = {}) {
    if (!this.engine.graph.hasNode(rid)) return null;

    const visited = new Set([rid]);
    const nodes = [];
    /** @type {Array<{from:string,to:string,type:string}>} */
    const edgeSet = [];
    const seenEdges = new Set();
    const queue = [{ rid, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.depth >= depth) continue;

      // 出边
      for (const e of this.engine.graph.outgoing(current.rid)) {
        const edgeKey = `${e.from}→${e.to}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          edgeSet.push({ from: e.from, to: e.to, type: e.type });
        }
        if (!visited.has(e.to)) {
          visited.add(e.to);
          nodes.push(e.to);
          queue.push({ rid: e.to, depth: current.depth + 1 });
        }
      }

      // 入边
      for (const e of this.engine.graph.incoming(current.rid)) {
        const edgeKey = `${e.from}→${e.to}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          edgeSet.push({ from: e.from, to: e.to, type: e.type });
        }
        if (!visited.has(e.from)) {
          visited.add(e.from);
          nodes.push(e.from);
          queue.push({ rid: e.from, depth: current.depth + 1 });
        }
      }
    }

    return {
      center: rid,
      nodes,
      edges: edgeSet,
      depth
    };
  }

  /**
   * 知识路径解释
   *
   * 在最短路径基础上，标注每一步的关系类型。
   *
   * @param {string} a
   * @param {string} b
   * @returns {{ path: string[], length: number, explanation: string[] } | null}
   */
  explainPath(a, b) {
    const result = this.engine.findPath(a, b);
    if (!result) return null;

    const explanation = [];
    for (let i = 0; i < result.path.length - 1; i++) {
      const from = result.path[i];
      const to = result.path[i + 1];

      const edges = this.engine.graph.outgoing(from);
      const edge = edges.find(e => e.to === to);
      const relType = edge ? edge.type : 'unknown';

      explanation.push(`${from} --[${relType}]--> ${to}`);
    }

    return {
      path: result.path,
      length: result.length,
      explanation
    };
  }

  /**
   * 影响分析
   *
   * 分析删除/修改某个资源的影响范围。
   * direct: 直接引用该资源的节点
   * indirect: 传递依赖（间接受影响的节点）
   * score: 受影响节点的 PageRank 总和
   *
   * @param {string} rid
   * @param {{ depth?: number }} options
   * @returns {{ resource: string, direct: number, directList: Array, indirect: number, indirectList: string[], totalImpacted: number, score: number } | null}
   */
  impact(rid, { depth = 3 } = {}) {
    if (!this.engine.graph.hasNode(rid)) return null;

    // Direct: 谁直接引用我
    const directEdges = this.engine.graph.incoming(rid);
    const direct = directEdges.map(e => ({ rid: e.from, type: e.type }));

    // Indirect: 传递祖先（排除直接引用者）
    const allAncestors = this.engine.ancestors(rid);
    const directSet = new Set(direct.map(d => d.rid));
    const indirect = allAncestors.filter(a => !directSet.has(a));
    // 限制最大深度
    const limitedIndirect = indirect.slice(0, 100);

    // PageRank 加权影响分数
    const pr = this.engine.pageRank();
    const prMap = new Map(pr.map(p => [p.rid, p.score]));

    const allImpacted = [...direct.map(d => d.rid), ...limitedIndirect];
    let totalScore = 0;
    for (const impactedRid of allImpacted) {
      totalScore += prMap.get(impactedRid) || 0;
    }

    return {
      resource: rid,
      direct: direct.length,
      directList: direct,
      indirect: limitedIndirect.length,
      indirectList: limitedIndirect,
      totalImpacted: direct.length + indirect.length,
      score: Math.round(totalScore * 10000) / 10000
    };
  }
}

module.exports = NavigationEngine;
