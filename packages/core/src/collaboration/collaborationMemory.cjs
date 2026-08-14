/**
 * CollaborationMemory — 协作历史记忆
 *
 * Phase 6.6: 记录团队、消息、任务的历史。
 */

class CollaborationMemory {
  /**
   * @param {import('../repo/database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  /** 保存消息 */
  async saveMessage(message) {
    if (!this.db || !this.db.run) return;
    try {
      const payload = (typeof message.payload === 'object' ? JSON.stringify(message.payload) : String(message.payload));
      await this.db.run(
        `INSERT OR REPLACE INTO agent_messages (id, from_agent, to_agent, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [message.id, message.from, message.to, message.type, payload, message.createdAt]
      );
    } catch (e) { console.error('collaborationMemory: save message failed', e); }
  }

  /** 查询消息 */
  async getMessages(agentId, limit = 20) {
    if (!this.db || !this.db.all) return [];
    try {
      const rows = await this.db.all(
        `SELECT * FROM agent_messages WHERE from_agent = ? OR to_agent = ? OR to_agent = '*' ORDER BY created_at DESC LIMIT ?`,
        [agentId, agentId, limit]
      );
      return rows.map(r => ({
        id: r.id, from: r.from_agent, to: r.to_agent,
        type: r.type, payload: r.payload ? this._parsePayload(r.payload) : null,
        createdAt: r.created_at
      }));
    } catch { return []; }
  }

  _parsePayload(payload) {
    try { return JSON.parse(payload); } catch { return payload; }
  }

  /** 保存团队 */
  async saveTeam(team) {
    if (!this.db || !this.db.run) return;
    try {
      await this.db.run(
        `INSERT OR REPLACE INTO agent_teams (id, name, strategy) VALUES (?, ?, ?)`,
        [team.id, team.name, team.strategy]
      );
    } catch (e) { console.error('collaborationMemory: save team failed', e); }
  }

  /** 列出团队 */
  async listTeams() {
    if (!this.db || !this.db.all) return [];
    try {
      const rows = await this.db.all('SELECT * FROM agent_teams ORDER BY rowid');
      return rows.map(r => ({ id: r.id, name: r.name, strategy: r.strategy }));
    } catch { return []; }
  }

  /** 保存任务 */
  async saveTask(task) {
    if (!this.db || !this.db.run) return;
    try {
      const result = task.result ? JSON.stringify(task.result) : null;
      await this.db.run(
        `INSERT OR REPLACE INTO agent_tasks (id, team_id, goal, status, result) VALUES (?, ?, ?, ?, ?)`,
        [task.id, task.teamId, task.goal, task.status, result]
      );
    } catch (e) { console.error('collaborationMemory: save task failed', e); }
  }

  /** 查询任务 */
  async listTasks(teamId, limit = 20) {
    if (!this.db || !this.db.all) return [];
    try {
      let sql = 'SELECT * FROM agent_tasks';
      const params = [];
      if (teamId) { sql += ' WHERE team_id = ?'; params.push(teamId); }
      sql += ' ORDER BY rowid DESC LIMIT ?';
      params.push(limit);

      const rows = await this.db.all(sql, params);
      return rows.map(r => ({
        id: r.id, teamId: r.team_id, goal: r.goal, status: r.status,
        result: r.result ? JSON.parse(r.result) : null
      }));
    } catch { return []; }
  }
}

module.exports = CollaborationMemory;
