/**
 * Event — 事件模型
 *
 * Phase 6.2: 统一事件数据结构。
 *
 * 结构:
 *   type      — 事件类型 (domain.action)
 *   payload   — 事件数据
 *   source    — 来源模块
 *   timestamp — 发生时间戳
 *   metadata  — 附加元信息
 */

class Event {
  /**
   * @param {object} opts
   * @param {string} opts.type
   * @param {any} opts.payload
   * @param {string} [opts.source]
   * @param {number} [opts.timestamp]
   * @param {object} [opts.metadata]
   */
  constructor({ type, payload, source, timestamp, metadata } = {}) {
    if (!type) throw new Error('Event must have a type');

    this.type = type;
    this.payload = payload;
    this.source = source || 'system';
    this.timestamp = timestamp || Date.now();
    this.metadata = metadata || {};
  }

  /**
   * 序列化为 JSON
   */
  toJSON() {
    return {
      type: this.type,
      payload: this.payload,
      source: this.source,
      timestamp: this.timestamp,
      metadata: this.metadata
    };
  }

  /**
   * 从 JSON 还原
   */
  static fromJSON(json) {
    return new Event({
      type: json.type,
      payload: typeof json.payload === 'string' ? JSON.parse(json.payload) : json.payload,
      source: json.source,
      timestamp: json.timestamp,
      metadata: json.metadata
    });
  }

  /**
   * domain.action 的 domain 部分
   */
  get domain() {
    return this.type.split('.')[0] || '';
  }

  /**
   * domain.action 的 action 部分
   */
  get action() {
    return this.type.split('.')[1] || '';
  }
}

module.exports = Event;
