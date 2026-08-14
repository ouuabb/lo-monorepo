/**
 * PluginContext —— 插件运行时上下文接口
 *
 * 插件通过 PluginContext 与 lo Core 交互。此类在 SDK 中只定义**稳定接口**，
 * 不包含实现。真实实现由 lo Core 在加载插件时注入。
 *
 * 设计原则：
 *   1. 所有方法都有 default 实现，避免单元测试必须注入全部依赖
 *   2. 永不暴露 lo Core 内部对象（Repository、ResourceService 等）
 *      —— 必须通过 facade 方法（如 resources.create()）间接访问
 */
class PluginContext {
  /**
   * @param {object} [injections] — 由 lo Core 注入的实现
   * @param {object} [injections.pluginId]  — 当前插件 ID
   * @param {object} [injections.logger]    — Logger 实例（遵循 Logger 接口）
   * @param {object} [injections.config]    — 插件配置（plugin_settings 表读取）
   * @param {object} [injections.extensionRegistry] — 扩展注册表
   * @param {object} [injections.hookManager]  — Hook 管理器
   * @param {object} [injections.eventBus]  — 事件总线
   * @param {object} [injections.resources] — ResourceFacade
   * @param {object} [injections.relations] — RelationFacade
   * @param {string} [injections.repoPath]  — lo 仓库根目录路径（Core 注入）
   */
  constructor(injections = {}) {
    this._pluginId = injections.pluginId || null;
    this._logger = injections.logger || createNoopLogger();
    this._config = injections.config || {};
    this._extensionRegistry = injections.extensionRegistry || createNoopRegistry();
    this._hookManager = injections.hookManager || createNoopHookManager();
    this._eventBus = injections.eventBus || createNoopEventBus();
    this._resources = injections.resources || createNoopResources();
    this._relations = injections.relations || createNoopRelations();
    this._repoPath = injections.repoPath || null;
  }

  /**
   * lo 仓库根目录路径（只读字符串，非 Repository 对象）
   * 插件用于解析仓库内相对路径（如 EPUB 文件、自定义数据目录）
   */
  get repoPath() {
    return this._repoPath;
  }

  /** 当前插件 ID */
  get pluginId() {
    return this._pluginId;
  }

  /**
   * 获取插件配置
   * @param {string} [key] — 指定 key，不传返回全部
   * @param {*}      [defaultValue]
   */
  config(key, defaultValue) {
    const cfg = this._config || {};
    if (key === undefined) return cfg;
    return cfg[key] !== undefined ? cfg[key] : defaultValue;
  }

  /**
   * 设置插件配置（写 plugin_settings 表）
   * 默认 noop，真实实现由 Core 注入
   */
  async setConfig(key, value) { /* noop, injected by core */ }

  /** 获取日志接口 */
  get logger() {
    return this._logger;
  }

  /** 扩展注册表 */
  get extensions() {
    return this._extensionRegistry;
  }

  /** Hook 管理器 */
  get hooks() {
    return this._hookManager;
  }

  /** 事件总线 */
  get events() {
    return this._eventBus;
  }

  /** Resource Facade（创建/查询资源的稳定 API） */
  get resources() {
    return this._resources;
  }

  /** Relation Facade */
  get relations() {
    return this._relations;
  }
}

/* ── 以下是 noop 注入，用于单元测试或未初始化场景 ── */

function createNoopLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
    child() {
      return createNoopLogger();
    }
  };
}

function createNoopRegistry() {
  return {
    register() {},
    unregister() {},
    get() { return null; },
    has() { return false; },
    list() { return []; }
  };
}

function createNoopHookManager() {
  return {
    register() {},
    unregister() {},
    async runBefore(payload) { return payload; },
    async runAfter() {}
  };
}

function createNoopEventBus() {
  return {
    on() { return () => {}; },
    off() {},
    emit() {},
    async emitAsync() {}
  };
}

function createNoopResources() {
  return {
    async create() { throw new Error('[PluginContext] resources.create 未注入，请在 lo 仓库中运行插件'); },
    async getByRid() { return null; },
    async list() { return []; },
    async update() { return null; },
    async delete() { return false; }
  };
}

function createNoopRelations() {
  return {
    async create() { return null; },
    async listFrom() { return []; },
    async listTo() { return []; },
    async getByFromRidAndType() { return []; },
    async update() { return null; },
    async remove() { return false; }
  };
}

module.exports = PluginContext;
