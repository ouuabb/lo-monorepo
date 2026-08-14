/**
 * KnowledgePatternEngine — 知识模式发现引擎
 *
 * Phase 5.11: 在图结构中检测重复出现的模式。
 *
 * 模式类型:
 *   hub       — 高连接核心节点（degree >= threshold）
 *   chain     — 线性学习路径（at least 3 nodes in sequence）
 *   bridge    — 跨领域桥梁节点
 *   dead_end  — 只有入边没有出边的终点
 */

class KnowledgePatternEngine {
  /**
   * @param {import('./graphEngine.cjs')} graphEngine
   * @param {import('./database.cjs')} db
   */
  constructor(graphEngine, db) {
    this.engine = graphEngine;
    this.db = db;
  }

  /**
   * 检测所有模式
   */
  async detectAll(options = {}) {
    const { minDegree = 3, maxResults = 20 } = options;

    const [hubs, chains, bridges, deadEnds] = await Promise.all([
      this.detectHubs(minDegree, maxResults),
      this.detectChains(3, maxResults),
      this.detectBridges(maxResults),
      this.detectDeadEnds(maxResults)
    ]);

    return { hubs, chains, bridges, deadEnds };
  }

  /**
   * Hub 检测：degree 高于阈值的节点
   */
  async detectHubs(minDegree = 3, maxResults = 20) {
    const graph = this.engine.graph;
    const hubs = [];

    for (const rid of graph.getNodeIds()) {
      const deg = graph.degree(rid);
      if (deg >= minDegree) {
        hubs.push({
          rid,
          degree: deg,
          outgoing: graph.outgoing(rid).length,
          incoming: graph.incoming(rid).length,
          type: 'hub'
        });
      }
    }

    hubs.sort((a, b) => b.degree - a.degree);
    return hubs.slice(0, maxResults);
  }

  /**
   * Chain 检测：至少 minLength 个节点的线性路径
   */
  async detectChains(minLength = 3, maxResults = 20) {
    const graph = this.engine.graph;
    const chains = [];
    const visited = new Set();

    for (const rid of graph.getNodeIds()) {
      if (visited.has(rid)) continue;

      const out = graph.outgoing(rid);
      // Chain 特征：出度为 1，且被链入节点入度为 1
      if (out.length === 1) {
        const path = [rid];
        let current = rid;
        const localVisited = new Set([rid]);

        for (let depth = 0; depth < 10; depth++) {
          const nextEdges = graph.outgoing(current);
          if (nextEdges.length !== 1) break;

          const next = nextEdges[0].to;
          if (localVisited.has(next)) break;
          if (graph.incoming(next).length !== 1) break;

          localVisited.add(next);
          path.push(next);
          current = next;
          visited.add(next);
        }

        if (path.length >= minLength && chains.length < maxResults) {
          chains.push({
            type: 'chain',
            nodes: path,
            length: path.length,
            description: `${path.join(' → ')}`
          });
        }
      }
    }

    chains.sort((a, b) => b.length - a.length);
    return chains;
  }

  /**
   * Bridge 检测：连接不同领域的节点
   *
   * 通过分析邻居节点的 type 分布判断：如果邻居有多种 type，即为 bridge。
   */
  async detectBridges(maxResults = 20) {
    const graph = this.engine.graph;
    const bridges = [];

    // 获取所有资源的 type
    const typeRows = await this.db.all('SELECT rid, type FROM resources WHERE deleted = 0');
    const typeMap = new Map();
    for (const r of typeRows) typeMap.set(r.rid, r.type);

    for (const rid of graph.getNodeIds()) {
      const neighbors = [
        ...graph.outgoing(rid).map(e => e.to),
        ...graph.incoming(rid).map(e => e.from)
      ];

      const neighborTypes = new Set();
      for (const nid of neighbors) {
        const t = typeMap.get(nid);
        if (t) neighborTypes.add(t);
      }

      // 连接了 2+ 种不同类型
      if (neighborTypes.size >= 2 && bridges.length < maxResults) {
        bridges.push({
          rid,
          degree: graph.degree(rid),
          bridges: Array.from(neighborTypes),
          type: 'bridge',
          description: `bridges ${Array.from(neighborTypes).join(' ↔ ')}`
        });
      }
    }

    bridges.sort((a, b) => b.degree - a.degree);
    return bridges;
  }

  /**
   * Dead-end 检测：只有入边、没有出边的节点
   */
  async detectDeadEnds(maxResults = 20) {
    const graph = this.engine.graph;
    const deadEnds = [];

    for (const rid of graph.getNodeIds()) {
      const out = graph.outgoing(rid);
      const incoming = graph.incoming(rid);

      if (out.length === 0 && incoming.length > 0) {
        deadEnds.push({
          rid,
          incoming: incoming.length,
          type: 'dead_end',
          description: `${incoming.length} references point here, but no outgoing links`
        });
      }
    }

    deadEnds.sort((a, b) => b.incoming - a.incoming);
    return deadEnds.slice(0, maxResults);
  }
}

module.exports = KnowledgePatternEngine;
