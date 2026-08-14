/**
 * @lo/plugins-sdk —— TypeScript 类型声明
 *
 * 插件开发者如果使用 TypeScript，可从 '@lo/plugins-sdk' 获得类型提示。
 * 注意：这是类型层，不影响运行时（运行时仍是 CommonJS 的 .cjs 实现）。
 */

/* ───────────────────────────────── Manifest ───────────────────────────────── */

export interface PluginManifest {
  /** 唯一 ID，建议 kebab-case */
  id: string;
  /** 展示名 */
  name: string;
  /** 语义化版本 */
  version: string;
  /** 简介 */
  description?: string;
  /** 角色标签 */
  role?: 'adapter' | 'connector' | 'discovery' | 'general';
  /** 作者 */
  author?: string;
  /** 需要的 lo 版本（如 '>=0.1.0'） */
  loVersion?: string;
  /** 依赖的其他插件 ID 列表 */
  dependencies?: string[];
  /**
   * 插件配置 schema（key → { type, default, description }）
   * PluginManager 读取并落 plugin_settings 表，`ctx.config(key)` 返回已合并默认值
   */
  config?: Record<
    string,
    {
      type?: 'string' | 'number' | 'boolean';
      default?: any;
      description?: string;
    }
  >;
  /** 声明使用的扩展点列表 */
  extensions?: string[];
  /** 声明式扩展点注册 */
  contributes?: {
    /** 自定义资源类型（数组形态：{ type, extensions?, metadataSchema?, description? }） */
    resourceTypes?: Array<{
      type: string;
      extensions?: string[];
      /** 自定义 metadata 字段 schema，type 取值: string | number | boolean | array */
      metadataSchema?: Record<
        string,
        { type: 'string' | 'number' | 'boolean' | 'array' }
      >;
      description?: string;
    }>;
    /** 自定义关系类型（数组形态） */
    relationTypes?: Array<{
      type: string;
      description?: string;
    }>;
    commands?: Record<string, { description?: string }>;
    importers?: Record<string, object>;
    exporters?: Record<string, object>;
    renderers?: Record<string, object>;
    searchProviders?: Record<string, object>;
    views?: Record<string, object>;
  };
}

/* ─────────────────────────────── Resource / Relation ────────────────────────── */

export interface ResourceCandidate {
  type: string;
  path?: string;
  name?: string;
  rid?: string;
  metadata?: Record<string, any>;
  capabilities?: string[];
  container_schema?: { ignored_patterns: string[] };
}

export interface RelationCandidate {
  from_rid: string;
  to_rid: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface ResourceProviderCandidate {
  resource: ResourceCandidate;
  relations?: RelationCandidate[];
}

/* ─────────────────────────────── Facade 接口 ───────────────────────────────── */

export interface ExtensionRegistry {
  register(pluginId: string, extensionPoint: string, key: string, value: any): void;
  unregister(extensionPoint: string, key: string): void;
  get<T = any>(extensionPoint: string, key: string): T | null;
  has(extensionPoint: string, key: string): boolean;
  list<T = any>(extensionPoint: string): T[];
}

export interface HookManager {
  register(hookName: string, handler: Function): void;
  unregister(hookName: string, handler: Function): void;
  runBefore<T>(payload: T, ...extra: any[]): Promise<T>;
  runAfter<T>(result: T, ...extra: any[]): Promise<T>;
}

export interface EventBus {
  on(eventName: string, handler: Function): () => void;
  off(eventName: string, handler: Function): void;
  emit(eventName: string, ...args: any[]): void;
  emitAsync(eventName: string, ...args: any[]): Promise<void>;
  readonly eventNames: string[];
}

export interface ResourceFacade {
  create(candidate: ResourceCandidate): Promise<any>;
  getByRid(rid: string): Promise<any | null>;
  list(query?: object): Promise<any[]>;
  update(rid: string, patch: object): Promise<any | null>;
  delete(rid: string): Promise<boolean>;
}

export interface RelationFacade {
  create(candidate: RelationCandidate): Promise<any | null>;
  listFrom(rid: string): Promise<any[]>;
  listTo(rid: string): Promise<any[]>;
  remove(fromRid: string, toRid: string, type?: string): Promise<boolean>;
}

/* ─────────────────────────────── PluginContext ──────────────────────────────── */

export declare class PluginContext {
  constructor(injections?: {
    pluginId?: string;
    logger?: Logger;
    config?: Record<string, any>;
    extensionRegistry?: ExtensionRegistry;
    hookManager?: HookManager;
    eventBus?: EventBus;
    resources?: ResourceFacade;
    relations?: RelationFacade;
  });

