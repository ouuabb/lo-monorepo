/**
 * Identity — 身份模型
 *
 * Phase 6.9: 定义系统中的主体身份，支持多类型身份。
 * 类型：user | agent | plugin | workflow | service | system
 */

class Identity {
  /**
   * @param {object} opts
   * @param {string} opts.id        — 唯一标识
   * @param {string} opts.type      — 身份类型
   * @param {string} [opts.name]    — 名称
   * @param {string} [opts.provider] — 认证提供者
   * @param {object} [opts.metadata] — 额外元数据
   */
  constructor(opts = {}) {
    this.id = opts.id || '';
    this.type = opts.type || 'user';
    this.name = opts.name || this.id;
    this.provider = opts.provider || 'local';
    this.metadata = opts.metadata || {};
  }

  /**
   * 创建用户身份
   */
  static user(id, name) {
    return new Identity({ id, type: 'user', name, provider: 'local' });
  }

  /**
   * 创建 Agent 身份
   */
  static agent(id, name) {
    return new Identity({ id: `agent:${id}`, type: 'agent', name: name || id });
  }

  /**
   * 创建插件身份
   */
  static plugin(id, name) {
    return new Identity({ id: `plugin:${id}`, type: 'plugin', name: name || id });
  }

  /**
   * 创建工作流身份
   */
  static workflow(id, name) {
    return new Identity({ id: `workflow:${id}`, type: 'workflow', name: name || id });
  }

  /**
   * 创建远程服务身份
   */
  static service(id, name) {
    return new Identity({ id: `service:${id}`, type: 'service', name: name || id, provider: 'remote' });
  }

  /**
   * 系统身份
   */
  static system() {
    return new Identity({ id: 'system', type: 'system', name: 'System', provider: 'internal' });
  }

  isUser()    { return this.type === 'user'; }
  isAgent()   { return this.type === 'agent'; }
  isPlugin()  { return this.type === 'plugin'; }
  isWorkflow(){ return this.type === 'workflow'; }
  isService() { return this.type === 'service'; }
  isSystem()  { return this.type === 'system'; }

  toJSON() {
    return { id: this.id, type: this.type, name: this.name, provider: this.provider, metadata: this.metadata };
  }

  static fromJSON(json) {
    return new Identity(json);
  }
}

module.exports = Identity;
