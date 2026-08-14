/**
 * VisualGraph — 可视化图模型
 *
 * Phase 5.6: 把 Graph 计算模型转换为展示模型。
 * 不污染 Graph，独立的 UI 层数据结构。
 *
 * 节点包含显示属性 (label, group, x, y, r, color)
 * 边包含显示属性 (weight)
 */

class VisualGraph {
  constructor() {
    /** @type {Array<{ id: string, label: string, group?: string, degree: number, pageRank?: number, x?: number, y?: number, r?: number, color?: string }>} */
    this.nodes = [];
    /** @type {Array<{ source: string, target: string, type: string, weight?: number }>} */
    this.edges = [];
  }

  /**
   * 添加节点
   */
  addNode(id, options = {}) {
    this.nodes.push({
      id,
      label: options.label || id,
      group: options.group || 'default',
      degree: options.degree || 0,
      pageRank: options.pageRank,
      x: options.x,
      y: options.y,
      r: options.r,
      color: options.color,
      metadata: options.metadata || {}
    });
    return this;
  }

  /**
   * 添加边
   */
  addEdge(source, target, type = 'reference', options = {}) {
    this.edges.push({
      source,
      target,
      type,
      weight: options.weight || 1,
      metadata: options.metadata || {}
    });
    return this;
  }

  /**
   * 节点数量
   */
  nodeCount() {
    return this.nodes.length;
  }

  /**
   * 边数量
   */
  edgeCount() {
    return this.edges.length;
  }

  /**
   * 获取节点
   */
  getNode(id) {
    return this.nodes.find(n => n.id === id);
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      nodes: this.nodes.map(n => ({
        id: n.id,
        label: n.label,
        group: n.group,
        degree: n.degree,
        pageRank: n.pageRank,
        x: n.x,
        y: n.y,
        r: n.r,
        color: n.color
      })),
      edges: this.edges.map(e => ({
        source: e.source,
        target: e.target,
        type: e.type,
        weight: e.weight
      }))
    };
  }

  /**
   * 从 Graph 构建 VisualGraph
   * @param {import('./graph.cjs')} graph
   * @param {import('../repo/graphEngine.cjs')} engine
   * @param {{ groupField?: string }} options
   */
  static fromGraph(graph, engine, options = {}) {
    const vg = new VisualGraph();
    const pr = engine.pageRank();
    const prMap = new Map(pr.map(p => [p.rid, p.score]));

    // 节点
    for (const rid of graph.getNodeIds()) {
      const node = graph.nodes.get(rid);
      const deg = graph.degree(rid);
      const incoming = graph.incoming(rid).length;
      const outgoing = graph.outgoing(rid).length;

      // 按度分组
      let group = 'leaf';
      if (deg >= 5) group = 'hub';
      else if (deg >= 2) group = 'connector';

      // 按入度/出度比例细分
      if (outgoing > 0 && incoming === 0) group = 'source';
      else if (incoming > 0 && outgoing === 0) group = 'sink';

      vg.addNode(rid, {
        label: (node && node.metadata && node.metadata.label) || rid,
        group,
        degree: deg,
        pageRank: Math.round((prMap.get(rid) || 0) * 10000) / 10000
      });
    }

    // 边
    for (const e of graph.allEdges()) {
      const weight = 1; // 可扩展: 基于引用次数等
      vg.addEdge(e.from, e.to, e.type, { weight });
    }

    return vg;
  }
}

module.exports = VisualGraph;
