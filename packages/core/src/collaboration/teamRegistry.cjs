/**
 * TeamRegistry — 团队注册表
 *
 * Phase 6.6: 管理 AgentTeam 的注册/查询。
 */

class TeamRegistry {
  constructor() {
    /** @type {Map<string, import('./agentTeam.cjs')>} */
    this._teams = new Map();
  }

  register(team) {
    if (this._teams.has(team.id)) {
      throw new Error(`Team '${team.id}' is already registered`);
    }
    this._teams.set(team.id, team);
  }

  remove(id) {
    this._teams.delete(id);
  }

  get(id) {
    return this._teams.get(id) || null;
  }

  list() {
    return Array.from(this._teams.values()).map(t => ({
      id: t.id,
      name: t.name,
      memberCount: t.members.length,
      strategy: t.strategy
    }));
  }

  /**
   * 获取 Agent 所属的所有团队
   */
  getTeamsByMember(agentId) {
    return Array.from(this._teams.values()).filter(t => t.hasMember(agentId));
  }
}

module.exports = TeamRegistry;
