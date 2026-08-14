/**
 * Plugin — 插件基类
 *
 * Phase 6.1: 所有插件必须继承此类，实现标准生命周期接口。
 * P0-2: 对齐 lo-plugins-sdk 的 Plugin 基类接口，支持 $setContext() 注入。
 *
 * 生命周期:
 *   manifest() → register(ctx) → initialize() → enable() → running → disable() → dispose()
 *
 * 子类必须实现:
 *   manifest()  — 返回插件声明 { id, name, version, dependencies?, contributes? }
 *
 * 可选实现:
 *   register(context)  — 注册扩展点（默认空实现，子类按需覆盖）
 *   initialize()       — 初始化
 *   enable()           — 启用
 *   disable()          — 禁用
 *   dispose()          — 销毁
 *
 * 向后兼容:
 *   - register() 旧版抛错，现在改为空默认实现（与 SDK 一致）
 *   - context setter 保留（旧插件可能用 plugin.context = ctx）
 *   - _state / state 保留（LifecycleManager 依赖）
 */

class Plugin {
  constructor() {
    this._state = 'created';
    this._context = null;
    this._enabled = false;
    this._disposed = false;
  }

  /**
   * 返回插件声明（metadata）
   * @returns {{ id: string, name: string, version: string, dependencies?: string[], contributes?: object }}
   */
  manifest() {
    throw new Error('Plugin.manifest() must be implemented');
  }

  /**
   * 注册扩展点（resourceTypes, commands, renderers 等）
   * 默认空实现，子类按需覆盖。
   * @param {PluginContext} context
   */
  register(context) {
    // 默认空实现（与 SDK 一致）
  }

  /**
   * 由 PluginManager 在调用 register() 之前注入 context（SDK 接口）
   * @internal 仅 Core 内部调用
   */
  $setContext(context) {
    this._context = context;
  }

  /**
   * 初始化插件（此时所有依赖已加载）
   */
  async initialize() { }

  /**
   * 启用插件
   */
  async enable() {
    this._enabled = true;
  }

  /**
   * 禁用插件
   */
  async disable() {
    this._enabled = false;
  }

  /**
   * 销毁插件
   */
  async dispose() {
    this._enabled = false;
    this._disposed = true;
  }

  // ── 状态管理 ──

  get id() {
    return this.manifest().id || '';
  }

  get name() {
    return this.manifest().name || this.manifest().id;
  }

  get version() {
    return this.manifest().version || '0.0.0';
  }

  get state() {
    return this._state;
  }

  set state(val) {
    this._state = val;
  }

  get context() {
    return this._context;
  }

  set context(ctx) {
    this._context = ctx;
  }

  get dependencies() {
    return this.manifest().dependencies || [];
  }

  get contributes() {
    return this.manifest().contributes || {};
  }

  /** 是否已启用（SDK 接口） */
  get isEnabled() {
    return this._enabled;
  }

  /** 是否已销毁（SDK 接口） */
  get isDisposed() {
    return this._disposed;
  }

  /**
   * 获取已解析的 manifest（SDK 接口）
   * @internal
   */
  get $manifest() {
    return this._manifest || this.manifest();
  }
}

module.exports = Plugin;
