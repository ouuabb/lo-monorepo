/**
 * SharedMemory — 共享记忆
 *
 * Phase 6.6: 所有 Agent 可访问的共享存储。
 *
 * 存储类型:
 *   knowledge    — 知识
 *   decision     — 决策
 *   conversation — 对话
 *   result       — 结果
 *
 * 作用域: team | team.task | global
 *
 * 唯一数据源: shared_memory 表
 */

class SharedMemory {
  /**
   * @param {object} db - Database 实例
   */
  constructor(db) {
    this._db = db;
  }

  /**
   * 写入共享记忆
   * @param {{ scope: string, type: string, content: any, owner?: string, visibility?: string }} entry
   */
  async write({ scope, type, content, owner, visibility }) {
    const entryId = `sm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const scopeVal = scope || 'team';
    const typeVal = type || 'knowledge';
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const ownerVal = owner || 'system';
    const visibilityVal = visibility || 'all';
    const createdAt = Date.now();

    await this._db.run(
      `INSERT INTO shared_memory (entry_id, scope, type, content, owner, visibility, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entryId, scopeVal, typeVal, contentStr, ownerVal, visibilityVal, createdAt]
    );

    return {
      id: entryId,
      scope: scopeVal,
      type: typeVal,
      content,
      owner: ownerVal,
      visibility: visibilityVal,
      createdAt
    };
  }

  /**
   * 查询共享记忆
   */
  async read({ scope, type, limit = 20 }) {
    let sql = 'SELECT * FROM shared_memory WHERE 1=1';
    const params = [];

    if (scope) {
      sql += ' AND scope LIKE ?';
      params.push(`${scope}%`);
    }
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = await this._db.all(sql, params);
    return rows.map(r => this._hydrate(r));
  }

  /**
   * 清空
   */
  async clear(scope) {
    if (scope) {
      await this._db.run('DELETE FROM shared_memory WHERE scope LIKE ?', [`${scope}%`]);
    } else {
      await this._db.run('DELETE FROM shared_memory');
    }
  }

  /**
   * 统计
   */
  async stats() {
    const total = await this._db.get('SELECT COUNT(*) as c FROM shared_memory');
    const scopes = await this._db.get('SELECT COUNT(DISTINCT scope) as c FROM shared_memory');
    return { entryCount: total.c, scopeCount: scopes.c };
  }

  _hydrate(row) {
    let content = row.content;
    try { content = JSON.parse(row.content); } catch (e) { console.error('sharedMemory: JSON parse content failed', e); }
    return {
      id: row.entry_id,
      scope: row.scope,
      type: row.type,
      content,
      owner: row.owner,
      visibility: row.visibility,
      createdAt: row.created_at
    };
  }
}

module.exports = SharedMemory;
