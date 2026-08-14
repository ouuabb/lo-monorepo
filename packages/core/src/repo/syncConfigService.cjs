/**
 * SyncConfigService - 管理 Container Source 的同步策略
 *
 * 负责 container_sync_configs 表的 CRUD。
 * 与 sourceService（管理 Source 身份）+ containerService（管理 Member 生命周期）正交。
 */
class SyncConfigService {
  /**
   * @param {import('./database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * 获取某个 Container-Source 对的同步配置
   * @param {string} containerRid
   * @param {number} sourceId
   * @returns {Promise<object|null>}
   */
  async getConfig(containerRid, sourceId) {
    const row = await this.db.get(
      `SELECT * FROM container_sync_configs WHERE container_rid = ? AND source_id = ?`,
      [containerRid, sourceId]
    );
    return row || null;
  }

  /**
   * 获取 Container 的所有同步配置
   * @param {string} containerRid
   * @returns {Promise<Array>}
   */
  async getConfigsForContainer(containerRid) {
    return this.db.all(
      `SELECT * FROM container_sync_configs WHERE container_rid = ?`,
      [containerRid]
    );
  }

  /**
   * 设置（upsert）同步配置
   * @param {string} containerRid
   * @param {number} sourceId
   * @param {object} config - { sync_mode, delete_policy, conflict_policy, interval_ms }
   */
  async setConfig(containerRid, sourceId, config = {}) {
    const existing = await this.getConfig(containerRid, sourceId);

    if (existing) {
      await this.db.run(
        `UPDATE container_sync_configs
         SET sync_mode = ?, delete_policy = ?, conflict_policy = ?,
             interval_ms = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [
          config.sync_mode || existing.sync_mode,
          config.delete_policy || existing.delete_policy,
          config.conflict_policy || existing.conflict_policy,
          config.interval_ms ?? existing.interval_ms,
          existing.id
        ]
      );
      return { ...existing, ...config, updated: true };
    }

    const result = await this.db.run(
      `INSERT INTO container_sync_configs (container_rid, source_id, sync_mode, delete_policy, conflict_policy, interval_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        containerRid, sourceId,
        config.sync_mode || 'manual',
        config.delete_policy || 'soft',
        config.conflict_policy || 'local',
        config.interval_ms || null
      ]
    );
    return { id: result.lastID, container_rid: containerRid, source_id: sourceId,
             ...config, added: true };
  }

  /**
   * 删除同步配置
   * @param {string} containerRid
   * @param {number} sourceId
   */
  async removeConfig(containerRid, sourceId) {
    await this.db.run(
      `DELETE FROM container_sync_configs WHERE container_rid = ? AND source_id = ?`,
      [containerRid, sourceId]
    );
    return { removed: true };
  }
}

module.exports = SyncConfigService;
