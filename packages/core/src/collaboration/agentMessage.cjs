/**
 * AgentMessage — Agent 间消息模型
 *
 * Phase 6.6: 表示 Agent 间的通信载体。
 *
 * 消息类型:
 *   request      — 请求
 *   response     — 响应
 *   notification — 通知
 *   proposal     — 提议
 *   feedback     — 反馈
 */

class AgentMessage {
  /**
   * @param {object} opts
   * @param {string} opts.from
   * @param {string} opts.to
   * @param {'request'|'response'|'notification'|'proposal'|'feedback'} [opts.type]
   * @param {any} [opts.payload]
   * @param {number} [opts.priority] — 1-10
   * @param {string} [opts.threadId] — 对话线程 ID
   */
  constructor({ from, to, type, payload, priority, threadId } = {}) {
    if (!from) throw new Error('Message must have a sender (from)');
    if (!to) throw new Error('Message must have a receiver (to)');

    this.id = `amsg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.from = from;
    this.to = to;
    this.type = type || 'notification';
    this.payload = payload || {};
    this.priority = priority || 5;
    this.threadId = threadId || this.id;
    this.createdAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      from: this.from,
      to: this.to,
      type: this.type,
      payload: this.payload,
      priority: this.priority,
      threadId: this.threadId,
      createdAt: this.createdAt
    };
  }

  static fromJSON(json) {
    const m = new AgentMessage({ from: json.from, to: json.to });
    m.id = json.id;
    m.type = json.type;
    m.payload = json.payload || {};
    m.priority = json.priority || 5;
    m.threadId = json.threadId || m.id;
    m.createdAt = json.createdAt || Date.now();
    return m;
  }
}

module.exports = AgentMessage;
