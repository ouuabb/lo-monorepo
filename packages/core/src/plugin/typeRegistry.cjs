/**
 * TypeRegistry — 文件类型注册表（统一入口）
 *
 * 职责：合并 lo 内置类型（ResourceType）+ 插件扩展类型，提供统一的文件类型判断。
 *
 * 插件通过 manifest contributes.resourceTypes[].extensions 声明扩展名，
 * PluginManager 在插件激活时注册，卸载/禁用时注销。
 *
 * lo 核心所有需要判断文件类型的地方统一使用 TypeRegistry，
 * 而不是直接使用 ResourceType——这样插件扩展的类型自动对所有模块可见。
 */

const path = require('path');
const ResourceType = require('../utils/resourceType.cjs');

/** @type {Map<string, { type: string, pluginId: string }>} ext → 类型信息 */
const _pluginExtensions = new Map();

class TypeRegistry {
  /**
   * 注册插件扩展的文件类型
   * @param {string} pluginId — 插件 ID
   * @param {string} ext — 扩展名（如 '.epub'）
   * @param {string} type — 资源类型名（如 'epub'）
   */
  static register(pluginId, ext, type) {
    _pluginExtensions.set(ext.toLowerCase(), { type, pluginId });
  }

  /**
   * 注销插件注册的所有扩展类型
   * @param {string} pluginId — 插件 ID
   */
  static unregisterAll(pluginId) {
    for (const [ext, entry] of _pluginExtensions) {
      if (entry.pluginId === pluginId) {
        _pluginExtensions.delete(ext);
      }
    }
  }

  /**
   * 判断文件是否被支持（内置 + 插件扩展）
   * @param {string} filePath — 文件路径
   * @returns {boolean}
   */
  static isSupported(filePath) {
    if (ResourceType.isSupported(filePath)) return true;
    const ext = path.extname(filePath).toLowerCase();
    return _pluginExtensions.has(ext);
  }

  /**
   * 从文件路径推断资源类型
   * @param {string} filePath — 文件路径
   * @returns {string} 类型名，未知返回 'unknown'
   */
  static fromPath(filePath) {
    const built = ResourceType.fromPath(filePath);
    if (built !== 'unknown') return built;
    const ext = path.extname(filePath).toLowerCase();
    const entry = _pluginExtensions.get(ext);
    return entry ? entry.type : 'unknown';
  }

  /**
   * 获取类型对应的所有扩展名（内置 + 插件）
   * @param {string} type — 资源类型名
   * @returns {string[]}
   */
  static getExtensions(type) {
    const built = ResourceType.getExtensions(type);
    const plugin = Array.from(_pluginExtensions.entries())
      .filter(([, entry]) => entry.type === type)
      .map(([ext]) => ext);
    return [...built, ...plugin];
  }

  /**
   * 生成"不支持的文件类型"统一提示信息
   *
   * 当 lo 核心与已安装插件均未声明该文件扩展名时调用，
   * 用于在 import / list 等命令中向用户给出一致、可操作的反馈。
   *
   * @param {string} filePath — 文件路径
   * @returns {string} 统一提示文本
   */
  static getUnsupportedMessage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const extLabel = ext || '(无扩展名)';
    return `不支持的文件类型: ${extLabel}。lo 核心与已安装插件均未声明该扩展名。如需支持，请安装相应插件，或使用 --type <类型> 指定类型。`;
  }
}

module.exports = TypeRegistry;
