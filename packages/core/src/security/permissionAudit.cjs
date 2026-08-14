/**
 * PermissionAudit — 权限审计
 *
 * Phase 6.4: 记录所有权限检查结果。
 */

class PermissionAudit {
  /**
   * @param {import('../repo/database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * 记录一次检查
   */
  async record(subject, action, resource, allowed, reason) {
    const id = `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    await this.db.run(
      `INSERT INTO permission_audit (id, subject, action, resource, allowed, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, subject, action, resource || '', allowed ? 1 : 0, reason || '', Date.now()]
    );
  }

  /**
   * 查询审计日志
   */
  async query(options = {}) {
    const { subject, action, allowed, limit = 50, offset = 0, since } = options;

    let sql = 'SELECT * FROM permission_audit WHERE 1=1';
    const params = [];

    if (subject) { sql += ' AND subject = ?'; params.push(subject); }
    if (action) { sql += ' AND action = ?'; params.push(action); }
    if (allowed !== undefined) { sql += ' AND allowed = ?'; params.push(allowed ? 1 : 0); }
    if (since) { sql += ' AND created_at >= ?'; params.push(since); }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await this.db.all(sql, params);
    return rows.map(r => ({
      id: r.id,
      subject: r.subject,
      action: r.action,
      resource: r.resource,
      allowed: r.allowed === 1,
      reason: r.reason,
      createdAt: r.created_at
    }));
  }

  /**
   * 统计拒绝次数
   */
  async deniedStats() {
    const rows = await this.db.all(
      `SELECT subject, action, COUNT(*) as cnt
       FROM permission_audit WHERE allowed = 0
       GROUP BY subject, action ORDER BY cnt DESC LIMIT 20`
    );
    return rows.map(r => ({ subject: r.subject, action: r.action, count: r.cnt }));
  }
}

module.exports = PermissionAudit;
