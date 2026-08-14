/**
 * ActionRegistry — Action 注册表
 *
 * 管理 Automation Action 类型（type → handler）的注册与分发。
 * Action 不直接实现业务，只调用已有系统能力。
 */

class ActionRegistry {
  constructor() {
    /** @type {Map<string, Function>} */
    this._actions = new Map();
  }

  /**
   * 注册 Action 处理器
   * @param {string} type — 如 'workflow.transition'
   * @param {Function} handler — async (ctx, params) => result
   */
  register(type, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Action '${type}' handler 必须是函数`);
    }
    if (this._actions.has(type)) {
      throw new Error(`Action type 已注册: ${type}`);
    }
    this._actions.set(type, handler);
  }

  /**
   * 获取 Action 处理器
   */
  get(type) {
    const handler = this._actions.get(type);
    if (!handler) {
      throw new Error(`未注册的 Action 类型: ${type}`);
    }
    return handler;
  }

  has(type) {
    return this._actions.has(type);
  }

  list() {
    return Array.from(this._actions.keys());
  }
}

module.exports = ActionRegistry;