  readonly pluginId: string | null;
  readonly logger: Logger;
  readonly extensions: ExtensionRegistry;
  readonly hooks: HookManager;
  readonly events: EventBus;
  readonly resources: ResourceFacade;
  readonly relations: RelationFacade;

  config(): Record<string, any>;
  config<T = any>(key: string, defaultValue?: T): T;
  setConfig(key: string, value: any): Promise<void>;
}

/* ─────────────────────────────── Logger ─────────────────────────────────────── */

export declare class Logger {
  constructor(options?: {
    prefix?: string;
    target?: { log?: Function; info?: Function; warn?: Function; error?: Function };
    level?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  });

  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  child(subPrefix: string): Logger;

  static console(prefix?: string): Logger;
  static silent(): Logger;
}

/* ─────────────────────────────── EventApi ───────────────────────────────────── */

export declare class EventApi implements EventBus {
  constructor();
  on(eventName: string, handler: Function): () => void;
  off(eventName: string, handler: Function): void;
  once(eventName: string, handler: Function): () => void;
  emit(eventName: string, ...args: any[]): void;
  emitAsync(eventName: string, ...args: any[]): Promise<void>;
  readonly eventNames: string[];
}

/* ─────────────────────────────── Builders ───────────────────────────────────── */

export declare class ResourceBuilder {
  constructor(type?: string);

  // 快捷工厂
  static note(): ResourceBuilder;
  static pdf(): ResourceBuilder;
  static image(): ResourceBuilder;
  static video(): ResourceBuilder;
  static audio(): ResourceBuilder;
  static html(): ResourceBuilder;
  static text(): ResourceBuilder;
  static code(): ResourceBuilder;
  static json(): ResourceBuilder;
  static yaml(): ResourceBuilder;
  static config(): ResourceBuilder;
  static document(): ResourceBuilder;
  static spreadsheet(): ResourceBuilder;
  static presentation(): ResourceBuilder;
  static data(): ResourceBuilder;
  static unknown(): ResourceBuilder;
  static of(type: string): ResourceBuilder;

  // 链式 setter
  type(type: string): this;
  path(path: string | null): this;
  name(name: string | null): this;
  meta(key: string, value: any): this;
  metas(obj: Record<string, any>): this;
  tag(tag: string): this;
  tags(list: string[]): this;
  capability(cap: string): this;
  capabilities(list: string[]): this;
  rid(rid: string | null): this;
  containerSchema(ignoredPatterns?: string[]): this;

  build(): ResourceCandidate;
  clone(): ResourceBuilder;
}

export declare class RelationBuilder {
  constructor();

  // 快捷工厂
  static contains(fromRid: string, toRid: string): RelationBuilder;
  static link(fromRid: string, toRid: string): RelationBuilder;
  static references(fromRid: string, toRid: string): RelationBuilder;
  static depends(fromRid: string, toRid: string): RelationBuilder;

  // 链式 setter
  from(rid: string): this;
  to(rid: string): this;
  type(type: string): this;
  meta(key: string, value: any): this;
  metas(obj: Record<string, any>): this;

  build(): RelationCandidate;
}

/* ─────────────────────────────── Plugin 基类 ───────────────────────────────── */

export declare class Plugin {
  constructor();

  manifest(): PluginManifest;
  register(context: PluginContext): void;
  initialize(): Promise<void>;
  enable(): Promise<void>;
  disable(): Promise<void>;
  dispose(): Promise<void>;

  /** @internal 由 Core 注入 */
  $setContext(context: PluginContext): void;
  /** @internal 由 Core 读取 */
  readonly $manifest: PluginManifest;

  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly dependencies: string[];
  readonly contributes: PluginManifest['contributes'];

  context: PluginContext | null;
  /** 生命周期状态: created → loaded → initialized → enabled → disabled → disposed（由 Core 写入） */
  state: string;
  readonly isEnabled: boolean;
  readonly isDisposed: boolean;
}

/* ─────────────────────────────── ResourceProvider ──────────────────────────── */

export declare class ResourceProvider extends Plugin {
  constructor();

  readonly providerId: string;
  /** @internal */
  readonly extensionKey: string;

  supports(source: string | object): boolean | Promise<boolean>;
  discover(ctx: PluginContext, source?: string | object): Promise<ResourceProviderCandidate[]>;
  watch(
    source: string | object,
    onChange: (newCandidates: ResourceProviderCandidate[]) => void
  ): Promise<() => void>;

  register(context: PluginContext): void;
}

/* ─────────────────────────────── SDK 元信息 ────────────────────────────────── */

export const SDK_VERSION: string;
