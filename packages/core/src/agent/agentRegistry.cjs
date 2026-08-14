/**
 * AgentRegistry — Agent 注册表
 *
 * Phase 6.5: 管理 Agent ID → Agent Instance 映射。
 */

class AgentRegistry {
  constructor() {
    /** @type {Map<string, import('./agent.cjs')>} */
    this._agents = new Map();
  }

  register(agent) {
    if (this._agents.has(agent.id)) {
      throw new Error(`Agent '${agent.id}' is already registered`);
    }
    agent.validate();
    this._agents.set(agent.id, agent);
  }

  remove(id) {
    this._agents.delete(id);
  }

  get(id) {
    return this._agents.get(id) || null;
  }

  list() {
    return Array.from(this._agents.values()).map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      description: a.description,
      status: a.status,
      capabilityCount: a.capabilities.length
    }));
  }

  getAllAgents() {
    return Array.from(this._agents.values());
  }

  count() {
    return this._agents.size;
  }
}

module.exports = AgentRegistry;
