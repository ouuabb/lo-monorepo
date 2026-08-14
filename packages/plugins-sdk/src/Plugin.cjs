/**
 * Plugin —— lo SDK 插件基类
 *
 * 所有 lo 插件都必须继承此类并实现 manifest() 和 register(context)。
 *
 * 生命周期：
 *   manifest() → register(ctx) → initialize() → enable() → running → disable() → dispose()
 *
 * 注意：此类不依赖 lo Core 内部实现；只定义稳定契约。
 * lo Plugin System 加载插件时，会通过 LoRuntime 注入真实的 PluginContext 实现。
 */
class Plugin {
  constructor() {
    this._manifest = null;
    this._context = null;
    this._state = 'created';
    this._enabled = false;
    this._disposed = false;
  }

  /**
   * 插件元数据（由子类实现）
   *
   * @returns {object} manifest
   * @property {string}  id                      — 唯一 ID，建议使用 kebab-case（如 'git-adapter'）
   * @property {string}  name                    — 显示名
   * @property {string}  version                 — 语义化版本（semver）
   * @property {string}  [description]           — 简介
   * @property {string}  [role]                  — 角色标签: 'adapter' | 'connector' | 'discovery' | 'general'
   * @property {string}  [author]                — 作者
   * @property {string}  [loVersion]             — 需要的 lo 版本（如 '>=0.1.0'）
   * @property {string[]}[dependencies]          — 依赖的其他插件 ID 列表
   * @property {object}  [config]                — 插件配置 schema（key → { type, default, description }）
   * @property {string[]}[extensions]            — 声明使用的扩展点列表
   * @property {object}  [contributes]           — 声明式扩展点注册
   * @property {Array<{ type, extensions?, metadataSchema?, description? }>} [contributes.resourceTypes]
   * @property {Array<{ type, description? }>}   [contributes.relationTypes]
   * @property {object}  [contributes.commands]
   * @property {object}  [contributes.importers]
   * @property {object}  [contributes.exporters]
   * @property {object}  [contributes.renderers]
   * @property {object}  [contributes.searchProviders]
   * @property {object}  [contributes.views]
   */
  manifest() {
    throw new Error(
      `[Plugin] ${this.constructor.name} 必须实现 manifest() 方法，返回 { id, name, version }`
    );
  }

  /**
   * 注册阶段：插件使用 PluginContext 提供的 API 注册功能
   *
   * 此时 Core 尚未调用 enable()，不应该执行重操作。
   *
   * 注意：this.context 在 register 执行期间已经可用，
   * 不论子类是否调用 super.register()（由 Core 的 PluginLoader 在调用前通过 $setContext 注入）。
   *
   * @param {import('./PluginContext.cjs')} context
   */
  register(context) {
    // 默认实现：空。子类按需覆盖。
  }

  /**
   * 由 Core 的 PluginLoader 在调用 register 之前调用，注入 context
   * @internal 仅 Core 内部使用
   */
  $setContext(context) {
    this._context = context;
  }

  /**
   * 初始化阶段：执行一次性初始化工作（读取配置、建索引等）
   * 默认空实现，子类按需覆盖。
   */
  async initialize() {}

  /**
   * 启用：插件开始工作（订阅事件、启动后台任务等）
   * 默认空实现，子类按需覆盖。
   */
  async enable() {
    this._enabled = true;
  }

  /**
   * 停用：暂停后台任务、取消订阅
   * 默认空实现，子类按需覆盖。
   */
  async disable() {
    this._enabled = false;
  }

  /**
   * 销毁：释放所有资源
   * 注意：dispose 后不应再调用任何方法。
   */
  async dispose() {
    this._enabled = false;
    this._disposed = true;
  }

  /**
   * 获取已解析的 manifest（由 PluginLoader 赋值）
   * @internal 仅 lo Plugin System 调用，插件代码不应使用
   */
  get $manifest() {
    return this._manifest || this.manifest();
  }

  // ── 元信息快捷访问（与 lo Core Plugin 接口对齐）──

  /** 插件 ID（来自 manifest().id） */
  get id() {
    try { return (this.manifest() && this.manifest().id) || ''; }
    catch { return ''; }
  }

  /** 插件显示名（来自 manifest().name） */
  get name() {
    try { return (this.manifest() && this.manifest().name) || this.id; }
    catch { return ''; }
  }

  /** 插件版本（来自 manifest().version） */
  get version() {
    try { return (this.manifest() && this.manifest().version) || '0.0.0'; }
    catch { return '0.0.0'; }
  }

  /** 依赖的其他插件 ID 列表（来自 manifest().dependencies） */
  get dependencies() {
    try { return (this.manifest() && this.manifest().dependencies) || []; }
    catch { return []; }
  }

  /** 声明式扩展点注册（来自 manifest().contributes） */
  get contributes() {
    try { return (this.manifest() && this.manifest().contributes) || {}; }
    catch { return {}; }
  }

  /**
   * 获取 PluginContext
   * @protected 子类可通过 this.context 访问
   */
  get context() {
    return this._context;
  }

  /**
   * 注入 PluginContext
   *
   * 与 lo Core Plugin 接口对齐：旧插件可能依赖 `plugin.context = ctx`。
   * 推荐新插件由 Core 通过 `$setContext()` 注入（PluginManager 会自动调用）。
   */
  set context(value) {
    this._context = value;
  }

  /**
   * 生命周期状态（与 lo Core Plugin 接口对齐）
   *
   * 取值与 LifecycleManager 一致：
   *   created → loaded → initialized → enabled → disabled → disposed
   *
   * 状态由 lo PluginManager / LifecycleManager 写入，插件代码通常只读。
   */
  get state() {
    return this._state;
  }

  set state(value) {
    this._state = value;
  }

  /** 是否已启用 */
  get isEnabled() {
    return this._enabled;
  }

  /** 是否已销毁 */
  get isDisposed() {
    return this._disposed;
  }
}

module.exports = Plugin;
