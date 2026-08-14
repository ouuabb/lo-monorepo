/**
 * AgentPlugin —— lo-agent 插件基类
 *
 * 所有 lo-agent 插件必须继承此类并实现 manifest() 和 activate(ctx)。
 *
 * 生命周期(由 lo-agent 插件运行时驱动):
 *   created → loaded → activated → enabled → disabled → deactivated → disposed
 *
 * 插件代码只应从 '@lo/agent-plugins-sdk' require,永不 require lo-agent 内部文件。
 */
class AgentPlugin {
  constructor() {
    this._manifest = null;
    this._context = null;
    this._state = 'created';
    this._enabled = false;
    this._disposed = false;
  }

  /**
   * 插件元数据(由子类实现)
   * @returns {object} manifest
   */
  manifest() {
    throw new Error(
      `[AgentPlugin] ${this.constructor.name} 必须实现 manifest() 方法，返回 { id, name, version, main }`,
    );
  }

  /**
   * 激活阶段:插件获得 ctx,可注册 UI、订阅事件、准备资源。
   * 此时尚未 enable,不应执行重操作。
   * @param {import('./AgentPluginContext.cjs')} context
   */
  activate(_context) {
    // 默认空实现,子类按需覆盖
  }

  /**
   * 启用:插件开始工作(订阅事件、启动后台任务等)
   * 默认空实现。
   */
  async enable() {
    this._enabled = true;
  }

  /**
   * 停用:暂停后台任务、取消订阅
   */
  async disable() {
    this._enabled = false;
  }

  /**
   * 停用激活:释放 activate 阶段申请的资源
   */
  async deactivate() {
    this._context = null;
  }

  /**
   * 销毁:释放所有资源。dispose 后不应再调用任何方法。
   */
  async dispose() {
    this._enabled = false;
    this._disposed = true;
  }

  /** @internal 由插件运行时在 activate 前注入 context */
  $setContext(context) {
    this._context = context;
  }

  /** 已解析的 manifest(运行时注入;未注入时返回 manifest()) */
  get $manifest() {
    return this._manifest || this.manifest();
  }

  // ── 元信息快捷访问 ──

  /** 插件 ID(manifest().id) */
  get id() {
    try {
      return (this.manifest() && this.manifest().id) || '';
    } catch {
      return '';
    }
  }

  /** 插件显示名(manifest().name) */
  get name() {
    try {
      return (this.manifest() && this.manifest().name) || this.id;
    } catch {
      return '';
    }
  }

  /** 插件版本(manifest().version) */
  get version() {
    try {
      return (this.manifest() && this.manifest().version) || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /** 插件上下文 */
  get context() {
    return this._context;
  }

  /** 注入上下文(向后兼容:部分宿主直接用 setter) */
  set context(value) {
    this._context = value;
  }

  /** 生命周期状态(由运行时写入,插件通常只读) */
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

module.exports = AgentPlugin;
