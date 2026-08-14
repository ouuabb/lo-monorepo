/**
 * @lo/agent-plugins-sdk —— TypeScript 类型声明
 *
 * 纯类型声明(SDK 源码为 CommonJS);帮助 TS 消费者获得类型提示。
 */

// ── manifest ──

export interface ManifestConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean';
    default?: unknown;
    description?: string;
  };
}

export interface ManifestEngines {
  agent?: string;
  core?: string;
}

export type ActivationEvent =
  | 'onStartup'
  | '*'
  | `onCommand:${string}`
  | `onView:${string}`
  | `onPanel:${string}`
  | `onEditor:${string}`;

export interface ManifestContributes {
  commands?: Array<{ id: string; title?: string; handler?: (...args: unknown[]) => unknown }>;
  views?: Array<{ id: string; title?: string; type?: 'panel' | 'sidebar' | 'editor' }>;
  panels?: Array<{ id: string; title?: string }>;
  editors?: Array<{ id: string; title?: string; resourceType?: string }>;
  services?: Array<{ id: string; expose?: string[] }>;
}

export interface ManifestPermissions {
  lo?: string[];
  storage?: boolean;
  network?: boolean;
  shell?: boolean;
}

export interface AgentManifest {
  id: string;
  name: string;
  version: string;
  main: string;
  description?: string;
  author?: string;
  agentVersion?: string;
  engines?: ManifestEngines;
  dependsOn?: string[];
  ui?: string;
  activationEvents?: ActivationEvent[];
  contributes?: ManifestContributes;
  permissions?: ManifestPermissions;
  config?: ManifestConfigSchema;
}

export interface ManifestCheck {
  ok: boolean;
  manifest?: AgentManifest;
  errors?: string[];
}

export interface ManifestFieldRule {
  type: 'string' | 'object' | 'array' | 'boolean';
  required?: boolean;
  pattern?: string;
  allowedValues?: string[];
  allowedTypes?: string[];
  items?: ManifestFieldRule | null;
  properties?: Record<string, ManifestFieldRule>;
  description?: string;
}

export interface ManifestSchema {
  $id: string;
  title: string;
  version: string;
  required: string[];
  idPattern: string;
  semanticVersion: string;
  contributesTypes: string[];
  permissionsLoValues: string[];
  activationEventPrefixes: string[];
  properties: Record<string, ManifestFieldRule>;
}

export const manifestSchema: ManifestSchema;
export function validateManifest(manifest: unknown): ManifestCheck;

export const ACTIVATION_TRIGGER_PREFIXES: string[];

// ── 日志 ──

export interface LoggerLike {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(fields?: Record<string, unknown>): LoggerLike;
}

export class Logger implements LoggerLike {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(fields?: Record<string, unknown>): LoggerLike;
}
export class ConsoleLogger extends Logger {
  constructor(prefix?: string);
}
export class SilentLogger extends Logger {}
export function fromHost(hostLogger: LoggerLike | null | undefined): LoggerLike;

// ── 事件 ──

export class AgentEventEmitter {
  on(eventName: string, handler: (...args: unknown[]) => void): () => void;
  off(eventName: string, handler: (...args: unknown[]) => void): void;
  once(eventName: string, handler: (...args: unknown[]) => void): () => void;
  emit(eventName: string, ...args: unknown[]): void;
  emitAsync(eventName: string, ...args: unknown[]): Promise<void>;
  readonly eventNames: string[];
  clear(): void;
}

// ── lo 能力门面契约 ──
// SDK 只定义契约，不实现；由 Host Adapter 注入实现。

export interface OperationsFacade {
  execute(type: string, params?: object, options?: object): Promise<unknown>;
  list(query?: object): Promise<unknown>;
  get(id: string): Promise<unknown>;
  undo(id: string): Promise<unknown>;
}

export interface RelationsFacade {
  list(query?: object): Promise<unknown>;
  get(id: number | string): Promise<unknown>;
  create(from: string, to: string, type?: string, metadata?: object): Promise<unknown>;
  update(id: number | string, updates: object): Promise<unknown>;
  remove(id: number | string): Promise<unknown>;
}

export interface EventsFacade {
  subscribe(types: string | string[], handler: (event: unknown) => void): unknown;
  history(query?: object): Promise<unknown>;
}

export interface ResourcesFacade {
  list(query?: object): Promise<unknown>;
  get(rid: string): Promise<unknown>;
  search(q: string): Promise<unknown>;
}

export interface HealthFacade {
  stats(): Promise<unknown>;
}

export interface LoFacade {
  operations: OperationsFacade;
  relations: RelationsFacade;
  events: EventsFacade;
  resources: ResourcesFacade;
  health: HealthFacade;
}

export const LO_CAPABILITIES: Record<string, string[]>;

export const LO_PERMISSION_MAP: Record<string, Record<string, string>>;

export function createLoFacade(
  impl?: Partial<LoFacade> | null,
  meta?: { pluginId?: string; permissions?: ManifestPermissions },
): LoFacade;

// ── extensions 门面契约 ──
// 插件经 ctx.extensions 向宿主注册运行时能力（命令/视图等）。
// SDK 只定义契约，实现由 Host ExtensionRegistry 适配器注入。

