/**
 * KnowledgeAnalyzer — 知识图谱分析器
 *
 * Phase 5.7: 分析知识结构质量。
 * 纯计算层，基于 GraphEngine + NavigationEngine，不依赖数据库。
 *
 * 能力:
 *   - density()         知识密度
 *   - islands()         知识孤岛检测
 *   - gaps()            知识缺口检测
 */

class KnowledgeAnalyzer {
  /**
   * @param {import('./graphEngine.cjs')} graphEngine
   * @param {import('./navigationEngine.cjs')} [navigationEngine]
   */
  constructor(graphEngine, navigationEngine) {
    this.engine = graphEngine;
    this.nav = navigationEngine || null;
  }

  /**
   * 知识密度分析
   *
   * density = relation_count / resource_count
   *
   * @returns {{ resources: number, relations: number, density: number, level: string }}
   */
  density() {
    const resources = this.engine.graph.nodeCount();
    const relations = this.engine.graph.edgeCount();
    const density = resources > 0
      ? Math.round((relations / resources) * 100) / 100
      : 0;

    let level;
    if (density < 0.5) level = 'sparse';       // 稀疏：大部分资源没有关系
    else if (density < 2) level = 'moderate';    // 适中
    else if (density < 5) level = 'connected';   // 良好连接
    else level = 'dense';                        // 高度连接

    return { resources, relations, density, level };
  }

  /**
   * 知识孤岛检测
   *
   * 基于 connectedComponents()，发现孤立的知识簇。
   *
   * @returns {Array<{ cluster: string, size: number, nodes: string[], isolation: number }>}
   */
  islands() {
    const components = this.engine.clusters();
    const totalNodes = this.engine.graph.nodeCount();

    return components.map((comp, i) => ({
      cluster: `cluster-${i + 1}`,
      size: comp.size,
      nodes: comp.nodes,
      // isolation: 簇越小越孤立；孤立节点 isolation=1
      isolation: totalNodes > 0
        ? Math.round((1 - comp.size / totalNodes) * 100) / 100
        : 0
    }));
  }

  /**
   * 知识缺口检测
   *
   * 发现潜在的知识桥接点：不同连通分量之间，高价值节点之间的缺失连接。
   * 算法:
   *   1. 获取所有连通分量
   *   2. 找出不同分量间有共同邻居但是没有直接连接的节点对
   *   3. 按共享邻居数量和节点重要性排序
   *
   * @param {{ maxGaps?: number }} options
   * @returns {Array<{ from: string, to: string, fromCluster: string, toCluster: string, sharedNeighbors: string[], suggested: string }>}
   */
  gaps(options = {}) {
    const { maxGaps = 10 } = options;
    const components = this.engine.clusters();

    if (components.length < 2) return [];

    // 建立节点 -> 簇 的映射
    const nodeToCluster = new Map();
    for (let ci = 0; ci < components.length; ci++) {
      for (const rid of components[ci].nodes) {
        nodeToCluster.set(rid, ci);
      }
    }

    // 收集每个节点的邻居集合（双向）
    const allNeighbors = new Map();
    for (const rid of this.engine.graph.getNodeIds()) {
      allNeighbors.set(rid, new Set(this.engine.neighbors(rid)));
    }

    // 获取 PageRank 用于排序
    const pr = this.engine.pageRank();
    const prMap = new Map(pr.map(p => [p.rid, p.score]));

    // 找跨簇缺口
    const gapCandidates = [];
    const nodeIds = [...this.engine.graph.getNodeIds()];

    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = nodeIds[i];
        const b = nodeIds[j];
        const ca = nodeToCluster.get(a);
        const cb = nodeToCluster.get(b);

        // 必须在不同簇
        if (ca === cb || ca === undefined || cb === undefined) continue;

        // 已存在直接连接则跳过
        const neighborsA = allNeighbors.get(a);
        if (neighborsA && neighborsA.has(b)) continue;

        // 计算共同邻居
        const neighborsB = allNeighbors.get(b);
        if (!neighborsA || !neighborsB) continue;

        const shared = [...neighborsA].filter(n => neighborsB.has(n));

        // 至少有一个共同邻居才算有意义
        if (shared.length === 0) continue;

        // 计算缺口分数: 共享邻居数 + 两端节点的平均 PR
        const prA = prMap.get(a) || 0;
        const prB = prMap.get(b) || 0;
        const score = shared.length * 2 + (prA + prB) * 10;

        gapCandidates.push({
          from: a,
          to: b,
          fromCluster: `cluster-${ca + 1}`,
          toCluster: `cluster-${cb + 1}`,
          sharedNeighbors: shared,
          score,
          suggested: shared.length > 0 ? shared[0] : 'unknown'
        });
      }
    }

    return gapCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, maxGaps)
      .map(g => ({
        from: g.from,
        to: g.to,
        fromCluster: g.fromCluster,
        toCluster: g.toCluster,
        sharedNeighbors: g.sharedNeighbors.slice(0, 5),
        suggested: g.suggested
      }));
  }

  /**
   * 完整知识报告
   * @returns {object}
   */
  report() {
    const d = this.density();
    const isl = this.islands();
    const gp = this.gaps({ maxGaps: 5 });

    const coreCount = isl.filter(i => i.size >= 5);
    const isolatedNodes = isl.filter(i => i.size === 1);
    const singletons = isolatedNodes.length;

    return {
      density: d,
      clusters: {
        total: isl.length,
        core: coreCount.length,
        isolated: singletons,
        largest: isl.length > 0 ? Math.max(...isl.map(i => i.size)) : 0,
        list: isl
      },
      gaps: gp
    };
  }
}

module.exports = KnowledgeAnalyzer;
