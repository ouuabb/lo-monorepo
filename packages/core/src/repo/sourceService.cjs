const fs = require('fs-extra');
const path = require('path');

/**
 * SourceService - 管理 Resource 与内容来源之间的关联
 *
 * 每个 Resource 可以绑定一个或多个 Content Source:
 *   - local_folder:  本地目录
 *   - git_repository: Git 远程仓库（未来）
 *   - zip_archive:    ZIP 压缩包（未来）
 *   - remote_storage: 远程存储（未来）
 *
 * Resource 的身份 (RID) 独立存在，与 Content Source 解耦。
 */
class SourceService {
  /**
   * @param {import('./database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  /** 支持的来源类型 */
  static get SOURCE_TYPES() {
    return {
      LOCAL_FOLDER: 'local_folder',
      GIT_REPOSITORY: 'git_repository',
      ZIP_ARCHIVE: 'zip_archive',
      REMOTE_STORAGE: 'remote_storage',
      DATABASE: 'database'
    };
  }

  /**
   * 为 Resource 绑定一个 Content Source
   * @param {string} resourceRid
   * @param {string} sourceType - 来源类型（local_folder / git_repository 等）
   * @param {string} location - 来源位置（路径 / URL）
   * @param {object} [metadata] - 附加元数据
   * @returns {Promise<object>}
   */
  async addSource(resourceRid, sourceType, location, metadata = {}) {
    const now = Date.now();
    // 检查是否已存在（同 resource + location 不重复绑定）
    const existing = await this.db.get(
      'SELECT id FROM resource_sources WHERE resource_rid = ? AND location = ?',
      [resourceRid, location]
    );

    if (existing) {
      // 更新已有记录
      await this.db.run(
        `UPDATE resource_sources SET source_type = ?, metadata = ?, updated_at = ? WHERE id = ?`,
        [sourceType, JSON.stringify(metadata), now, existing.id]
      );
      return { id: existing.id, resource_rid: resourceRid, source_type: sourceType,
               location, metadata, updated: true };
    }

    const result = await this.db.run(
      `INSERT INTO resource_sources (resource_rid, source_type, location, enabled, sync_mode, metadata, created_at, updated_at)
       VALUES (?, ?, ?, 1, 'manual', ?, ?, ?)`,
      [resourceRid, sourceType, location, JSON.stringify(metadata), now, now]
    );

    return { id: result.lastID, resource_rid: resourceRid, source_type: sourceType,
             location, metadata, added: true };
  }

  /**
   * 绑定本地文件夹作为 Content Source
   * @param {string} resourceRid
   * @param {string} dirPath - 本地目录路径（绝对路径）
   * @param {object} [metadata]
   * @returns {Promise<object>}
   */
  async addLocalFolderSource(resourceRid, dirPath, metadata = {}) {
    if (!await fs.pathExists(dirPath)) {
      throw new Error(`目录不存在: ${dirPath}`);
    }
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`路径不是目录: ${dirPath}`);
    }

    return this.addSource(
      resourceRid,
      SourceService.SOURCE_TYPES.LOCAL_FOLDER,
      path.resolve(dirPath),
      metadata
    );
  }

  /**
   * 移除 Content Source
   * @param {string} resourceRid
   * @param {number|string} sourceIdOrLocation
   * @returns {Promise<{ removed: boolean }>}
   */
  async removeSource(resourceRid, sourceIdOrLocation) {
    // 先记录时间戳，标记受影响成员（在 FK CASCADE SET NULL 之前）
    let sourceId;
    if (typeof sourceIdOrLocation === 'number') {
      sourceId = sourceIdOrLocation;
    } else {
      const src = await this.db.get(
        'SELECT id FROM resource_sources WHERE location = ? AND resource_rid = ?',
        [sourceIdOrLocation, resourceRid]
      );
      if (src) sourceId = src.id;
    }

    if (sourceId) {
      await this.db.run(
        `UPDATE container_members SET source_deleted_at = datetime('now') WHERE source_id = ?`,
        [sourceId]
      );
    }

    let result;
    if (typeof sourceIdOrLocation === 'number') {
      result = await this.db.run(
        'DELETE FROM resource_sources WHERE id = ? AND resource_rid = ?',
        [sourceIdOrLocation, resourceRid]
      );
    } else {
      result = await this.db.run(
        'DELETE FROM resource_sources WHERE location = ? AND resource_rid = ?',
        [sourceIdOrLocation, resourceRid]
      );
    }

    return { removed: result.changes > 0 };
  }

  /**
   * 获取 Resource 的所有 Content Source
   * @param {string} resourceRid
   * @returns {Promise<Array>}
   */
  async getSources(resourceRid) {
    const rows = await this.db.all(
      'SELECT * FROM resource_sources WHERE resource_rid = ?',
      [resourceRid]
    );
    return rows.map(row => this._hydrate(row));
  }

  /**
   * 获取某个来源类型的所有记录
   * @param {string} sourceType
   * @returns {Promise<Array>}
   */
  async getByType(sourceType) {
    const rows = await this.db.all(
      'SELECT * FROM resource_sources WHERE source_type = ?',
      [sourceType]
    );
    return rows.map(row => this._hydrate(row));
  }

  /**
   * 查找通过某个 location 绑定的所有 Resource
   * @param {string} location
   * @returns {Promise<Array>}
   */
  async getByLocation(location) {
    const rows = await this.db.all(
      'SELECT * FROM resource_sources WHERE location = ?',
      [location]
    );
    return rows.map(row => this._hydrate(row));
  }

  /**
   * 获取 Resource 的所有本地文件夹来源
   * @param {string} resourceRid
   * @returns {Promise<Array>}
   */
  async getLocalFolderSources(resourceRid) {
    const rows = await this.db.all(
      'SELECT * FROM resource_sources WHERE resource_rid = ? AND source_type = ?',
      [resourceRid, SourceService.SOURCE_TYPES.LOCAL_FOLDER]
    );
    return rows.map(row => this._hydrate(row));
  }

  _hydrate(row) {
    return {
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {})
    };
  }

  /**
   * 启用 / 禁用 Content Source
   * @param {number} sourceId
   * @param {boolean} enabled
   */
  async setEnabled(sourceId, enabled) {
    const now = Date.now();
    await this.db.run(
      `UPDATE resource_sources SET enabled = ?, updated_at = ? WHERE id = ?`,
      [enabled ? 1 : 0, now, sourceId]
    );
    return { id: sourceId, enabled: !!enabled };
  }

  /**
   * 更新 Content Source 的同步模式
   * @param {number} sourceId
   * @param {'manual'|'auto'} mode
   */
  async setSyncMode(sourceId, mode) {
    const now = Date.now();
    await this.db.run(
      `UPDATE resource_sources SET sync_mode = ?, updated_at = ? WHERE id = ?`,
      [mode, now, sourceId]
    );
  }

  /**
   * 获取所有启用的 Content Source（跨所有 Resource）
   * @returns {Promise<Array>}
   */
  async getEnabledSources() {
    const rows = await this.db.all(
      `SELECT * FROM resource_sources WHERE enabled = 1`
    );
    return rows.map(row => this._hydrate(row));
  }
}

module.exports = SourceService;
