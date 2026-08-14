/**
 * RemoteResource — 远程资源元数据
 *
 * Phase 5.10: 远程仓库中的资源只保存引用，不保存内容。
 *
 * 与 Local Resource 的区别:
 *   Local:  有 name/path/hash/content
 *   Remote: 只有 title/source/namespace — 引用
 *
 * 用途:
 *   在本地图中关联远程资源，形成跨边界关系。
 */

class RemoteResource {
  /**
   * @param {object} options
   * @param {string} options.globalId - "namespace:localId"
   * @param {string} options.namespace
   * @param {string} options.title
   * @param {string} [options.type] - 资源类型
   * @param {string} [options.hash] - 内容 hash
   * @param {string} [options.source] - 来源 repo 路径
   * @param {number} [options.lastSync] - 上次同步时间
   */
  constructor(options = {}) {
    this.globalId = options.globalId || '';
    this.namespace = options.namespace || '';
    this.title = options.title || '';
    this.type = options.type || 'note';
    this.hash = options.hash || '';
    this.source = options.source || '';
    this.lastSync = options.lastSync || 0;
  }

  /**
   * 从数据库行解析
   */
  static fromRow(row) {
    if (!row) return null;

    let metadata = {};
    try { metadata = JSON.parse(row.metadata || '{}'); } catch {}

    return new RemoteResource({
      globalId: row.global_id,
      namespace: row.namespace,
      title: metadata.title || row.global_id || '',
      type: metadata.type || 'note',
      hash: row.hash,
      source: metadata.source || '',
      lastSync: row.updated || 0
    });
  }

  /**
   * 转为 SQL 插入用的数据
   */
  toRow() {
    return {
      global_id: this.globalId,
      namespace: this.namespace,
      metadata: JSON.stringify({
        title: this.title,
        type: this.type,
        source: this.source
      }),
      hash: this.hash,
      updated: this.lastSync
    };
  }

  toJSON() {
    return {
      globalId: this.globalId,
      namespace: this.namespace,
      title: this.title,
      type: this.type,
      hash: this.hash,
      source: this.source,
      lastSync: this.lastSync,
      local: false
    };
  }
}

module.exports = RemoteResource;
