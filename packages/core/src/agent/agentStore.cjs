/**
 * AgentStore — Agent 持久化
 *
 * Phase 6.5: 保存/查询 Agent 定义和运行记录。
 */

class AgentStore {
  /**
   * @param {import('../repo/database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  async saveAgent(agent) {
    try {
      await this.db.run(
        `INSERT OR REPLACE INTO agents (id, name, type, status, config, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [agent.id, agent.name, agent.type, agent.status,
         JSON.stringify(agent.toJSON()), agent.createdAt, agent.updatedAt]
      );
    } catch (e) {
      // Table may not exist
    }
  }

  async getAgent(id) {
    try {
      const row = await this.db.get('SELECT * FROM agents WHERE id = ?', [id]);
      if (!row) return null;
      return row.config ? JSON.parse(row.config) : null;
    } catch { return null; }
  }

  async listAgents() {
    try {
      const rows = await this.db.all('SELECT id, name, type, status, created_at FROM agents ORDER BY created_at');
      return rows.map(r => ({
        id: r.id, name: r.name, type: r.type, status: r.status, createdAt: r.created_at
      }));
    } catch { return []; }
  }

  async saveRun(run) {
    try {
      await this.db.run(
        `INSERT INTO agent_runs (id, agent_id, status, input, output, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [run.id, run.agentId, run.status,
         JSON.stringify(run.input), JSON.stringify(run.output), run.createdAt]
      );
    } catch (e) { console.error('agentStore: save run failed', e); }
  }

  async listRuns(agentId, limit = 20) {
    try {
      let sql = 'SELECT * FROM agent_runs';
      const params = [];
      if (agentId) { sql += ' WHERE agent_id = ?'; params.push(agentId); }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const rows = await this.db.all(sql, params);
      return rows.map(r => ({
        id: r.id,
        agentId: r.agent_id,
        status: r.status,
        input: r.input ? JSON.parse(r.input) : null,
        output: r.output ? JSON.parse(r.output) : null,
        createdAt: r.created_at
      }));
    } catch { return []; }
  }
}

module.exports = AgentStore;
