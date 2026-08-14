/**
 * PluginRegistry — 插件注册表
 *
 * Phase 6.1: 维护 pluginId → Plugin Instance 的映射。
 *
 * 提供:
 *   - 注册/注销插件
 *   - 按 ID 查询
 *   - 列出所有插件
 */

class PluginRegistry {
  constructor() {
    /** @type {Map<string, import('./plugin.cjs')>} */
    this._plugins = new Map();
  }

  /**
   * 注册插件
   * @param {import('./plugin.cjs')} plugin
   */
  register(plugin) {
    const id = plugin.id;
    if (!id) throw new Error('Plugin must have an id');
    if (this._plugins.has(id)) {
      throw new Error(`Plugin '${id}' is already registered`);
    }
    this._plugins.set(id, plugin);
  }

  /**
   * 注销插件
   * @param {string} id
   */
  unregister(id) {
    if (!this._plugins.has(id)) {
      throw new Error(`Plugin '${id}' not found`);
    }
    this._plugins.delete(id);
  }

  /**
   * 获取插件
   * @param {string} id
   * @returns {import('./plugin.cjs')|undefined}
   */
  get(id) {
    return this._plugins.get(id);
  }

  /**
   * 是否存在
   */
  has(id) {
    return this._plugins.has(id);
  }

  /**
   * 列出所有插件
   * @returns {Array<{ id: string, name: string, version: string, state: string }>}
   */
  list() {
    return Array.from(this._plugins.values()).map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      state: p.state
    }));
  }

  /**
   * 按状态过滤
   * @param {string} state
   * @returns {import('./plugin.cjs')[]}
   */
  filterByState(state) {
    return Array.from(this._plugins.values()).filter(p => p.state === state);
  }

  /**
   * 遍历
   */
  forEach(fn) {
    this._plugins.forEach(fn);
  }

  get size() {
    return this._plugins.size;
  }

  get plugins() {
    return Array.from(this._plugins.values());
  }
}

module.exports = PluginRegistry;
