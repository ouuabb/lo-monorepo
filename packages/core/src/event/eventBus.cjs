/**
 * EventBus — 事件总线
 *
 * Phase 6.2: 核心发布-订阅模块。
 *
 * 特性:
 *   - publish/subscribe 模型
 *   - 异步执行（fire-and-forget）
 *   - 错误隔离（单个 handler 失败不影响其他）
 *   - 支持 once（一次性监听）
 *   - 支持通配符监听（如 'resource.*'）
 *   - 支持 EventStore 持久化
 *   - 支持 EventMiddleware 中间件
 *
 * API:
 *   emit(event)          — 发布事件
 *   on(type, handler)    — 注册监听
 *   once(type, handler)  — 一次性监听
 *   off(type, handler)   — 移除监听
 *   clear(type)          — 清空某类型监听
 *   listeners(type)      — 获取监听器数量
 */

const Event = require("./event.cjs");

class EventBus {
  /**
   * @param {object} [options]
   * @param {import('./eventStore.cjs')} [options.store]
   * @param {import('./eventMiddleware.cjs')} [options.middleware]
   */
  constructor(options = {}) {
    /** @type {Map<string, Array<{ handler: Function, once: boolean }>>} */
    this._handlers = new Map();

    this._store = options.store || null;
    this._middleware = options.middleware || null;
  }

  /**
   * 发布事件
   * @param {Event|object} event
   */
  async emit(event) {
    if (!(event instanceof Event)) {
      event = new Event(event);
    }

    // 执行中间件 beforeEmit
    if (this._middleware) {
      try {
        const result = await this._middleware.run("beforeEmit", event);
        if (result === null || result === false) return;
        if (result instanceof Event) event = result;
      } catch (e) {
        console.error(`[eventbus] beforeEmit middleware error: ${e.message}`);
      }
    }

    // 持久化
    if (this._store) {
      try {
        await this._store.save(event);
      } catch (e) {
        console.error(`[eventbus] Store error: ${e.message}`);
      }
    }

    // 获取匹配的 handler
    const handlers = this._getMatchingHandlers(event.type);

    // 若无 listener，仅持久化
    if (handlers.length === 0) return;

    // 异步执行所有 handler（fire-and-forget）
    const executeHandlers = async () => {
      for (const { handler } of handlers) {
        try {
          // 执行中间件 beforeHandler
          let shouldRun = true;
          if (this._middleware) {
            try {
              const result = await this._middleware.run("beforeHandler", {
                event,
                handler,
              });
              if (result === false) shouldRun = false;
            } catch (e) {
              console.error("eventBus: middleware beforeHandler failed", e);
            }
          }

          if (shouldRun) {
            await handler(event.payload, event);

            // 执行中间件 afterHandler
            if (this._middleware) {
              try {
                await this._middleware.run("afterHandler", { event, handler });
              } catch (e) {
                console.error("eventBus: middleware afterHandler failed", e);
              }
            }
          }
        } catch (e) {
          console.error(
            `[eventbus] Handler error for '${event.type}': ${e.message}`,
          );
        }
      }

      // 清理 once handler
      this._cleanupOnceHandlers(event.type, handlers);
    };

    // Fire and forget（不 await，避免阻塞调用方）
    executeHandlers().catch((e) => {
      console.error(`[eventbus] Async execution error: ${e.message}`);
    });

    // 执行中间件 afterEmit
    if (this._middleware) {
      try {
        await this._middleware.run("afterEmit", event);
      } catch (e) {
        console.error("eventBus: middleware afterEmit failed", e);
      }
    }
  }

  /**
   * 注册监听器
   * @param {string} type — 事件类型，支持 'resource.*' 通配符
   * @param {Function} handler — async (payload, event) => void
   */
  on(type, handler) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, []);
    }
    this._handlers.get(type).push({ handler, once: false });
  }

  /**
   * 一次性监听
   */
  once(type, handler) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, []);
    }
    this._handlers.get(type).push({ handler, once: true });
  }

  /**
   * 移除监听器
   */
  off(type, handler) {
    const handlers = this._handlers.get(type);
    if (!handlers) return;

    let idx = -1;
    for (let i = 0; i < handlers.length; i++) {
      if (handlers[i].handler === handler) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      handlers.splice(idx, 1);
    }
  }

  /**
   * 清空某类型所有监听器
   */
  clear(type) {
    if (type) {
      this._handlers.delete(type);
    } else {
      this._handlers.clear();
    }
  }

  /**
   * 获取某类型监听器数量
   */
  listeners(type) {
    const handlers = this._handlers.get(type);
    return handlers ? handlers.length : 0;
  }

  /**
   * 列出所有已注册的事件类型
   */
  registeredTypes() {
    return Array.from(this._handlers.keys());
  }

  // ── 私有 ──

  /**
   * 获取匹配的 handler（包括通配符）
   */
  _getMatchingHandlers(type) {
    const results = [];

    // 精确匹配
    const exact = this._handlers.get(type);
    if (exact) {
      results.push(...exact);
    }

    // 通配符匹配
    for (const [pattern, handlers] of this._handlers) {
      if (pattern === type) continue;

      if (pattern.endsWith(".*")) {
        const prefix = pattern.slice(0, -2);
        if (type.startsWith(`${prefix}.`) || type === prefix) {
          results.push(...handlers);
        }
      } else if (pattern === "*") {
        results.push(...handlers);
      }
    }

    return results;
  }

  /**
   * 清理一次性 handler
   */
  _cleanupOnceHandlers(type, handlers) {
    const onceHandlers = handlers.filter((h) => h.once);
    if (onceHandlers.length === 0) return;

    const exact = this._handlers.get(type);
    if (exact) {
      for (const oh of onceHandlers) {
        const idx = exact.indexOf(oh);
        if (idx >= 0) exact.splice(idx, 1);
      }
    }
  }
}

module.exports = EventBus;
