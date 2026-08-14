/**
 * EvolutionMemory — 知识演化记忆
 *
 * Phase 5.11: 保存知识状态快照，支持时间回溯分析。
 *
 * 快照内容:
 *   - resource_count / relation_count
 *   - density / entropy / growth
 *   - 时间戳
 *
 * 用途:
 *   "我的知识库过去一年如何变化？"
 */

class EvolutionMemory {
  /**
   * @param {import('./database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * 创建快照
   * @param {object} data
   * @param {number} data.resourceCount
   * @param {number} data.relationCount
   * @param {number} [data.density]
   * @param {number} [data.entropy]
   * @param {number} [data.growth]
   * @returns {Promise<object>}
   */
  async createSnapshot(data) {
    const id = `snap_${Date.now().toString(36)}`;
    const now = Date.now();

    await this.db.run(
      `INSERT INTO knowledge_snapshots (id, created_at, resource_count, relation_count, density, entropy, growth)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, now, data.resourceCount || 0, data.relationCount || 0,
        data.density || 0, data.entropy || 0, data.growth || 0]
    );

    return { id, created_at: now, ...data };
  }

  /**
   * 列出快照历史
   * @param {{ limit?: number }} options
   */
  async list(options = {}) {
    const limit = options.limit || 20;
    const rows = await this.db.all(
      'SELECT * FROM knowledge_snapshots ORDER BY created_at DESC LIMIT ?',
      [limit]
    );

    return rows.map(r => ({
      id: r.id,
      createdAt: r.created_at,
      resourceCount: r.resource_count,
      relationCount: r.relation_count,
      density: r.density,
      entropy: r.entropy,
      growth: r.growth
    }));
  }

  /**
   * 获取最新快照
   */
  async latest() {
    const row = await this.db.get(
      'SELECT * FROM knowledge_snapshots ORDER BY created_at DESC LIMIT 1'
    );
    if (!row) return null;

    return {
      id: row.id,
      createdAt: row.created_at,
      resourceCount: row.resource_count,
      relationCount: row.relation_count,
      density: row.density,
      entropy: row.entropy,
      growth: row.growth
    };
  }

  /**
   * 比较两个快照的变化
   * @param {string} id - 旧快照 ID
   */
  async compare(id) {
    const oldSnap = await this.db.get('SELECT * FROM knowledge_snapshots WHERE id = ?', [id]);
    const newSnap = await this.db.get('SELECT * FROM knowledge_snapshots ORDER BY created_at DESC LIMIT 1');

    if (!oldSnap || !newSnap) return null;

    return {
      from: {
        id: oldSnap.id,
        createdAt: oldSnap.created_at,
        resources: oldSnap.resource_count,
        relations: oldSnap.relation_count,
        density: oldSnap.density
      },
      to: {
        id: newSnap.id,
        createdAt: newSnap.created_at,
        resources: newSnap.resource_count,
        relations: newSnap.relation_count,
        density: newSnap.density
      },
      delta: {
        resources: newSnap.resource_count - oldSnap.resource_count,
        relations: newSnap.relation_count - oldSnap.relation_count,
        density: +(newSnap.density - oldSnap.density).toFixed(3),
        elapsedDays: Math.floor((newSnap.created_at - oldSnap.created_at) / 86400000)
      }
    };
  }

  /**
   * 清理旧快照（保留最近 N 个）
   */
  async cleanup(keepCount = 50) {
    const rows = await this.db.all(
      'SELECT id FROM knowledge_snapshots ORDER BY created_at DESC'
    );

    const toDelete = rows.slice(keepCount);
    for (const r of toDelete) {
      await this.db.run('DELETE FROM knowledge_snapshots WHERE id = ?', [r.id]);
    }

    return { deleted: toDelete.length };
  }
}

module.exports = EvolutionMemory;
