/**
 * AgentMemory — Agent 记忆
 *
 * Phase 6.5: 记录 Agent 的观察、决策、行动和结果。
 *
 * Memory 类型:
 *   observation — 观察
 *   decision    — 决策
 *   action      — 行动
 *   result      — 结果
 */

class AgentMemory {
  /**
   * @param {import('../repo/database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * 保存记忆
   */
  async save({ agentId, type, content }) {
    if (!this.db || !this.db.run) return null;

    try {
      const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await this.db.run(
        `INSERT INTO agent_memory (id, agent_id, type, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, agentId, type, JSON.stringify(content), Date.now()]
      );
      return { id };
    } catch (e) {
      // Table may not exist yet
      return null;
    }
  }

  /**
   * 获取最近记忆
   */
  async getRecent(agentId, limit = 10) {
    if (!this.db || !this.db.all) return [];

    try {
      const rows = await this.db.all(
        'SELECT * FROM agent_memory WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?',
        [agentId, limit]
      );
      return rows.map(r => ({
        id: r.id,
        agentId: r.agent_id,
        type: r.type,
        content: r.content ? JSON.parse(r.content) : null,
        createdAt: r.created_at
      }));
    } catch {
      return [];
    }
  }

  /**
   * 按类型查询
   */
  async getByType(agentId, type, limit = 20) {
    if (!this.db || !this.db.all) return [];

    try {
      const rows = await this.db.all(
        'SELECT * FROM agent_memory WHERE agent_id = ? AND type = ? ORDER BY created_at DESC LIMIT ?',
        [agentId, type, limit]
      );
      return rows.map(r => ({
        id: r.id,
        agentId: r.agent_id,
        type: r.type,
        content: r.content ? JSON.parse(r.content) : null,
        createdAt: r.created_at
      }));
    } catch {
      return [];
    }
  }
}

module.exports = AgentMemory;
