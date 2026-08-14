/**
 * AgentPluginContext —— 插件运行时上下文
 *
 * 插件通过 ctx 与宿主(lo-agent)交互。SDK 定义**稳定契约**，
 * 真实能力由 lo-agent Host 在激活插件时注入。
 *
 * 设计原则:
 *   1. 所有能力都有 noop 默认实现,单元测试/未注入时不崩溃
 *   2. ctx.lo 是**接口契约**——SDK 不实现,由 Host Adapter 注入实现
 *   3. 不透传 @lo/client 原始实例;统一经 ctx.lo 门面
 */
const { createLoFacade } = require('./lo-facade.cjs');
const { createExtensionsFacade } = require('./extensions-facade.cjs');

class AgentPluginContext {
  /**
   * @param {object} [injections]
   * @param {string} [injections.pluginId]   — 当前插件 ID
   * @param {object} [injections.loImpl]     — Host Adapter 注入的 lo 能力实现
   * @param {object} [injections.extensionsImpl] — Host 注入的能力注册实现(registerCommands 等)
   * @param {object} [injections.logger]     — Logger 实例
   * @param {object} [injections.configValues] — 插件配置值对象
   * @param {object} [injections.events]     — 事件总线(AgentEventEmitter)
   * @param {object} [injections.settings]   — 插件持久化设置读写
   * @param {object} [injections.permissions] — 插件权限(resolvePermissions 输出),用于 ctx.lo 白名单过滤
   */
  constructor(injections = {}) {
    this._pluginId = injections.pluginId || null;
    this._loImpl = injections.loImpl || null;
    this._extensionsImpl = injections.extensionsImpl || null;
    this._logger = injections.logger || null;
    this._configValues = injections.configValues || {};
    this._events = injections.events || null;
    this._settings = injections.settings || null;
    this._permissions = injections.permissions || null;
  }

  /** 当前插件 ID */
  get pluginId() {
    return this._pluginId;
  }

  /** 日志接口 */
  get logger() {
    return this._logger || createNoopLogger();
  }

  /** 事件总线 */
  get events() {
    return this._events || createNoopEvents();
  }

  /**
   * 读取插件配置
   * @param {string} [key] — 不传返回全部
   * @param {*} [defaultValue]
   */
  config(key, defaultValue) {
    const cfg = this._configValues || {};
    if (key === undefined) return cfg;
    return cfg[key] !== undefined ? cfg[key] : defaultValue;
  }

  /** 持久化设置读写(宿主注入时可用) */
  get settings() {
    return this._settings || null;
  }

  /**
   * lo 能力门面 —— 插件侧接口契约。
   * SDK 只定义契约,不实现;实现由 Host Adapter 注入。
   * 权限白名单:manifest.permissions.lo 决定可调用方法,未授权抛错。
   */
  get lo() {
    const meta = { pluginId: this._pluginId };
    // 仅在注入 permissions 时才启用白名单过滤（向后兼容：未注入不限制）
    if (this._permissions) meta.permissions = this._permissions;
    return createLoFacade(this._loImpl, meta);
  }

  /**
   * 扩展点注册门面 —— 插件注册命令/视图等运行时能力。
   * SDK 只定义契约;实现由 Host ExtensionRegistry 适配器注入。
   */
  get extensions() {
    return createExtensionsFacade(this._extensionsImpl, { pluginId: this._pluginId });
  }
}

/* ── noop 注入(未初始化场景) ── */

function createNoopLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
    child() {
      return createNoopLogger();
    },
  };
}

function createNoopEvents() {
  return {
    on() {
      return () => {};
    },
    off() {},
    once() {
      return () => {};
    },
    emit() {},
    emitAsync() {},
  };
}

module.exports = { AgentPluginContext };
