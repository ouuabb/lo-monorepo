/**
 * Graph — 纯内存资源关系图
 *
 * Phase 5.3: Graph Engine 的数据载体。
 * 不依赖 SQLite，纯粹的内存图结构。
 */

class Graph {
  constructor() {
    /** @type {Map<string, { rid: string, metadata?: object }>} */
    this.nodes = new Map();

    /** @type {Map<string, Array<{ from: string, to: string, type: string, metadata?: object }>>}
     *  keyed by from_rid (outgoing adjacency list) */
    this._outEdges = new Map();

    /** @type {Map<string, Array<{ from: string, to: string, type: string, metadata?: object }>>}
     *  keyed by to_rid (incoming adjacency list) */
    this._inEdges = new Map();

    /** @type {Array<{ from: string, to: string, type: string, metadata?: object }>} */
    this._allEdges = [];
  }

  /**
   * 添加节点
   */
  addNode(rid, metadata = {}) {
    if (!this.nodes.has(rid)) {
      this.nodes.set(rid, { rid, metadata });
    }
    return this;
  }

  /**
   * 添加边（关系）
   */
  addEdge(from, to, type = 'reference', metadata = {}) {
    // 确保节点存在
    this.addNode(from);
    this.addNode(to);

    const edge = { from, to, type, metadata };

    // outgoing
    if (!this._outEdges.has(from)) this._outEdges.set(from, []);
    this._outEdges.get(from).push(edge);

    // incoming
    if (!this._inEdges.has(to)) this._inEdges.set(to, []);
    this._inEdges.get(to).push(edge);

    this._allEdges.push(edge);
    return this;
  }

  /**
   * 是否有节点
   */
  hasNode(rid) {
    return this.nodes.has(rid);
  }

  /**
   * 获取所有节点 ID
   */
  getNodeIds() {
    return Array.from(this.nodes.keys());
  }

  /**
   * 节点数量
   */
  nodeCount() {
    return this.nodes.size;
  }

  /**
   * 边数量
   */
  edgeCount() {
    return this._allEdges.length;
  }

  /**
   * 获取节点的出边（outgoing）
   */
  outgoing(rid) {
    return this._outEdges.get(rid) || [];
  }

  /**
   * 获取节点的入边（incoming）
   */
  incoming(rid) {
    return this._inEdges.get(rid) || [];
  }

  /**
   * 获取节点的所有邻居（去重）
   */
  neighbors(rid) {
    const set = new Set();
    for (const e of this.outgoing(rid)) set.add(e.to);
    for (const e of this.incoming(rid)) set.add(e.from);
    return Array.from(set);
  }

  /**
   * 获取节点度（入度 + 出度）
   */
  degree(rid) {
    return this.incoming(rid).length + this.outgoing(rid).length;
  }

  /**
   * 获取所有边
   */
  allEdges() {
    return [...this._allEdges];
  }

  /**
   * 返回用于序列化的纯对象
   */
  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: this._allEdges
    };
  }

  /**
   * 从 JSON 还原
   */
  static fromJSON(json) {
    const g = new Graph();
    for (const n of json.nodes || []) g.addNode(n.rid, n.metadata);
    for (const e of json.edges || []) g.addEdge(e.from, e.to, e.type, e.metadata);
    return g;
  }
}

module.exports = Graph;
