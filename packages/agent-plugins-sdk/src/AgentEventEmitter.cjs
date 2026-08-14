/**
 * AgentEventEmitter —— 插件事件总线
 *
 * 提供 on/off/once/emit/emitAsync。事件名沿用 lo 点号约定：
 *   resource.created / resource.updated / plugin.enabled ...
 *
 * 与 lo Core 事件解耦:插件通过 ctx.events 收发本机事件,
 * 宿主负责把 lo Core 事件(经 @lo/client 事件通道)桥接进来。
 */
class AgentEventEmitter {
  constructor() {
    this._listeners = new Map();
  }

  /**
   * 订阅事件
   * @param {string} eventName
   * @param {Function} handler
   * @returns {() => void} 取消订阅函数
   */
  on(eventName, handler) {
    if (typeof handler !== 'function') {
      throw new Error('[AgentEventEmitter] on 第二个参数必须是函数');
    }
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    this._listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  }

  /** 取消订阅 */
  off(eventName, handler) {
    const set = this._listeners.get(eventName);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this._listeners.delete(eventName);
  }

  /** 仅监听一次 */
  once(eventName, handler) {
    const wrapped = (...args) => {
      this.off(eventName, wrapped);
      handler(...args);
    };
    return this.on(eventName, wrapped);
  }

  /** 同步发布(不等待异步 handler) */
  emit(eventName, ...args) {
    const set = this._listeners.get(eventName);
    if (!set) return;
    for (const handler of Array.from(set)) {
      try {
        handler(...args);
      } catch (e) {
        process.emitWarning(
          `[AgentEventEmitter] event '${eventName}' handler failed: ${e && e.message}`,
        );
      }
    }
  }

  /** 异步发布(等待所有 handler resolve) */
  async emitAsync(eventName, ...args) {
    const set = this._listeners.get(eventName);
    if (!set) return;
    await Promise.all(
      Array.from(set).map(async (handler) => {
        try {
          return await handler(...args);
        } catch (e) {
          process.emitWarning(
            `[AgentEventEmitter] event '${eventName}' async handler failed: ${e && e.message}`,
          );
          return undefined;
        }
      }),
    );
  }

  /** 当前被监听的事件名列表(调试/测试用) */
  get eventNames() {
    return Array.from(this._listeners.keys());
  }

  /** 移除所有订阅 */
  clear() {
    this._listeners.clear();
  }
}

module.exports = AgentEventEmitter;
