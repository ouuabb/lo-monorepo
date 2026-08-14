/**
 * SemanticMemory — 语义记忆
 *
 * Phase 6.7: AI 长期语义记忆。
 *
 * 存储类型:
 *   concept     — 概念
 *   experience  — 经验
 *   preference  — 偏好
 *   pattern     — 模式
 *   insight     — 洞察
 *
 * 唯一数据源: ai_memory 表
 */

class SemanticMemory {
  /**
   * @param {object} db - Database 实例
   */
  constructor(db) {
    this._db = db;
  }

  /**
   * 保存记忆条目
   */
  async save(entry) {
    const type = entry.type || 'concept';
    const concept = entry.concept || '';
    const value = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
    const confidence = entry.confidence || 0.5;
    const tags = JSON.stringify(entry.tags || []);
    const createdAt = Date.now();

    await this._db.run(
      `INSERT INTO ai_memory (type, concept, value, confidence, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [type, concept, value, confidence, tags, createdAt]
    );

    return { type, concept, value: entry.value, confidence, tags: entry.tags || [], createdAt };
  }

  /**
   * 检索记忆
   */
  async retrieve(query, limit = 10) {
    if (!query) {
      const rows = await this._db.all(
        'SELECT * FROM ai_memory ORDER BY created_at DESC LIMIT ?', [limit]
      );
      return rows.map(r => this._hydrate(r)).reverse();
    }

    const q = `%${query.toLowerCase()}%`;
    const rows = await this._db.all(
      `SELECT * FROM ai_memory WHERE LOWER(concept) LIKE ? OR LOWER(value) LIKE ? OR LOWER(tags) LIKE ? ORDER BY created_at DESC LIMIT ?`,
      [q, q, q, limit]
    );
    return rows.map(r => this._hydrate(r));
  }

  /**
   * 按类型查询
   */
  async getByType(type, limit = 20) {
    const rows = await this._db.all(
      'SELECT * FROM ai_memory WHERE type = ? ORDER BY created_at DESC LIMIT ?', [type, limit]
    );
    return rows.map(r => this._hydrate(r));
  }

  async stats() {
    const byType = {};
    const rows = await this._db.all('SELECT type, COUNT(*) as cnt FROM ai_memory GROUP BY type');
    for (const r of rows) byType[r.type] = r.cnt;
    const total = await this._db.get('SELECT COUNT(*) as c FROM ai_memory');
    return { entryCount: total.c, byType };
  }

  _hydrate(row) {
    let value = row.value;
    try { value = JSON.parse(row.value); } catch (e) { console.error('semanticMemory: JSON parse value failed', e); }
    let tags = [];
    try { tags = JSON.parse(row.tags || '[]'); } catch (e) { console.error('semanticMemory: JSON parse tags failed', e); }
    return {
      id: row.id,
      type: row.type,
      concept: row.concept,
      value,
      confidence: row.confidence,
      tags,
      createdAt: row.created_at
    };
  }
}

module.exports = SemanticMemory;
