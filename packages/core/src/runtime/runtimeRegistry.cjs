/**
 * RuntimeRegistry — Runtime 对象注册中心
 *
 * Phase 6.10: 管理 Resource/Agent/Workflow/Plugin 的运行时实例。
 */

class RuntimeRegistry {
  constructor() {
    this._resources = new Map();  // rid → ResourceRuntime
    this._agents = new Map();     // agentId → AgentInstance
    this._workflows = new Map();  // wfId → WorkflowInstance
    this._plugins = new Map();    // pluginId → PluginInstance
  }

  // ─── Resource ─────────────────────────────────────────

  registerResource(rid, instance) {
    this._resources.set(rid, instance);
  }

  getResource(rid) {
    return this._resources.get(rid) || null;
  }

  unregisterResource(rid) {
    return this._resources.delete(rid);
  }

  get resources() {
    return Array.from(this._resources.values());
  }

  // ─── Agent ────────────────────────────────────────────

  registerAgent(id, instance) {
    this._agents.set(id, instance);
  }

  getAgent(id) {
    return this._agents.get(id) || null;
  }

  unregisterAgent(id) {
    return this._agents.delete(id);
  }

  get agents() {
    return Array.from(this._agents.values());
  }

  // ─── Workflow ─────────────────────────────────────────

  registerWorkflow(id, instance) {
    this._workflows.set(id, instance);
  }

  getWorkflow(id) {
    return this._workflows.get(id) || null;
  }

  unregisterWorkflow(id) {
    return this._workflows.delete(id);
  }

  get workflows() {
    return Array.from(this._workflows.values());
  }

  // ─── Plugin ───────────────────────────────────────────

  registerPlugin(id, instance) {
    this._plugins.set(id, instance);
  }

  getPlugin(id) {
    return this._plugins.get(id) || null;
  }

  unregisterPlugin(id) {
    return this._plugins.delete(id);
  }

  get plugins() {
    return Array.from(this._plugins.values());
  }

  // ─── Stats ────────────────────────────────────────────

  stats() {
    return {
      resources: this._resources.size,
      agents:    this._agents.size,
      workflows: this._workflows.size,
      plugins:   this._plugins.size,
      total:     this._resources.size + this._agents.size + this._workflows.size + this._plugins.size
    };
  }

  clear() {
    this._resources.clear();
    this._agents.clear();
    this._workflows.clear();
    this._plugins.clear();
  }
}

module.exports = RuntimeRegistry;
