/**
 * HookManager — Hook 管理器
 *
 * Phase 6.1: 支持插件在关键流程中插入自定义逻辑。
 *
 * Hook 点:
 *   beforeResourceCreate / afterResourceCreate
 *   beforeRelationCreate / afterRelationCreate
 *   beforeExport / afterExport
 *   beforeSearch / afterSearch
 *
 * 执行机制:
 *   - 每个 Hook 可以有多个监听器
 *   - 支持优先级排序（默认 0）
 *   - beforeHook 可以取消操作
 *   - 错误隔离：单个 Hook 失败不影响其他
 */

class HookManager {
  constructor() {
    /** @type {Map<string, Array<{ pluginId: string, handler: Function, priority: number }>>} */
    this._hooks = new Map();
  }

  /**
   * 注册 Hook
   * @param {string} hookName
   * @param {Function} handler — async (payload) => { payload | null }
   * @param {{ pluginId?: string, priority?: number }} options
   */
  register(hookName, handler, options = {}) {
    if (!this._hooks.has(hookName)) {
      this._hooks.set(hookName, []);
    }

    const listeners = this._hooks.get(hookName);
    listeners.push({
      pluginId: options.pluginId || 'unknown',
      handler,
      priority: options.priority || 0
    });

    // 按优先级降序
    listeners.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 注销插件所有 Hook
   * @param {string} pluginId
   */
  unregisterAll(pluginId) {
    for (const [hookName, listeners] of this._hooks) {
      const filtered = listeners.filter(l => l.pluginId !== pluginId);
      this._hooks.set(hookName, filtered);
    }
  }

  /**
   * 执行 before Hook
   * 任何一个 handler 返回 null 则取消操作
   *
   * @param {string} hookName — 如 'beforeResourceCreate'
   * @param {any} payload
   * @returns {Promise<{ cancelled: boolean, payload: any }>}
   */
  async runBefore(hookName, payload) {
    const listeners = this._hooks.get(hookName);
    if (!listeners || listeners.length === 0) {
      return { cancelled: false, payload };
    }

    let currentPayload = payload;
    for (const listener of listeners) {
      try {
        const result = await listener.handler(currentPayload);
        if (result === null || result === false) {
          return { cancelled: true, payload: currentPayload };
        }
        if (result !== undefined) {
          currentPayload = result;
        }
      } catch (e) {
        console.error(`[hook] Hook '${hookName}' (${listener.pluginId}) failed: ${e.message}`);
        // 继续执行，不取消
      }
    }

    return { cancelled: false, payload: currentPayload };
  }

  /**
   * 执行 after Hook
   * after Hook 可以返回修改后的 payload（链式传递）
   * @param {string} hookName
   * @param {any} payload
   * @returns {Promise<any>} 最终 payload
   */
  async runAfter(hookName, payload) {
    const listeners = this._hooks.get(hookName);
    if (!listeners || listeners.length === 0) return payload;

    let currentPayload = payload;
    for (const listener of listeners) {
      try {
        const result = await listener.handler(currentPayload);
        if (result !== undefined && result !== null) {
          currentPayload = result;
        }
      } catch (e) {
        console.error(`[hook] Hook '${hookName}' (${listener.pluginId}) failed: ${e.message}`);
      }
    }
    return currentPayload;
  }

  /**
   * 获取 Hook 监听器数量
   */
  listenerCount(hookName) {
    const listeners = this._hooks.get(hookName);
    return listeners ? listeners.length : 0;
  }

  /**
   * 列出所有 Hook 点
   */
  hookNames() {
    return Array.from(this._hooks.keys());
  }
}

module.exports = HookManager;
