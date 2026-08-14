/**
 * @lo/agent-plugins-sdk —— lo-agent 插件开发工具包入口
 *
 * 稳定公开 API:
 *   - AgentPlugin         —— 插件基类
 *   - AgentPluginContext  —— 插件运行时上下文(结构 + 注入点)
 *   - createLoFacade      —— ctx.lo 接口契约(SDK 不实现,Host 注入实现)
 *   - validateManifest    —— manifest schema 校验
 *   - LIFECYCLE_*         —— 生命周期状态定义
 *   - CAPABILITY_* / PERMISSION_* / DEFAULT_PERMISSIONS —— 能力/权限类型
 *   - AgentEventEmitter   —— 事件总线
 *   - Logger 等           —— 日志
 *
 * 依赖方向:
 *   Plugin → ctx.lo(契约) → Host Adapter(实现) → @lo/client → lo Core
 *
 * SDK 不依赖 lo-agent；SDK 不替代 @lo/client；SDK 不定义二次协议。
 */
const AgentPlugin = require('./AgentPlugin.cjs');
const { AgentPluginContext } = require('./AgentPluginContext.cjs');
const { createLoFacade, LO_CAPABILITIES, LO_PERMISSION_MAP } = require('./lo-facade.cjs');
const { createExtensionsFacade, EXTENSIONS_METHODS } = require('./extensions-facade.cjs');
const AgentEventEmitter = require('./AgentEventEmitter.cjs');
const {
  validateManifest,
  manifestSchema,
  REQUIRED_FIELDS,
  ID_PATTERN,
  SEMVER_PATTERN,
  CONTRIBUTE_TYPES,
  PERMISSION_LO_CAPABILITIES,
  ACTIVATION_TRIGGER_PREFIXES,
  ACTIVATION_TRIGGER_PATTERN,
} = require('./manifest.cjs');
const {
  LIFECYCLE_STATES,
  LIFECYCLE_TRANSITIONS,
  LIFECYCLE_STATE_SET,
  canTransition,
} = require('./lifecycle.cjs');
const {
  CAPABILITY_TYPES,
  DEFAULT_PERMISSIONS,
  PERMISSION_LO,
  resolvePermissions,
} = require('./types.cjs');
const { createExtensionPoint, EXTENSION_TYPES } = require('./extension-point.cjs');
const { parseContributes } = require('./contributes.cjs');
const { createPlugin } = require('./loadPlugin.cjs');
const { Logger, ConsoleLogger, SilentLogger, fromHost } = require('./Logger.cjs');

const SDK_VERSION = require('../package.json').version;

module.exports = {
  // 基类
  AgentPlugin,
  AgentPluginContext,

  // lo 能力门面契约
  createLoFacade,
  LO_CAPABILITIES,
  LO_PERMISSION_MAP,

  // 扩展点注册门面契约
  createExtensionsFacade,
  EXTENSIONS_METHODS,

  // manifest
  validateManifest,
  manifestSchema,
  REQUIRED_FIELDS,
  ID_PATTERN,
  SEMVER_PATTERN,
  CONTRIBUTE_TYPES,
  PERMISSION_LO_CAPABILITIES,
  ACTIVATION_TRIGGER_PREFIXES,
  ACTIVATION_TRIGGER_PATTERN,

  // lifecycle
  LIFECYCLE_STATES,
  LIFECYCLE_TRANSITIONS,
  LIFECYCLE_STATE_SET,
  canTransition,

  // capability / permission
  CAPABILITY_TYPES,
  DEFAULT_PERMISSIONS,
  PERMISSION_LO,
  resolvePermissions,

  // 扩展点（纯数据声明）
  createExtensionPoint,
  EXTENSION_TYPES,
  parseContributes,

  // 加载
  createPlugin,

  // 事件
  AgentEventEmitter,

  // 日志
  Logger,
  ConsoleLogger,
  SilentLogger,
  fromHost,

  // 元信息
  SDK_VERSION,
};
