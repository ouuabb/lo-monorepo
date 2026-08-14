/**
 * GraphEngine — 图算法引擎
 *
 * Phase 5.3: 纯计算层，不依赖数据库。
 * 输入: Graph 实例
 * 输出: 算法结果
 */

class GraphEngine {
  /**
   * @param {import('../domain/graph.cjs')} graph
   */
  constructor(graph) {
    this.graph = graph;
  }

  /**
   * 邻居查询（出边目标 + 入边来源，去重）
   */
  neighbors(rid) {
    return this.graph.neighbors(rid);
  }

  /**
   * 上游查询：谁指向我
   */
  incoming(rid) {
    return this.graph.incoming(rid).map(e => e.from);
  }

  /**
   * 下游查询：我指向谁
   */
  outgoing(rid) {
    return this.graph.outgoing(rid).map(e => e.to);
  }

  /**
   * BFS 最短路径
   * @param {string} from
   * @param {string} to
   * @returns {{ path: string[], length: number } | null}
   */
  findPath(from, to) {
    if (!this.graph.hasNode(from) || !this.graph.hasNode(to)) {
      return null;
    }
    if (from === to) return { path: [from], length: 0 };

    const visited = new Set([from]);
    const parent = new Map();
    const queue = [from];

    while (queue.length > 0) {
      const current = queue.shift();
      const edges = this.graph.outgoing(current);

      for (const e of edges) {
        if (visited.has(e.to)) continue;
        visited.add(e.to);
        parent.set(e.to, current);

        if (e.to === to) {
          // 回溯路径
          const path = [];
          let node = to;
          while (node !== undefined) {
            path.unshift(node);
            node = parent.get(node);
          }
          return { path, length: path.length - 1 };
        }

        queue.push(e.to);
      }
    }

    return null;
  }

  /**
   * 判断两个节点是否可达
   */
  isReachable(from, to) {
    return this.findPath(from, to) !== null;
  }

  /**
   * 获取所有下游可达节点（DFS）
   * @returns {string[]}
   */
  reachable(rid) {
    if (!this.graph.hasNode(rid)) return [];
    const visited = new Set();
    const stack = [rid];
    visited.add(rid);

    while (stack.length > 0) {
      const current = stack.pop();
      for (const e of this.graph.outgoing(current)) {
        if (!visited.has(e.to)) {
          visited.add(e.to);
          stack.push(e.to);
        }
      }
    }

    return Array.from(visited).filter(n => n !== rid);
  }

  /**
   * 获取所有上游来源节点
   * @returns {string[]}
   */
  ancestors(rid) {
    if (!this.graph.hasNode(rid)) return [];
    const visited = new Set();
    const stack = [rid];
    visited.add(rid);

    while (stack.length > 0) {
      const current = stack.pop();
      for (const e of this.graph.incoming(current)) {
        if (!visited.has(e.from)) {
          visited.add(e.from);
          stack.push(e.from);
        }
      }
    }

    return Array.from(visited).filter(n => n !== rid);
  }

  /**
   * 检测所有环（DFS）
   * @returns {Array<Array<string>>} 环列表，每个环是节点路径
   */
  detectCycles() {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    const parent = new Map();
    const cycles = [];

    for (const rid of this.graph.getNodeIds()) {
      color.set(rid, WHITE);
    }

    const dfs = (node) => {
      color.set(node, GRAY);

      for (const e of this.graph.outgoing(node)) {
        const neighbor = e.to;

        if (color.get(neighbor) === GRAY) {
          // 找到环：回溯
          const cycle = [neighbor, node];
          let p = parent.get(node);
          while (p && p !== neighbor) {
            cycle.push(p);
            p = parent.get(p);
          }
          cycle.reverse();
          cycles.push(cycle);
        } else if (color.get(neighbor) === WHITE) {
          parent.set(neighbor, node);
          dfs(neighbor);
        }
      }

      color.set(node, BLACK);
    };

    for (const rid of this.graph.getNodeIds()) {
      if (color.get(rid) === WHITE) {
        dfs(rid);
      }
    }

    return cycles;
  }

