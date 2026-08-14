/**
 * GraphBuilder — 将 Relation 数据转换为 Graph
 *
 * Phase 5.3: 纯数据转换层，不包含算法。
 * 输入: relations[]（来自 RelationService）
 * 输出: Graph（来自 src/domain/graph.cjs）
 */

const Graph = require('../domain/graph.cjs');

class GraphBuilder {
  constructor() {
    this._includeDeleted = false;
  }

  /**
   * 从关系列表构建图
   * @param {Array<{ id: number, from_rid: string, to_rid: string, type: string, metadata?: object }>} relations
   * @returns {Graph}
   */
  build(relations = []) {
    const g = new Graph();

    for (const r of relations) {
      g.addEdge(r.from_rid, r.to_rid, r.type, {
        id: r.id,
        ...(r.metadata || {})
      });
    }

    return g;
  }

  /**
   * 从关系列表构建，并指定关注的资源（用于子图提取）
   * @param {Array} relations
   * @param {string} rootRid - 根节点
   * @param {number} depth - 遍历深度
   * @returns {Graph}
   */
  buildSubGraph(relations, rootRid, depth = 1) {
    const full = this.build(relations);

    if (!full.hasNode(rootRid)) {
      return new Graph();
    }

    const visited = new Set();
    const g = new Graph();
    g.addNode(rootRid, full.nodes.get(rootRid)?.metadata);

    const queue = [{ rid: rootRid, depth: 0 }];
    visited.add(rootRid);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.depth >= depth) continue;

      const edges = full.outgoing(current.rid);
      for (const e of edges) {
        g.addEdge(e.from, e.to, e.type, e.metadata);
        if (!visited.has(e.to)) {
          visited.add(e.to);
          g.addNode(e.to, full.nodes.get(e.to)?.metadata);
          queue.push({ rid: e.to, depth: current.depth + 1 });
        }
      }
    }

    return g;
  }
}

module.exports = GraphBuilder;
