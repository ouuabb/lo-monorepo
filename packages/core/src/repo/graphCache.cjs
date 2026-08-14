/**
 * GraphCache — 图缓存层
 *
 * Phase 5.4: 避免每次查询都重建全图。
 * 策略：简单缓存 + 写操作全量失效。
 */

class GraphCache {
  constructor() {
    /** @type {import('../domain/graph.cjs')|null} */
    this._graph = null;
    this._createdAt = 0;
    this._version = 0;
  }

  /**
   * 获取缓存图
   * @returns {import('../domain/graph.cjs')|null}
   */
  get() {
    return this._graph;
  }

  /**
   * 设置缓存
   */
  set(graph) {
    this._graph = graph;
    this._createdAt = Date.now();
    this._version++;
  }

  /**
   * 使缓存失效
   */
  invalidate() {
    this._graph = null;
    this._createdAt = 0;
  }

  /**
   * 是否有缓存
   */
  has() {
    return this._graph !== null;
  }

  /**
   * 缓存版本号
   */
  get version() {
    return this._version;
  }

  /**
   * 缓存创建时间
   */
  get createdAt() {
    return this._createdAt;
  }

  /**
   * 缓存统计
   */
  stats() {
    if (!this._graph) return { cached: false };
    return {
      cached: true,
      version: this._version,
      createdAt: this._createdAt,
      nodeCount: this._graph.nodeCount(),
      edgeCount: this._graph.edgeCount()
    };
  }
}

module.exports = GraphCache;