export interface CommandDef {
  id: string;
  title?: string;
  handler: (args: unknown[], ctx: AgentPluginContextLike) => unknown;
}

export interface ViewDef {
  id: string;
  title?: string;
  type?: string;
  render: (context: Record<string, unknown>, ctx: AgentPluginContextLike) => string | Promise<string>;
}

export type ServiceApi = Record<string, (...args: unknown[]) => unknown>;

export interface ServiceDef {
  id: string;
  title?: string;
  version?: string;
  api: ServiceApi;
}

export interface AgentService {
  id: string;
  pluginId: string;
  title?: string;
  version?: string;
  api: ServiceApi;
}

export interface ExtensionsFacade {
  registerCommands(defs: CommandDef[]): unknown[];
  registerView(defs: ViewDef[]): unknown[];
  registerPanel(def: object): unknown;
  registerEditor(def: object): unknown;
  registerService(def: ServiceDef): unknown;
  getService(id: string): ServiceApi | null;
  listServices(): Array<Omit<AgentService, 'api'>>;
}

// ── 渲染端入口（mountEl UI）──
// manifest.ui 指向的 ESM 单文件（渲染进程 isolated world 中执行）。
// 导出 { views?, panels?, editors? }；render(mountEl, ctx) 挂载真实 DOM，
// 可返回清理函数（或 { dispose }）。ctx 为插件作用域能力入口。

export interface PluginUiCtx {
  pluginId: string;
  lo: LoFacade;
  config(key?: string, defaultValue?: unknown): unknown;
  executeCommand(commandId: string, args?: unknown[]): Promise<unknown>;
  notify(message: string): void;
}

export interface UiMount {
  render(
    mountEl: Element,
    ctx: PluginUiCtx,
  ): void | (() => void) | Promise<void | (() => void)>;
}

export interface PluginUiModule {
  views?: Record<string, UiMount>;
  panels?: Record<string, UiMount>;
  editors?: Record<string, UiMount>;
}

export const EXTENSIONS_METHODS: string[];

export function createExtensionsFacade(
  impl?: Partial<ExtensionsFacade> | null,
  meta?: { pluginId?: string },
): ExtensionsFacade;

// ── lifecycle ──

export type LifecycleState =
  | 'installed'
  | 'loaded'
  | 'activated'
  | 'enabled'
  | 'disabled'
  | 'deactivated'
  | 'disposed';

export const LIFECYCLE_STATES: LifecycleState[];
export const LIFECYCLE_TRANSITIONS: Record<LifecycleState, Set<LifecycleState>>;
export const LIFECYCLE_STATE_SET: Set<LifecycleState>;
export function canTransition(
  from: string,
  to: string,
): { ok: true } | { ok: false; error: string };

// ── capability / permission ──

export const CAPABILITY_TYPES: string[];
export const PERMISSION_LO_CAPABILITIES: string[];
export const PERMISSION_LO: Record<string, string>;
export const DEFAULT_PERMISSIONS: ManifestPermissions;
export function resolvePermissions(declared?: ManifestPermissions): ManifestPermissions;

// ── 扩展点（纯数据声明，无 handler） ──

export type ExtensionType = 'commands' | 'views' | 'panels' | 'editors' | 'services';
export const EXTENSION_TYPES: ExtensionType[];

export interface ExtensionPoint {
  pluginId: string;
  type: ExtensionType;
  id: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export function createExtensionPoint(def: {
  pluginId: string;
  type: ExtensionType;
  id: string;
  title?: string;
  metadata?: Record<string, unknown>;
}): ExtensionPoint;

export function parseContributes(manifest: AgentManifest): ExtensionPoint[];

// ── 上下文 ──

export interface PluginSettings {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface AgentPluginContextLike {
  readonly pluginId: string | null;
  readonly logger: LoggerLike;
  readonly events: AgentEventEmitter;
  readonly lo: LoFacade;
  readonly extensions: ExtensionsFacade;
  readonly settings: PluginSettings | null;
  config(key?: string, defaultValue?: unknown): unknown;
}

export class AgentPluginContext implements AgentPluginContextLike {
  constructor(injections?: Record<string, unknown>);
  readonly pluginId: string | null;
  readonly logger: LoggerLike;
  readonly events: AgentEventEmitter;
  readonly lo: LoFacade;
  readonly extensions: ExtensionsFacade;
  readonly settings: PluginSettings | null;
  config(key?: string, defaultValue?: unknown): unknown;
}

// ── 基类 ──

export class AgentPlugin {
  constructor();
  manifest(): AgentManifest;
  activate(context: AgentPluginContextLike): void | Promise<void>;
  enable(): Promise<void>;
  disable(): Promise<void>;
  deactivate(): Promise<void>;
  dispose(): Promise<void>;
  $setContext(context: AgentPluginContextLike): void;
  readonly $manifest: AgentManifest;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly context: AgentPluginContextLike | null;
  state: string;
  readonly isEnabled: boolean;
  readonly isDisposed: boolean;
}

// ── 加载 ──

export function createPlugin(PluginClass: unknown): AgentPlugin;
export const SDK_VERSION: string;
export const REQUIRED_FIELDS: string[];
export const ID_PATTERN: RegExp;
export const SEMVER_PATTERN: RegExp;
