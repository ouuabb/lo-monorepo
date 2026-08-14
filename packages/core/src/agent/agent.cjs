/**
 * Agent — 知识智能体模型
 *
 * Phase 6.5: 定义 Agent 元数据。
 *
 * Agent 类型:
 *   knowledge    — 知识分析型
 *   assistant    — 助手型
 *   observer     — 观察者型
 *   maintenance  — 维护型
 *   research     — 研究型
 */

class Agent {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {string} [opts.name]
   * @param {'knowledge'|'assistant'|'observer'|'maintenance'|'research'} [opts.type]
   * @param {string} [opts.description]
   * @param {string[]} [opts.capabilities] — 能力列表
   * @param {object[]} [opts.triggers] — [{ type: 'event'|'schedule', event?, schedule? }]
   */
  constructor({ id, name, type, description, capabilities, triggers } = {}) {
    if (!id) throw new Error('Agent must have an id');

    this.id = id;
    this.name = name || id;
    this.type = type || 'knowledge';
    this.description = description || '';
    this.capabilities = capabilities || [];
    this.triggers = triggers || [];
    this.status = 'created';
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  validate() {
    const validTypes = ['knowledge', 'assistant', 'observer', 'maintenance', 'research'];
    if (!validTypes.includes(this.type)) {
      throw new Error(`Invalid agent type: ${this.type}`);
    }
  }

  /**
   * 检查是否匹配事件
   */
  matchesEvent(eventType) {
    for (const t of this.triggers) {
      if (t.type === 'event' && t.event === eventType) return true;
    }
    return false;
  }

  /**
   * 检查是否为定时触发
   */
  get scheduleTrigger() {
    return this.triggers.find(t => t.type === 'schedule') || null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      capabilities: this.capabilities,
      triggers: this.triggers,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  static fromJSON(json) {
    const a = new Agent(json);
    a.status = json.status || 'created';
    a.createdAt = json.createdAt || Date.now();
    a.updatedAt = json.updatedAt || Date.now();
    return a;
  }
}

module.exports = Agent;