  /**
   * Phase 5.4: PageRank 算法
   * @param {{ iterations?: number, damping?: number }} options
   * @returns {Array<{ rid: string, score: number }>} 按分数降序
   */
  pageRank(options = {}) {
    const { iterations = 20, damping = 0.85 } = options;
    const nodeIds = this.graph.getNodeIds();
    const N = nodeIds.length;

    if (N === 0) return [];

    // 初始化
    const pr = new Map();
    for (const rid of nodeIds) {
      pr.set(rid, 1 / N);
    }

    // 迭代
    for (let iter = 0; iter < iterations; iter++) {
      const newPr = new Map();
      const base = (1 - damping) / N;

      for (const rid of nodeIds) {
        let sum = 0;
        for (const e of this.graph.incoming(rid)) {
          const outDeg = this.graph.outgoing(e.from).length;
          if (outDeg > 0) {
            sum += pr.get(e.from) / outDeg;
          }
        }
        newPr.set(rid, base + damping * sum);
      }

      // 更新
      for (const [rid, score] of newPr) {
        pr.set(rid, score);
      }
    }

    // 排序返回
    return Array.from(pr.entries())
      .map(([rid, score]) => ({ rid, score: Math.round(score * 10000) / 10000 }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Phase 5.4: 中心节点发现（按度排序）
   * @param {number} topN
   */
  centralNodes(topN = 10) {
    return this.graph.getNodeIds()
      .map(rid => ({
        rid,
        degree: this.graph.degree(rid),
        incoming: this.graph.incoming(rid).length,
        outgoing: this.graph.outgoing(rid).length
      }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, topN);
  }

  /**
   * Phase 5.4: 孤立节点检测
   * @returns {string[]} degree == 0 的节点
   */
  isolatedNodes() {
    return this.graph.getNodeIds().filter(rid => this.graph.degree(rid) === 0);
  }

  /**
   * Phase 5.4: 连通分量（聚簇分析）
   * @returns {Array<{ id: number, size: number, nodes: string[] }>}
   */
  clusters() {
    const visited = new Set();
    const results = [];
    let clusterId = 0;

    for (const rid of this.graph.getNodeIds()) {
      if (visited.has(rid)) continue;

      // BFS
      const cluster = [];
      const queue = [rid];
      visited.add(rid);

      while (queue.length > 0) {
        const current = queue.shift();
        cluster.push(current);

        // 邻居（双向）
        const neighbors = this.graph.neighbors(current);
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }

      results.push({
        id: ++clusterId,
        size: cluster.length,
        nodes: cluster
      });
    }

    return results.sort((a, b) => b.size - a.size);
  }

  /**
   * 子图：以 rid 为根，深度限制
   * @param {string} rid
   * @param {number} depth
   * @returns {import('../domain/graph.cjs')}
   */
  subGraph(rid, depth = 2) {
    const Graph = require('../domain/graph.cjs');
    const g = new Graph();

    if (!this.graph.hasNode(rid)) return g;

    const visited = new Set([rid]);
    g.addNode(rid, this.graph.nodes.get(rid)?.metadata);
    const queue = [{ rid, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.depth >= depth) continue;

      for (const e of this.graph.outgoing(current.rid)) {
        g.addEdge(e.from, e.to, e.type, e.metadata);
        if (!visited.has(e.to)) {
          visited.add(e.to);
          g.addNode(e.to, this.graph.nodes.get(e.to)?.metadata);
          queue.push({ rid: e.to, depth: current.depth + 1 });
        }
      }
    }

    return g;
  }

  /**
   * 统计信息
   */
  stats() {
    const nodeCount = this.graph.nodeCount();
    const edgeCount = this.graph.edgeCount();
    const degrees = this.graph.getNodeIds().map(n => this.graph.degree(n));

    return {
      nodeCount,
      edgeCount,
      maxDegree: degrees.length > 0 ? Math.max(...degrees) : 0,
      avgDegree: degrees.length > 0
        ? Math.round((degrees.reduce((a, b) => a + b, 0) / degrees.length) * 100) / 100
        : 0,
      cycles: this.detectCycles().length
    };
  }
}

module.exports = GraphEngine;
