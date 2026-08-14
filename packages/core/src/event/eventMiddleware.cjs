/**
 * EventMiddleware — 事件中间件
 *
 * Phase 6.2: 支持在事件生命周期中插入自定义逻辑。
 *
 * 钩子点:
 *   beforeEmit      — 发布前（可修改/取消事件）
 *   afterEmit       — 发布后
 *   beforeHandler   — handler 执行前
 *   afterHandler    — handler 执行后
 *
 * 用途:
 *   - 日志记录
 *   - 性能监控
 *   - 访问控制
 */

class EventMiddleware {
  constructor() {
    /** @type {Map<string, Array<{ handler: Function, priority: number }>>} */
    this._middlewares = new Map();
  }

  /**
   * 注册中间件
   * @param {string} hook — beforeEmit | afterEmit | beforeHandler | afterHandler
   * @param {Function} handler — async (payload) => any
   * @param {number} [priority]
   */
  register(hook, handler, priority = 0) {
    if (!this._middlewares.has(hook)) {
      this._middlewares.set(hook, []);
    }
    this._middlewares.get(hook).push({ handler, priority });
    this._middlewares.get(hook).sort((a, b) => b.priority - a.priority);
  }

  /**
   * 执行中间件链
   * @param {string} hook
   * @param {any} payload
   * @returns {Promise<any>} 最后一个非 false 的返回值
   */
  async run(hook, payload) {
    const mws = this._middlewares.get(hook);
    if (!mws || mws.length === 0) return payload;

    let result = payload;
    for (const mw of mws) {
      try {
        const ret = await mw.handler(result);
        if (ret === false || ret === null) return false;
        if (ret !== undefined) result = ret;
      } catch (e) {
        console.error(`[middleware] Hook '${hook}' error: ${e.message}`);
      }
    }

    return result;
  }

  /**
   * 清空中间件
   */
  clear(hook) {
    if (hook) {
      this._middlewares.delete(hook);
    } else {
      this._middlewares.clear();
    }
  }

  /**
   * 获取中间件数量
   */
  count(hook) {
    const mws = this._middlewares.get(hook);
    return mws ? mws.length : 0;
  }
}

module.exports = EventMiddleware;
