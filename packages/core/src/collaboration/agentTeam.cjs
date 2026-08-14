/**
 * AgentTeam — Agent 团队模型
 *
 * Phase 6.6: 定义多个 Agent 的协作团队。
 *
 * 策略:
 *   pipeline   — 流水线
 *   supervisor — 监督模式
 *   debate     — 讨论模式
 *   broadcast  — 广播模式
 */

class AgentTeam {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {string} [opts.name]
   * @param {string[]} [opts.members] — Agent ID 列表
   * @param {'pipeline'|'supervisor'|'debate'|'broadcast'} [opts.strategy]
   * @param {string} [opts.supervisorId] — 监督模式下的主管 Agent
   */
  constructor({ id, name, members, strategy, supervisorId } = {}) {
    if (!id) throw new Error('Team must have an id');

    this.id = id;
    this.name = name || id;
    this.members = members || [];
    this.strategy = strategy || 'pipeline';
    this.supervisorId = supervisorId || null;
    this.createdAt = Date.now();
  }

  /**
   * 检查是否为团队 Agent
   */
  hasMember(agentId) {
    return this.members.includes(agentId);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      members: this.members,
      strategy: this.strategy,
      supervisorId: this.supervisorId,
      createdAt: this.createdAt
    };
  }

  static fromJSON(json) {
    return new AgentTeam(json);
  }

  static get strategies() {
    return ['pipeline', 'supervisor', 'debate', 'broadcast'];
  }
}

module.exports = AgentTeam;
