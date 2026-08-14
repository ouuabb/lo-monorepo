/**
 * VisualizationEngine — 可视化引擎
 *
 * Phase 5.6: 将 Graph 计算层转换为可视化层。
 * 支持 full / neighborhood / type 三种视图。
 */

const VisualGraph = require('../domain/visualGraph.cjs');
const LayoutEngine = require('../domain/layoutEngine.cjs');

class VisualizationEngine {
  /**
   * @param {import('./graphEngine.cjs')} graphEngine
   */
  constructor(graphEngine) {
    this.engine = graphEngine;
  }

  /**
   * 完整图可视化
   * @param {{ layout?: string, width?: number, height?: number }} options
   * @returns {VisualGraph}
   */
  visualizeFull(options = {}) {
    const { layout = 'force', width, height } = options;
    const vg = VisualGraph.fromGraph(this.engine.graph, this.engine);
    const le = new LayoutEngine({ width, height });

    switch (layout) {
      case 'tree':   le.treeLayout(vg); break;
      case 'radial': le.radialLayout(vg); break;
      default:       le.forceLayout(vg); break;
    }

    return vg;
  }

  /**
   * 邻域视图
   * @param {string} rid - 中心节点
   * @param {{ depth?: number, layout?: string, width?: number, height?: number }} options
   * @returns {VisualGraph|null}
   */
  visualizeNeighborhood(rid, options = {}) {
    const { depth = 2, layout = 'force', width, height } = options;
    if (!this.engine.graph.hasNode(rid)) return null;

    // 提取子图
    const subGraph = this.engine.subGraph(rid, depth);

    // 子图只有 outgoing，需补充 incoming
    const mainGraph = this.engine.graph;
    const visited = new Set([rid, ...subGraph.getNodeIds()]);
    for (const nodeId of [...visited]) {
      for (const e of mainGraph.incoming(nodeId)) {
        if (!visited.has(e.from)) {
          visited.add(e.from);
        }
      }
    }

    // 重建 VisualGraph（只包含 visited 节点和它们之间的边）
    const vg = new VisualGraph();
    const pr = this.engine.pageRank();
    const prMap = new Map(pr.map(p => [p.rid, p.score]));

    for (const nodeId of visited) {
      const deg = mainGraph.degree(nodeId);
      const incoming = mainGraph.incoming(nodeId).length;
      const outgoing = mainGraph.outgoing(nodeId).length;

      let group = 'leaf';
      if (deg >= 5) group = 'hub';
      else if (deg >= 2) group = 'connector';
      if (outgoing > 0 && incoming === 0) group = 'source';
      else if (incoming > 0 && outgoing === 0) group = 'sink';

      vg.addNode(nodeId, {
        label: nodeId,
        group: nodeId === rid ? 'center' : group,
        degree: deg,
        pageRank: Math.round((prMap.get(nodeId) || 0) * 10000) / 10000
      });
    }

    for (const e of mainGraph.allEdges()) {
      if (visited.has(e.from) && visited.has(e.to)) {
        vg.addEdge(e.from, e.to, e.type, { weight: 1 });
      }
    }

    const le = new LayoutEngine({ width, height });

    switch (layout) {
      case 'radial':
        le.radialLayout(vg, { centerId: rid });
        break;
      case 'tree':
        le.treeLayout(vg, { rootId: rid });
        break;
      default:
        le.forceLayout(vg);
        break;
    }

    return vg;
  }

  /**
   * 关系类型视图（按 type 过滤）
   * @param {string} relType
   * @param {{ layout?: string, width?: number, height?: number }} options
   * @returns {VisualGraph}
   */
  visualizeByType(relType, options = {}) {
    const { layout = 'force', width, height } = options;

    // 过滤边，收集涉及的节点
    const edges = this.engine.graph.allEdges().filter(e => e.type === relType);
    const nodeSet = new Set();
    for (const e of edges) {
      nodeSet.add(e.from);
      nodeSet.add(e.to);
    }

    // 也包括孤立节点（该类型但无此类型的边）
    // 这里只显示有该类型关系的节点

    const vg = new VisualGraph();
    const pr = this.engine.pageRank();
    const prMap = new Map(pr.map(p => [p.rid, p.score]));

    for (const nodeId of nodeSet) {
      const deg = this.engine.graph.degree(nodeId);
      vg.addNode(nodeId, {
        label: nodeId,
        group: 'default',
        degree: deg,
        pageRank: Math.round((prMap.get(nodeId) || 0) * 10000) / 10000
      });
    }

    for (const e of edges) {
      vg.addEdge(e.from, e.to, e.type, { weight: 1 });
    }

    const le = new LayoutEngine({ width, height });
    if (layout === 'tree') le.treeLayout(vg);
    else if (layout === 'radial') le.radialLayout(vg);
    else le.forceLayout(vg);

    return vg;
  }

  /**
   * 统一可视化入口
   * @param {{ type?: string, rid?: string, depth?: number, layout?: string, relType?: string, width?: number, height?: number }} options
   */
  visualize(options = {}) {
    const { type = 'full', rid, depth, layout, relType, width, height } = options;

    if (type === 'neighborhood' && rid) {
      return this.visualizeNeighborhood(rid, { depth, layout, width, height });
    }
    if (type === 'relation' && relType) {
      return this.visualizeByType(relType, { layout, width, height });
    }
    return this.visualizeFull({ layout, width, height });
  }
}

module.exports = VisualizationEngine;
