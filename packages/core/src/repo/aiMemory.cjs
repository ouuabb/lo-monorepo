/**
 * AIMemory — AI 分析缓存
 *
 * Phase 5.8: 缓存 AI 分析结果，避免重复计算/调用。
 * 保存 summaries、分析记录、用户确认结果。
 */

class AIMemory {
  /**
   * @param {import('./database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * 保存记忆
   * @param {{ rid?: string, type: string, content: object }} data
   */
  async save(data) {
    const result = await this.db.run(
      `INSERT INTO ai_memory (type, resource_rid, value, created_at) VALUES (?, ?, ?, ?)`,
      [data.type, data.rid || null, JSON.stringify(data.content), Date.now()]
    );
    return result.lastID;
  }

  /**
   * 获取资源相关记忆
   * @param {string} rid
   * @param {{ type?: string, limit?: number }} options
   */
  async getByResource(rid, options = {}) {
    const { type, limit = 20 } = options;
    let sql = 'SELECT * FROM ai_memory WHERE resource_rid = ?';
    const params = [rid];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = await this.db.all(sql, params);
    return rows.map(r => this._parse(r));
  }

  /**
   * 获取指定类型的记忆
   * @param {string} type
   */
  async getByType(type) {
    const rows = await this.db.all(
      'SELECT * FROM ai_memory WHERE type = ? ORDER BY created_at DESC LIMIT 100',
      [type]
    );
    return rows.map(r => this._parse(r));
  }

  /**
   * 删除旧记忆
   * @param {number} olderThan - timestamp
   */
  async cleanup(olderThan) {
    await this.db.run('DELETE FROM ai_memory WHERE created_at < ?', [olderThan]);
  }

  /** @private */
  _parse(row) {
    return {
      id: row.id,
      rid: row.resource_rid,
      type: row.type,
      content: this._json(row.value),
      created: row.created_at
    };
  }

  /** @private */
  _json(str) {
    try { return JSON.parse(str || '{}'); } catch { return {}; }
  }
}

module.exports = AIMemory;
