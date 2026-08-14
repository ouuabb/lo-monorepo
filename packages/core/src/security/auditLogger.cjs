/**
 * AuditLogger — 审计日志
 *
 * Phase 6.9: 增强版审计日志，支持结构化查询和统计分析。
 */

class AuditLogger {
  constructor(db) {
    this.db = db;
  }

  /**
   * 记录审计日志
   * @param {object} entry
   * @param {string} entry.actor
   * @param {string} entry.action
   * @param {string} [entry.resource]
   * @param {string} [entry.result] — granted|denied|error
   * @param {string} [entry.reason]
   * @param {object} [entry.metadata]
   */
  async log(entry = {}) {
    const id = this._newId();
    const actor = entry.actor || 'unknown';
    const action = entry.action || '';
    const resource = entry.resource || '';
    const result = entry.result || '';
    const reason = entry.reason || '';
    const metadata = entry.metadata ? JSON.stringify(entry.metadata) : '{}';
    const timestamp = Date.now();

    try {
      await this.db.run(
        `INSERT INTO security_audit (id, actor, action, resource, result, reason, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, actor, action, resource, result, reason, metadata, timestamp]
      );
    } catch (e) {
      // 审计日志写入失败不应阻塞业务
      console.error(`[audit] failed to log: ${e.message}`);
    }
  }

  /**
   * 查询审计日志
   * @param {object} options
   * @param {string} [options.actor]
   * @param {string} [options.action]
   * @param {string} [options.result] — granted|denied
   * @param {number} [options.since]  — 时间戳
   * @param {number} [options.limit]  — 默认 100
   */
  async query(options = {}) {
    const conditions = [];
    const params = [];

    if (options.actor) { conditions.push('actor = ?'); params.push(options.actor); }
    if (options.action) { conditions.push('action = ?'); params.push(options.action); }
    if (options.result) { conditions.push('result = ?'); params.push(options.result); }
    if (options.since) { conditions.push('created_at > ?'); params.push(options.since); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 100;

    try {
      return await this.db.all(
        `SELECT * FROM security_audit ${where} ORDER BY created_at DESC LIMIT ?`,
        [...params, limit]
      );
    } catch {
      return [];
    }
  }

  /**
   * 拒绝统计
   */
  async deniedStats(since) {
    try {
      const rows = await this.db.all(
        `SELECT actor, action, COUNT(*) as count
         FROM security_audit
         WHERE result = 'denied' AND created_at > ?
         GROUP BY actor, action
         ORDER BY count DESC
         LIMIT 20`,
        [since || (Date.now() - 86400000)]
      );
      return rows;
    } catch {
      return [];
    }
  }

  /**
   * 异常检测：短时间内大量拒绝
   */
  async detectAnomalies(threshold = 10, windowMs = 60000) {
    const since = Date.now() - windowMs;
    try {
      const rows = await this.db.all(
        `SELECT actor, COUNT(*) as count
         FROM security_audit
         WHERE result = 'denied' AND created_at > ?
         GROUP BY actor
         HAVING count > ?`,
        [since, threshold]
      );
      return rows;
    } catch {
      return [];
    }
  }

  _newId() {
    const crypto = require('crypto');
    return `audit_${crypto.randomBytes(8).toString('hex')}`;
  }
}

module.exports = AuditLogger;
