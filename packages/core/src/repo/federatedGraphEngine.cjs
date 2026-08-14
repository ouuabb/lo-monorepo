/**
 * FederatedGraphEngine — 联邦图引擎
 *
 * Phase 5.10: 合并多个 Repository 的 Graph 形成虚拟联邦图。
 *
 * 输入:
 *   多个 repo 的 SQLite 数据库路径
 *
 * 输出:
 *   统一的 FederatedGraph（nodes, edges, sources）
 *
 * 核心:
 *   不合并数据库，运行时合并 Graph 对象。
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const Graph = require('../domain/graph.cjs');
const GlobalRID = require('../domain/globalResourceId.cjs');

class FederatedGraphEngine {
  constructor() {}

  /**
   * 打开外部仓库的只读连接
   */
  _openReadOnly(dbPath) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) reject(err);
        else resolve(db);
      });
    });
  }

  /**
   * @param {import('sqlite3').Database} db
   */
  _all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * @param {import('sqlite3').Database} db
   */
  _close(db) {
    return new Promise((resolve) => {
      db.close((err) => {
        // ignore close errors
        resolve();
      });
    });
  }

  /**
   * 构建联邦图
   *
   * @param {Array<{ path: string, namespace: string }>} sources - 联邦仓库列表
   * @param {string} localPath - 本地仓库路径
   * @param {string} localNamespace - 本地仓库 namespace
   * @returns {Promise<{ nodes: Array, edges: Array, sources: Array, graph: Graph }>}
   */
  async buildFederatedGraph(sources, localPath, localNamespace) {
    const graph = new Graph();
    const allNodes = [];
    const allEdges = [];
    const sourceInfo = [];
    const seenEdges = new Set();

    // 1. 构建本地图
    const localDBPath = path.join(localPath, '.repo', 'database.sqlite');
    let localDB;
    try {
      localDB = await this._openReadOnly(localDBPath);
      const { nodes, edges } = await this._loadGraph(localDB, localNamespace);
      for (const n of nodes) {
        if (!graph.hasNode(n.globalId)) {
          graph.addNode(n.globalId, { name: n.name, source: localNamespace, local: true });
        }
        allNodes.push(n);
      }
      for (const e of edges) {
        const edgeKey = `${e.from}->${e.to}`;
        if (!seenEdges.has(edgeKey)) {
          graph.addEdge(e.from, e.to, { type: e.type, source: localNamespace });
          seenEdges.add(edgeKey);
        }
        allEdges.push(e);
      }
      sourceInfo.push({ namespace: localNamespace, path: localPath, type: 'local', nodeCount: nodes.length });
    } catch (e) {
      sourceInfo.push({ namespace: localNamespace, path: localPath, type: 'local', error: e.message });
    } finally {
      if (localDB) await this._close(localDB);
    }

    // 2. 加载远程图
    for (const src of sources) {
      const dbPath = path.join(src.path, '.repo', 'database.sqlite');
      let extDB;
      try {
        extDB = await this._openReadOnly(dbPath);
        const { nodes, edges } = await this._loadGraph(extDB, src.namespace);

        for (const n of nodes) {
          if (!graph.hasNode(n.globalId)) {
            graph.addNode(n.globalId, { name: n.name, source: src.namespace, local: false });
          }
          allNodes.push(n);
        }
        for (const e of edges) {
          // Don't add duplicate edges
          const edgeKey = `${e.from}->${e.to}`;
          if (!seenEdges.has(edgeKey)) {
            graph.addEdge(e.from, e.to, { type: e.type, source: src.namespace });
            seenEdges.add(edgeKey);
          }
          allEdges.push(e);
        }
        sourceInfo.push({ namespace: src.namespace, path: src.path, type: 'remote', nodeCount: nodes.length });
      } catch (e) {
        sourceInfo.push({ namespace: src.namespace, path: src.path, type: 'remote', error: e.message });
      } finally {
        if (extDB) await this._close(extDB);
      }
    }

    return {
      nodes: allNodes,
      edges: allEdges,
      sources: sourceInfo,
      graph
    };
  }

  /**
   * 从数据库加载图数据
   * @private
   */
  async _loadGraph(db, namespace) {
    // 加载资源
    const resources = await this._all(db,
      'SELECT rid, name, type, created FROM resources WHERE deleted = 0'
    );

    // 加载关系
    const relations = await this._all(db,
      `SELECT r.from_rid, r.to_rid, r.type
       FROM relations r
       WHERE r.deleted = 0`
    );

    const nodes = resources.map(r => ({
      globalId: GlobalRID.create(namespace, r.rid),
      name: r.name || r.rid,
      type: r.type || 'note',
      source: namespace,
      created: r.created,
      local: false
    }));

    const edges = relations.map(r => ({
      from: GlobalRID.create(namespace, r.from_rid),
      to: GlobalRID.create(namespace, r.to_rid),
      type: r.type || 'reference',
      source: namespace
    }));

    return { nodes, edges };
  }

  /**
   * 联邦查询：在联邦图中 BFS
   * @param {Graph} graph
   * @param {string} fromId - 起点 globalId
   * @param {number} depth - 遍历深度
   * @param {Array<string>} [sourceFilter] - 来源过滤
   * @returns {{ nodes: Array, edges: Array }}
   */
  queryFederated(graph, fromId, depth = 3, sourceFilter = null) {
    if (!graph.hasNode(fromId)) return { nodes: [], edges: [] };

    const visited = new Set();
    const resultNodes = [];
    const resultEdges = [];
    const queue = [{ rid: fromId, distance: 0 }];
    visited.add(fromId);

    const layerNodes = [];
    while (queue.length > 0 && resultNodes.length < 1000) {
      const cur = queue.shift();

      // 按来源过滤
      const nodeData = graph.nodes.get(cur.rid);
      if (nodeData && nodeData.metadata && sourceFilter && sourceFilter.length > 0) {
        const src = nodeData.metadata.source;
        if (!sourceFilter.includes(src)) continue;
      }

      layerNodes.push({ id: cur.rid, distance: cur.distance, source: nodeData ? nodeData.metadata.source : 'unknown' });

      resultNodes.push(...layerNodes);
      layerNodes.length = 0;

      if (cur.distance >= depth) continue;

      const edges = [...graph.outgoing(cur.rid), ...graph.incoming(cur.rid)];
      for (const e of edges) {
        const neighbor = e.from === cur.rid ? e.to : e.from;
        if (visited.has(neighbor)) continue;

        visited.add(neighbor);
        resultEdges.push({ from: e.from, to: e.to, type: e.type, source: e.metadata ? e.metadata.source : '' });
        queue.push({ rid: neighbor, distance: cur.distance + 1 });
      }
    }

    return { nodes: resultNodes, edges: resultEdges };
  }
}

module.exports = FederatedGraphEngine;
