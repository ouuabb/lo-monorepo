/**
 * Subject — 权限主体
 *
 * Phase 6.4: 定义权限执行者。
 *
 * 类型: user | plugin | workflow | agent
 */

class Subject {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {string} [opts.type] — user|plugin|workflow|agent
   * @param {object} [opts.attributes]
   */
  constructor({ id, type, attributes } = {}) {
    if (!id) throw new Error('Subject must have an id');

    this.id = id;
    this.type = type || 'user';
    this.attributes = attributes || {};
  }

  /**
   * 当前默认用户
   */
  static currentUser() {
    return new Subject({
      id: 'current-user',
      type: 'user',
      attributes: { trusted: true }
    });
  }

  /**
   * 创建一个 AI Agent Subject
   */
  static aiAgent(agentId = 'ai-agent') {
    return new Subject({
      id: agentId,
      type: 'agent',
      attributes: { trusted: true }
    });
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      attributes: this.attributes
    };
  }

  static fromJSON(json) {
    return new Subject(json);
  }
}

module.exports = Subject;
