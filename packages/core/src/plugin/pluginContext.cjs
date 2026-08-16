/**
 * PluginContext — 插件上下文
 *
 * Phase 6.1: 插件只能通过 Context 访问系统能力，不能直接访问 Repository。
 * P0-2: 对齐 lo-plugins-sdk 的 PluginContext 接口，新增 Facade getter + config() 方法。
 *
 * SDK 风格 API（新插件推荐使用）:
 *   ctx.logger            — 日志接口
 *   ctx.config(key, def)  — 获取配置
 *   ctx.extensions        — 扩展注册表
 *   ctx.hooks             — Hook 管理器
 *   ctx.events            — 事件总线
 *   ctx.resources         — Resource Facade（create/getByRid/list/update/delete）
 *   ctx.relations         — Relation Facade（create/listFrom/listTo/remove）
 *
 * 旧版 API（向后兼容，不推荐新插件使用）:
 *   ctx.getRepository()
 *   ctx.getConfig(key, def)
 *   ctx.getExtensionRegistry()
 *   ctx.getHookManager()
 */

class PluginContext {
  /**
   * @param {object} services
   * @param {object} [services.repository]        — Repository 实例
   * @param {object} [services.logger]            — 日志
   * @param {object} [services.config]            — 配置
   * @param {object} [services.extensionRegistry] — 扩展注册表
   * @param {object} [services.hookManager]       — Hook 管理
   * @param {object} [services.eventBus]          — 事件总线
   * @param {string} [services.pluginId]          — 当前插件 ID
   * @param {object} [services.resourceService]   — ResourceService 实例
   * @param {object} [services.relationService]   — RelationService 实例
   */
  constructor(services = {}) {
    // 旧版直接引用
    this.repository = services.repository || null;
    this.logger = services.logger || console;
    this._configData = services.config || {};
    this.extensionRegistry = services.extensionRegistry || null;
    this.hookManager = services.hookManager || null;
    this.cache = services.cache || null;
    this.eventBus = services.eventBus || null;

    // SDK 新增
    this._pluginId = services.pluginId || null;
    this._resourceService = services.resourceService || null;
    this._relationService = services.relationService || null;
    // P0: 写配置闭包（由 PluginManager 注入，委托 pm.setPluginConfig 落库）
    this._setConfigFn = services.setConfigFn || null;
    // U3: Mode/Viewer 注册/解析（由 PluginManager 注入；缺省 noop）
    this._modes = services.modes || null;
    this._viewers = services.viewers || null;
  }

  // ── SDK 风格 getter（新插件推荐） ──

  /** 当前插件 ID */
  get pluginId() {
    return this._pluginId;
  }

  /**
   * lo 仓库根目录路径（只读字符串，非 Repository 对象）
   * 插件用于解析仓库内相对路径（如 EPUB 文件、自定义数据目录）
   */
  get repoPath() {
    return this.repository ? this.repository.repoPath : null;
  }

  /**
   * 获取插件配置（SDK 风格）
   * @param {string} [key] — 指定 key，不传返回全部
   * @param {*}      [defaultValue]
   */
  config(key, defaultValue) {
    const cfg = this._configData || {};
    if (key === undefined) return cfg;
    return cfg[key] !== undefined ? cfg[key] : defaultValue;
  }

  /**
   * 写插件配置（SDK 风格，落 plugin_settings 表）
   * P0: 修复此前 SDK 声明了 setConfig 但 Core 未注入实现的 bug。
   * 委托给 PluginManager.setPluginConfig（含 schema 校验 + 立即同步 _configData）。
   * @param {string} key
   * @param {*}      value
   * @returns {Promise<void>}
   */
  async setConfig(key, value) {
    if (typeof this._setConfigFn !== 'function') {
      throw new Error(
        `[PluginContext] setConfig 未注入（插件 '${this._pluginId}'）：` +
        `请在 lo 仓库中运行插件，或使用 'lo plugin config <id> <key> <value>' 命令`
      );
    }
    await this._setConfigFn(key, value);
  }

  /** 获取扩展注册表（SDK getter） */
  get extensions() {
    return this.extensionRegistry || createNoopRegistry();
  }

  /** 获取 Hook 管理器（SDK getter） */
  get hooks() {
    return this.hookManager || createNoopHookManager();
  }

  /** 获取事件总线（SDK getter） */
  get events() {
    return this.eventBus || createNoopEventBus();
  }

  /** Resource Facade（SDK 风格，桥接到 ResourceService，懒缓存） */
  get resources() {
    if (this._resourceFacade) return this._resourceFacade;
    if (this._resourceService) {
      this._resourceFacade = createResourceFacade(this._resourceService);
    } else if (this.repository) {
      // 旧版兼容：从 Repository 获取 ResourceService
      this._resourceFacade = createResourceFacade(this.repository.resourceService);
    } else {
      this._resourceFacade = createNoopResourceFacade();
    }
    return this._resourceFacade;
  }

  /** Relation Facade（SDK 风格，桥接到 RelationService，懒缓存） */
  get relations() {
    if (this._relationFacade) return this._relationFacade;
    if (this._relationService) {
      this._relationFacade = createRelationFacade(this._relationService);
    } else if (this.repository) {
      this._relationFacade = createRelationFacade(this.repository.relationService);
    } else {
      this._relationFacade = createNoopRelationFacade();
    }
    return this._relationFacade;
  }

