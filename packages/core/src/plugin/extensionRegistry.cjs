/**
 * ExtensionRegistry — 扩展注册表
 *
 * Phase 6.1: 管理所有扩展点（Extension Points）。
 *
 * 扩展点类型:
 *   resourceTypes    — 资源类型处理器
 *   relationTypes    — 关系类型处理器
 *   commands         — CLI 命令
 *   renderers        — 渲染器
 *   importers        — 导入器
 *   exporters        — 导出器
 *   searchProviders  — 搜索提供商
 *   views            — 视图
 */

class ExtensionRegistry {
  constructor() {
    /** @type {Map<string, Map<string, any>>} */
    this._extensions = new Map();

    // 初始化所有扩展点
    this._extensions.set("resourceTypes", new Map());
    this._extensions.set("relationTypes", new Map());
    this._extensions.set("commands", new Map());
    this._extensions.set("renderers", new Map());
    this._extensions.set("importers", new Map());
    this._extensions.set("exporters", new Map());
    this._extensions.set("searchProviders", new Map());
    this._extensions.set("views", new Map());
    this._extensions.set("resourceProviders", new Map());
  }

  /**
   * 注册扩展
   * @param {string} pluginId — 插件 ID
   * @param {string} extensionType — 扩展点类型
   * @param {string} key — 扩展键（如资源类型名 "markdown"）
   * @param {any} handler — 处理器
   */
  register(pluginId, extensionType, key, handler) {
    if (!this._extensions.has(extensionType)) {
      throw new Error(`Unknown extension type: ${extensionType}`);
    }

    const extMap = this._extensions.get(extensionType);
    if (extMap.has(key)) {
      const existing = extMap.get(key);
      throw new Error(
        `Extension '${extensionType}.${key}' is already registered by '${existing.pluginId}'`,
      );
    }

    extMap.set(key, { pluginId, handler });
  }

  /**
   * 批量注册
   * @param {string} pluginId
   * @param {object} contributes — manifest.contributes
   */
  registerAll(pluginId, contributes) {
    if (!contributes) return;

    const types = [
      "resourceTypes",
      "relationTypes",
      "commands",
      "renderers",
      "importers",
      "exporters",
      "searchProviders",
      "views",
      "resourceProviders",
    ];

    for (const type of types) {
      if (contributes[type]) {
        for (const key of contributes[type]) {
          // key 可以是字符串（type name）或对象
          const extKey = typeof key === "string" ? key : key.id || key.type;
          if (extKey) {
            this.register(pluginId, type, extKey, key);
          }
        }
      }
    }
  }

  /**
   * 注销插件的所有扩展
   * @param {string} pluginId
   */
  unregisterAll(pluginId) {
    for (const [, extMap] of this._extensions) {
      for (const [key, entry] of extMap) {
        if (entry.pluginId === pluginId) {
          extMap.delete(key);
        }
      }
    }
  }

  /**
   * 获取扩展
   * @param {string} extensionType
   * @param {string} key
   * @returns {any|undefined}
   */
  get(extensionType, key) {
    const extMap = this._extensions.get(extensionType);
    if (!extMap) return undefined;
    const entry = extMap.get(key);
    return entry ? entry.handler : undefined;
  }

  /**
   * 列出某扩展点的所有扩展
   * @param {string} extensionType
   * @returns {Array<{ key: string, pluginId: string, handler: any }>}
   */
  list(extensionType) {
    const extMap = this._extensions.get(extensionType);
    if (!extMap) return [];
    return Array.from(extMap.entries()).map(([key, entry]) => ({
      key,
      pluginId: entry.pluginId,
      handler: entry.handler,
    }));
  }

  /**
   * 列出所有扩展类型
   */
  types() {
    return Array.from(this._extensions.keys());
  }

  /**
   * 检查资源类型是否已注册
   */
  hasResourceType(type) {
    return this._extensions.get("resourceTypes").has(type);
  }

  /**
   * 获取资源类型列表
   */
  resourceTypes() {
    return Array.from(this._extensions.get("resourceTypes").keys());
  }

  /**
   * 获取关系类型列表
   */
  relationTypes() {
    return Array.from(this._extensions.get("relationTypes").keys());
  }

  /**
   * 获取命令列表
   */
  commands() {
    return Array.from(this._extensions.get("commands").keys());
  }
}

module.exports = ExtensionRegistry;
