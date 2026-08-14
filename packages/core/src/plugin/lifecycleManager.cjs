/**
 * LifecycleManager — 插件生命周期管理器
 *
 * Phase 6.1: 管理插件状态转换。
 *
 * 状态:
 *   created → loaded → initialized → enabled → disabled → disposed
 *
 * 转换规则:
 *   created     — 刚实例化
 *   loaded      — 已通过 Loader 加载
 *   initialized — initialize() 完成
 *   enabled     — enable() 完成（可运行）
 *   disabled    — disable() 完成（暂停）
 *   disposed    — dispose() 完成（已销毁）
 */

const VALID_STATES = ['created', 'loaded', 'initialized', 'enabled', 'disabled', 'disposed'];

const TRANSITIONS = {
  created:     ['loaded', 'disposed'],
  loaded:      ['initialized', 'disposed'],
  initialized: ['enabled', 'disposed'],
  enabled:     ['disabled', 'disposed'],
  disabled:    ['enabled', 'disposed'],
  disposed:    [] // 终态
};

class LifecycleManager {
  constructor() {
    /** @type {Map<string, string>} pluginId → state */
    this._states = new Map();
  }

  /**
   * 设置插件状态
   * @throws 如果状态转换不合法
   */
  setState(pluginId, newState) {
    if (!VALID_STATES.includes(newState)) {
      throw new Error(`Invalid state: ${newState}`);
    }

    const current = this._states.get(pluginId) || 'created';

    if (!TRANSITIONS[current].includes(newState)) {
      throw new Error(
        `Invalid state transition for '${pluginId}': ${current} → ${newState}`
      );
    }

    this._states.set(pluginId, newState);
    return newState;
  }

  /**
   * 获取插件状态
   */
  getState(pluginId) {
    return this._states.get(pluginId) || 'created';
  }

  /**
   * 是否已启用
   */
  isEnabled(pluginId) {
    return this._states.get(pluginId) === 'enabled';
  }

  /**
   * 是否已禁用
   */
  isDisabled(pluginId) {
    const s = this._states.get(pluginId);
    return s === 'disabled' || !s || s === 'created';
  }

  /**
   * 是否已销毁
   */
  isDisposed(pluginId) {
    return this._states.get(pluginId) === 'disposed';
  }

  /**
   * 列出所有插件及其状态
   */
  list() {
    return Array.from(this._states.entries()).map(([id, state]) => ({ id, state }));
  }

  /**
   * 移除
   */
  remove(pluginId) {
    this._states.delete(pluginId);
  }
}

module.exports = LifecycleManager;
