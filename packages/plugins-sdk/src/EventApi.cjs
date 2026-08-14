/**
 * EventApi —— SDK 定义的事件总线接口
 *
 * 插件通过 context.events 监听/发布事件。
 *
 * 事件命名与 lo Core 保持一致：使用点号 domain.action 格式，而不是冒号。
 * 常用事件（由 Core 发布）：
 *   'resource.created'  (resource)
 *   'resource.updated'  (resource, old)
 *   'resource.deleted'  (rid)
 *   'relation.created'  (relation)
 *   'relation.deleted'  (relation)
 *   'plugin.enabled'    (pluginId)
 *   'plugin.disabled'   (pluginId)
 *   'sync.finished'     ()
 *
 * 插件可发布自定义事件，命名建议：'<pluginId>.<event>'，如 'git-adapter.commit'。
 */
class EventApi {
  constructor() {
    this._listeners = new Map();
  }

  /**
   * 订阅事件
   * @returns {() => void} 取消订阅函数（调用即 off）
   */
  on(eventName, handler) {
    if (typeof handler !== 'function') {
      throw new Error('[EventApi] on 第二个参数必须是函数');
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

  /** 同步发布事件（不等待异步 handler） */
  emit(eventName, ...args) {
    const set = this._listeners.get(eventName);
    if (!set) return;
    for (const handler of Array.from(set)) {
      try {
        handler(...args);
      } catch (e) {
        // 单个 handler 抛错不影响其他
        // 真实 Core 注入会在这里打日志
        process.emitWarning && process.emitWarning(
          `[EventApi] event '${eventName}' handler failed: ${e && e.message}`
        );
      }
    }
  }

  /** 异步发布事件（等待所有 handler resolve） */
  async emitAsync(eventName, ...args) {
    const set = this._listeners.get(eventName);
    if (!set) return;
    await Promise.all(
      Array.from(set).map(async (handler) => {
        try {
          return await handler(...args);
        } catch (e) {
          process.emitWarning && process.emitWarning(
            `[EventApi] event '${eventName}' async handler failed: ${e && e.message}`
          );
          return undefined;
        }
      })
    );
  }

  /** 当前有哪些事件名被监听（调试/测试用） */
  get eventNames() {
    return Array.from(this._listeners.keys());
  }
}

module.exports = EventApi;
