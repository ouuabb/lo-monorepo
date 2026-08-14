/**
 * EventStore — 事件持久化
 *
 * Phase 6.2: 将事件保存到 SQLite。
 *
 * 职责:
 *   - 保存事件
 *   - 查询历史
 *   - Replay（重新执行）
 *   - 清理旧事件
 */

class EventStore {
  /**
   * @param {import('../repo/database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * 保存事件
   * @param {import('./event.cjs')} event
   */
  async save(event) {
    const id = `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    await this.db.run(
      `INSERT INTO events (id, type, source, payload, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        event.type,
        event.source,
        JSON.stringify(event.payload),
        JSON.stringify(event.metadata),
        event.timestamp
      ]
    );

    return { id };
  }

  /**
   * 查询事件历史
   * @param {{ type?: string, source?: string, limit?: number, offset?: number, since?: number }} options
   */
  async query(options = {}) {
    const { type, source, limit = 50, offset = 0, since } = options;

    let sql = 'SELECT * FROM events WHERE 1=1';
    const params = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (source) {
      sql += ' AND source = ?';
      params.push(source);
    }

    if (since) {
      sql += ' AND created_at >= ?';
      params.push(since);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await this.db.all(sql, params);

    return rows.map(r => ({
      id: r.id,
      type: r.type,
      source: r.source,
      payload: r.payload ? JSON.parse(r.payload) : null,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
      createdAt: r.created_at
    }));
  }

  /**
   * 获取单个事件
   */
  async get(id) {
    const row = await this.db.get('SELECT * FROM events WHERE id = ?', [id]);
    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      source: row.source,
      payload: row.payload ? JSON.parse(row.payload) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at
    };
  }

  /**
   * 统计事件数量
   */
  async count(type) {
    let sql = 'SELECT COUNT(*) as c FROM events';
    const params = [];

    if (type) {
      sql += ' WHERE type = ?';
      params.push(type);
    }

    const row = await this.db.get(sql, params);
    return row ? row.c : 0;
  }

  /**
   * 统计各类型事件数量
   */
  async typeStats() {
    const rows = await this.db.all(
      'SELECT type, COUNT(*) as cnt FROM events GROUP BY type ORDER BY cnt DESC'
    );
    return rows.map(r => ({ type: r.type, count: r.cnt }));
  }

  /**
   * 清理旧事件
   * @param {number} olderThan — 时间戳，早于此的事件将被删除
   */
  async cleanup(olderThan) {
    const result = await this.db.run(
      'DELETE FROM events WHERE created_at < ?',
      [olderThan]
    );
    return { deleted: result ? result.changes : 0 };
  }

  /**
   * Replay 事件（返回历史事件序列）
   * @param {{ type?: string, since?: number, until?: number, limit?: number }} options
   */
  async replay(options = {}) {
    const { type, since, until, limit = 100 } = options;

    let sql = 'SELECT * FROM events WHERE 1=1';
    const params = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (since) {
      sql += ' AND created_at >= ?';
      params.push(since);
    }

    if (until) {
      sql += ' AND created_at <= ?';
      params.push(until);
    }

    sql += ' ORDER BY created_at ASC LIMIT ?';
    params.push(limit);

    const rows = await this.db.all(sql, params);

    return rows.map(r => ({
      id: r.id,
      type: r.type,
      source: r.source,
      payload: r.payload ? JSON.parse(r.payload) : null,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
      createdAt: r.created_at
    }));
  }
}

module.exports = EventStore;
