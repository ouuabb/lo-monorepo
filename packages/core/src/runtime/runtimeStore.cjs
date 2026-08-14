/**
 * RuntimeStore — Runtime 状态持久化
 *
 * Phase 6.10: 持久化 Runtime 实例、事件和状态到数据库。
 */

class RuntimeStore {
  constructor(db) {
    this.db = db;
  }

  /**
   * 保存 Runtime 实例
   */
  async saveInstance(instance) {
    const id = instance.id;
    const type = instance.type || 'unknown';
    const state = JSON.stringify(instance.state || {});
    const now = Date.now();

    await this.db.run(
      `INSERT OR REPLACE INTO runtime_instances (id, type, state, updated_at, created_at)
       VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM runtime_instances WHERE id = ?), ?))`,
      [id, type, state, now, id, now]
    );
  }

  /**
   * 获取 Runtime 实例
   */
  async getInstance(id) {
    try {
      return await this.db.get('SELECT * FROM runtime_instances WHERE id = ?', [id]);
    } catch {
      return null;
    }
  }

  /**
   * 获取所有实例
   */
  async listInstances(type) {
    try {
      if (type) {
        return await this.db.all('SELECT * FROM runtime_instances WHERE type = ?', [type]);
      }
      return await this.db.all('SELECT * FROM runtime_instances');
    } catch {
      return [];
    }
  }

  /**
   * 删除实例
   */
  async deleteInstance(id) {
    await this.db.run('DELETE FROM runtime_instances WHERE id = ?', [id]);
  }

  /**
   * 保存 Runtime 事件
   */
  async saveEvent(event) {
    const id = event.id || this._newId();
    const runtimeId = event.runtimeId || '';
    const type = event.event || event.type;
    const payload = JSON.stringify(event.payload || {});

    await this.db.run(
      'INSERT INTO runtime_events (id, runtime_id, event, payload, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, runtimeId, type, payload, Date.now()]
    );
  }

  /**
   * 获取 Runtime 事件
   */
  async getEvents(options = {}) {
    const conditions = [];
    const params = [];

    if (options.runtimeId) { conditions.push('runtime_id = ?'); params.push(options.runtimeId); }
    if (options.since)     { conditions.push('created_at > ?'); params.push(options.since); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 100;

    try {
      return await this.db.all(
        `SELECT * FROM runtime_events ${where} ORDER BY created_at DESC LIMIT ?`,
        [...params, limit]
      );
    } catch {
      return [];
    }
  }

  /**
   * 保存全局状态
   */
  async saveState(key, value) {
    await this.db.run(
      'INSERT OR REPLACE INTO runtime_state (key, value, updated_at) VALUES (?, ?, ?)',
      [key, JSON.stringify(value), Date.now()]
    );
  }

  /**
   * 获取全局状态
   */
  async getState(key) {
    try {
      const row = await this.db.get('SELECT value FROM runtime_state WHERE key = ?', [key]);
      return row ? JSON.parse(row.value) : null;
    } catch {
      return null;
    }
  }

  /**
   * 统计
   */
  async stats() {
    try {
      const instanceCount = await this.db.get('SELECT COUNT(*) as count FROM runtime_instances');
      const eventCount = await this.db.get('SELECT COUNT(*) as count FROM runtime_events');
      return {
        instances: instanceCount ? instanceCount.count : 0,
        events:    eventCount ? eventCount.count : 0
      };
    } catch {
      return { instances: 0, events: 0 };
    }
  }

  _newId() {
    const crypto = require('crypto');
    return `rte_${crypto.randomBytes(8).toString('hex')}`;
  }
}

module.exports = RuntimeStore;
