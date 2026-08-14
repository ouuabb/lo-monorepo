/**
 * GraphQuery — 图查询 DSL（Builder Pattern）
 *
 * Phase 5.4: 链式查询接口，不引入完整查询语言。
 *
 * 示例:
 *   repo.queryGraph().from('note123').outgoing().depth(2).type('reference').run()
 */

class GraphQueryBuilder {
  /**
   * @param {GraphEngine} engine
   */
  constructor(engine) {
    this._engine = engine;
    this._from = null;
    this._direction = "both"; // outgoing | incoming | both
    this._depth = 1;
    this._type = null;
    this._filterFn = null;
    this._resultLimit = 1000;
  }

  /**
   * 设置查询起点（重置所有状态）
   */
  from(rid) {
    this._from = rid;
    this._direction = "both";
    this._depth = 1;
    this._type = null;
    this._filterFn = null;
    this._resultLimit = 1000;
    return this;
  }

  /**
   * 只查询出边（我引用了谁）
   */
  outgoing() {
    this._direction = "outgoing";
    return this;
  }

  /**
   * 只查询入边（谁引用了我）
   */
  incoming() {
    this._direction = "incoming";
    return this;
  }

  /**
   * 双向查询
   */
  both() {
    this._direction = "both";
    return this;
  }

  /**
   * 遍历深度限制
   */
  depth(n) {
    this._depth = Math.max(1, n);
    return this;
  }

  /**
   * 关系类型过滤
   */
  type(t) {
    this._type = t;
    return this;
  }

  /**
   * 自定义节点过滤（fn receives: { rid, distance, degree }）
   */
  where(fn) {
    this._filterFn = fn;
    return this;
  }

  /**
   * 结果上限
   */
  limit(n) {
    this._resultLimit = n;
    return this;
  }

  /**
   * 执行查询
   * @returns {Array<{ rid: string, distance: number, degree: number }>}
   */
  run() {
    if (!this._from) {
      throw new Error("graph query: 必须指定 .from(rid)");
    }
    if (!this._engine.graph.hasNode(this._from)) {
      return [];
    }

    const visited = new Map();
    // BFS
    const queue = [{ rid: this._from, distance: 0 }];
    visited.set(this._from, { rid: this._from, distance: 0 });

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.distance >= this._depth) continue;

      const edges = this._getEdges(cur.rid);

      for (const e of edges) {
        const neighbor = this._getNeighbor(e, cur.rid);

        if (visited.has(neighbor)) continue;
        if (this._type && e.type !== this._type) continue;

        const entry = {
          rid: neighbor,
          distance: cur.distance + 1,
          degree: this._engine.graph.degree(neighbor),
        };

        if (this._filterFn && !this._filterFn(entry)) continue;

        visited.set(neighbor, entry);
        queue.push(entry);

        if (visited.size >= this._resultLimit) break;
      }

      if (visited.size >= this._resultLimit) break;
    }

    // Remove the starting node from results
    visited.delete(this._from);
    return Array.from(visited.values());
  }

  /**
   * 返回结果集大小（不执行完整遍历）
   */
  size() {
    return this.run().length;
  }

  /**
   * @private
   */
  _getEdges(rid) {
    const g = this._engine.graph;
    if (this._direction === "outgoing") return g.outgoing(rid);
    if (this._direction === "incoming") return g.incoming(rid);
    return [...g.outgoing(rid), ...g.incoming(rid)];
  }

  /**
   * @private
   */
  _getNeighbor(edge, current) {
    return edge.from === current ? edge.to : edge.from;
  }
}

module.exports = GraphQueryBuilder;
