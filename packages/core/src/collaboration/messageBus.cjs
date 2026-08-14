/**
 * MessageBus — Agent 消息总线
 *
 * Phase 6.6: 负责 Agent 间消息路由。
 *
 * API:
 *   send(message)           — 发送消息
 *   broadcast(from, type, payload) — 广播
 *   subscribe(agentId, handler)     — 订阅消息
 *   getMessages(agentId, limit)     — 查询消息历史
 */

class MessageBus {
  /**
   * @param {object} [options]
   * @param {import('./collaborationMemory.cjs')} [options.memory]
   * @param {import('../event/eventBus.cjs')} [options.eventBus]
   */
  constructor(options = {}) {
    this.memory = options.memory || null;
    this.eventBus = options.eventBus || null;
    /** @type {Map<string, Function[]>} agentId → handlers */
    this._subscribers = new Map();
  }

  /**
   * 发送消息（点对点）
   */
  send(message) {
    const deliver = () => this._emitAndDeliver(message);
    // 持久化（可能异步）：若 saveMessage 返回 Promise 则等待落库后再交付，避免发送后立即查询的竞态
    const save = this.memory ? this.memory.saveMessage(message) : null;
    if (save && typeof save.then === 'function') {
      return save.then(deliver);
    }
    deliver();
    return undefined;
  }

  /** 事件发布 + 订阅者通知（发送的同步副作用） */
  _emitAndDeliver(message) {
    // 发布事件
    if (this.eventBus) {
      try {
        this.eventBus.emit({
          type: 'agent.message.sent',
          payload: { from: message.from, to: message.to, type: message.type },
          source: 'messagebus'
        });
      } catch (e) { console.error('messageBus: message sent event emit failed', e); }
    }

    // 通知接收方
    const handlers = this._subscribers.get(message.to);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(message); } catch (e) { console.error(`[messagebus] Handler error: ${e.message}`); }
      }
    }

    return message;
  }

  /**
   * 广播消息
   */
  broadcast(from, type, payload) {
    const message = new (require('./agentMessage.cjs'))({
      from,
      to: '*',
      type: type || 'notification',
      payload
    });

    if (this.memory) {
      this.memory.saveMessage(message);
    }

    if (this.eventBus) {
      try {
        this.eventBus.emit({
          type: 'agent.message.broadcast',
          payload: { from, type },
          source: 'messagebus'
        });
      } catch (e) { console.error('messageBus: message broadcast event emit failed', e); }
    }

    // 通知所有订阅者
    for (const [agentId, handlers] of this._subscribers) {
      if (agentId === from) continue;
      for (const handler of handlers) {
        try { handler(message); } catch (e) { console.error(`[messagebus] Broadcast handler error: ${e.message}`); }
      }
    }
  }

  /**
   * 订阅消息
   */
  subscribe(agentId, handler) {
    if (!this._subscribers.has(agentId)) {
      this._subscribers.set(agentId, []);
    }
    this._subscribers.get(agentId).push(handler);
  }

  /**
   * 查询消息历史
   */
  async getMessages(agentId, limit = 20) {
    if (this.memory) {
      return this.memory.getMessages(agentId, limit);
    }
    return [];
  }

  /**
   * 获取订阅者数量
   */
  subscriberCount() {
    let total = 0;
    for (const handlers of this._subscribers.values()) {
      total += handlers.length;
    }
    return total;
  }
}

module.exports = MessageBus;
