/**
 * OperationRegistry - 操作类型注册表
 *
 * 替代硬编码 switch(type) 的分发模式。
 * 每个操作类型注册 { execute, undo } handler，
 * OperationEngine 通过 Registry 查找执行。
 *
 * Phase 4.3
 */

class OperationRegistry {
  constructor() {
    /** @type {Map<string, { execute: Function, undo: Function }>} */
    this._handlers = new Map();
  }

  /**
   * 注册操作类型
   *
   * @param {string} type - e.g. 'member.rename'
   * @param {{ execute: Function, undo: Function }} handler
   *      execute(ctx, params) → 执行正向操作
   *      undo(ctx, params)    → 执行反向操作
   */
  register(type, handler) {
    if (!handler.execute || !handler.undo) {
      throw new Error(`Operation handler for "${type}" must have both execute() and undo()`);
    }
    this._handlers.set(type, handler);
  }

  /**
   * 获取 handler
   * @param {string} type
   * @returns {{ execute: Function, undo: Function }}
   */
  get(type) {
    const handler = this._handlers.get(type);
    if (!handler) {
      throw new Error(`未注册的操作类型: ${type}`);
    }
    return handler;
  }

  /**
   * 检查是否已注册
   */
  has(type) {
    return this._handlers.has(type);
  }

  /**
   * 列出所有已注册的类型
   */
  list() {
    return Array.from(this._handlers.keys());
  }
}

module.exports = OperationRegistry;