  /** Mode 门面（U3）：注册/解析 Usage Mode（注入缺省时 noop 安全默认） */
  get modes() {
    return this._modes || {
      async register() {
        throw new Error(
          `[PluginContext] modes.register 未注入（插件 '${this._pluginId}'）：请在 lo 仓库中运行插件`,
        );
      },
      async resolve() {
        return { ok: true, modes: [] };
      },
    };
  }

  /** Viewer 门面（U3）：注册插件 Viewer（注入缺省时 noop 安全默认） */
  get viewers() {
    return this._viewers || {
      async register() {
        throw new Error(
          `[PluginContext] viewers.register 未注入（插件 '${this._pluginId}'）：请在 lo 仓库中运行插件`,
        );
      },
    };
  }

  // ── 旧版 API（向后兼容） ──

  /**
   * 获取 Repository（旧版 API，不推荐新插件使用）
   * @deprecated 新插件请使用 ctx.resources / ctx.relations
   */
  getRepository() {
    if (!this.repository) {
      throw new Error('Repository not available in plugin context');
    }
    return this.repository;
  }

  /**
   * 获取配置（旧版 API）
   * @deprecated 新插件请使用 ctx.config(key, defaultValue)
   */
  getConfig(key, defaultValue) {
    if (!this._configData) return defaultValue;
    return key ? (this._configData[key] !== undefined ? this._configData[key] : defaultValue) : this._configData;
  }

  /**
   * 获取扩展注册表（旧版 API）
   * @deprecated 新插件请使用 ctx.extensions
   */
  getExtensionRegistry() {
    if (!this.extensionRegistry) {
      throw new Error('ExtensionRegistry not available in plugin context');
    }
    return this.extensionRegistry;
  }

  /**
   * 获取 Hook 管理器（旧版 API）
   * @deprecated 新插件请使用 ctx.hooks
   */
  getHookManager() {
    if (!this.hookManager) {
      throw new Error('HookManager not available in plugin context');
    }
    return this.hookManager;
  }
}

/* ── Facade 工厂函数 ── */

/**
 * 创建 Resource Facade，桥接到 ResourceService
 */
function createResourceFacade(resourceService) {
  if (!resourceService) {
    return createNoopResourceFacade();
  }
  return {
    async create(candidate) {
      return resourceService.create(candidate);
    },
    async getByRid(rid) {
      return resourceService.getByRid(rid);
    },
    async list(query) {
      // ResourceService 有 getAll() 方法
      if (resourceService.getAll) return resourceService.getAll(query);
      if (resourceService.list) return resourceService.list(query);
      return [];
    },
    async update(rid, patch) {
      return resourceService.update(rid, patch);
    },
    async delete(rid, soft = true) {
      return resourceService.delete(rid, soft);
    }
  };
}

/**
 * 创建 Relation Facade，桥接到 RelationService
 */
function createRelationFacade(relationService) {
  if (!relationService) {
    return createNoopRelationFacade();
  }
  return {
    async create(candidate) {
      // SDK 风格：传 { from_rid, to_rid, type, metadata? }
      // RelationService.create 签名：create(fromRid, toRid, type, metadata)
      return relationService.create(
        candidate.from_rid,
        candidate.to_rid,
        candidate.type,
        candidate.metadata
      );
    },
    async listFrom(rid) {
      if (relationService.listFrom) return relationService.listFrom(rid);
      if (relationService.getByFromRid) return relationService.getByFromRid(rid);
      return [];
    },
    async listTo(rid) {
      if (relationService.listTo) return relationService.listTo(rid);
      if (relationService.getByToRid) return relationService.getByToRid(rid);
      return [];
    },
    async getByFromRidAndType(fromRid, type) {
      return relationService.getByFromRidAndType
        ? relationService.getByFromRidAndType(fromRid, type)
        : [];
    },
    async update(id, updates) {
      return relationService.update ? relationService.update(id, updates) : null;
    },
    async remove(fromRid, toRid, type) {
      return relationService.remove ? relationService.remove(fromRid, toRid, type) : false;
    }
  };
}

/* ── Noop 默认实现（SDK 兼容，未注入时安全调用） ── */

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
    async runAfter(result) { return result; }
  };
}

function createNoopEventBus() {
  return {
    on() { return () => {}; },
    off() {},
    emit() {},
    async emitAsync() {},
    eventNames: []
  };
}

function createNoopResourceFacade() {
  return {
    async create() { throw new Error('[PluginContext] resources.create 未注入，请在 lo 仓库中运行插件'); },
    async getByRid() { return null; },
    async list() { return []; },
    async update() { return null; },
    async delete() { return false; }
  };
}

function createNoopRelationFacade() {
  return {
    async create() { throw new Error('[PluginContext] relations.create 未注入，请在 lo 仓库中运行插件'); },
    async listFrom() { return []; },
    async listTo() { return []; },
    async getByFromRidAndType() { return []; },
    async update() { return null; },
    async remove() { return false; }
  };
}

module.exports = PluginContext;
