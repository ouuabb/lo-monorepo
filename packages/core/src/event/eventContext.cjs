/**
 * EventContext — 事件执行上下文
 *
 * Phase 6.2: 传递给 event handler 的附加服务。
 *
 * 类似 PluginContext，但针对事件处理场景。
 */

class EventContext {
  /**
   * @param {object} services
   * @param {object} [services.eventBus]
   * @param {object} [services.repository]
   * @param {object} [services.logger]
   * @param {object} [services.pluginManager]
   */
  constructor(services = {}) {
    this.eventBus = services.eventBus || null;
    this.repository = services.repository || null;
    this.logger = services.logger || console;
    this.pluginManager = services.pluginManager || null;
  }

  /**
   * 再发布事件（用于 handler 中传递）
   */
  emit(type, payload) {
    if (!this.eventBus) return;
    return this.eventBus.emit({ type, payload });
  }
}

module.exports = EventContext;
