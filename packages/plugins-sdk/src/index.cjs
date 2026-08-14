/**
 * @lo/plugins-sdk —— lo 插件开发工具包入口
 *
 * 稳定公开 API 列表：
 *   - Plugin            —— 插件基类（最常用的通用插件）
 *   - ResourceProvider  —— 资源发现插件基类（Adapter / Connector / Discovery 角色）
 *   - PluginContext     —— 插件运行时上下文接口
 *   - ResourceBuilder   —— 构造 Resource Candidate（链式）
 *   - RelationBuilder   —— 构造 Relation Candidate（链式）
 *   - Logger            —— 统一日志接口 + console/silent 实现
 *   - EventApi          —— 事件总线接口（on/off/emit/emitAsync）
 *
 * 插件代码应该只从 '@lo/plugins-sdk' 或 'lo-plugins-sdk' require，永不 require lo-core 内部文件。
 *
 * 用法示例：
 *
 *   const { Plugin, ResourceBuilder, RelationBuilder } = require('@lo/plugins-sdk');
 *
 *   class EpubPlugin extends Plugin {
 *     manifest() { return { id: 'epub', name: 'EPUB Adapter', version: '1.0.0' }; }
 *     register(ctx) {
 *       ctx.extensions.register('epub', 'resourceTypes', 'epub', {
 *         extractMetadata(filePath) { return { title: '...' }; }
 *       });
 *     }
 *   }
 *
 *   module.exports = EpubPlugin;
 */

const Plugin = require('./Plugin.cjs');
const ResourceProvider = require('./base/ResourceProvider.cjs');
const PluginContext = require('./PluginContext.cjs');
const ResourceBuilder = require('./builders/ResourceBuilder.cjs');
const RelationBuilder = require('./builders/RelationBuilder.cjs');
const Logger = require('./Logger.cjs');
const EventApi = require('./EventApi.cjs');

/**
 * SDK 版本号（与 package.json.version 保持一致）
 */
const SDK_VERSION = require('../package.json').version;

module.exports = {
  // 基类
  Plugin,
  ResourceProvider,

  // 上下文
  PluginContext,

  // Builder
  ResourceBuilder,
  RelationBuilder,

  // 工具接口
  Logger,
  EventApi,

  // 元信息
  SDK_VERSION,
};
