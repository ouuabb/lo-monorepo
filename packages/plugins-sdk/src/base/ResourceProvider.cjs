/**
 * ResourceProvider —— 资源发现抽象基类
 *
 * 1.md §6 定义的"Resource Discovery"概念：
 *   外部系统 → Plugin（ResourceProvider）→ ResourceCandidate → lo Core → Resource
 *
 * 子类必须实现：
 *   providerId          —— 标识，如 'epub' / 'git' / 'chrome'
 *   discover(context)   —— 返回 ResourceCandidate[] 或 Promise<ResourceCandidate[]>
 *
 * 可选重写：
 *   supports(source)    —— 是否支持给定的输入源（路径/URL/事件对象等）
 *   watch(source, onChange) —— 监听源变化，增量推送新增 candidates（默认不支持）
 */
const Plugin = require('../Plugin.cjs');

class ResourceProvider extends Plugin {
  constructor() {
    super();
  }

  /**
   * Provider 标识（建议与插件 ID 一致）
   * @type {string}
   */
  get providerId() {
    return this.manifest && this.manifest() ? this.manifest().id : this.constructor.name;
  }

  /**
   * 注册到 ExtensionRegistry 时使用的扩展点 key
   * @internal 由 lo Plugin System 自动注册
   */
  get extensionKey() {
    return `resourceProvider:${this.providerId}`;
  }

  /**
   * 判断是否支持指定输入源。
   * 默认返回 true —— 子类可按文件扩展名/URL schema/对象特征等过滤。
   *
   * @param {string|object} source — 输入源（文件路径、目录、URL、事件对象等）
   * @returns {boolean|Promise<boolean>}
   */
  supports(source) {
    return true;
  }

  /**
   * 从输入源发现 Resource Candidate
   *
   * 注意：
   *   1. 必须返回 Array，元素是 ResourceCandidate（直接对象或用 ResourceBuilder.build() 构造）
   *   2. 返回的 candidate 中 relation 必须用 {from_rid, to_rid, type, metadata?} 结构
   *   3. 不必关心 rid 分配：未指定 rid 时 Core 会自动生成
   *
   * @example
   * async discover(ctx, source) {
   *   const book = ResourceBuilder
   *     .note()
   *     .name(`${source} - 书籍`)
   *     .meta('title', '书名')
   *     .build();
   *
   *   const chapter = ResourceBuilder
   *     .note()
   *     .name('第一章')
   *     .meta('category', '章节')
   *     .build();
   *
   *   return [
   *     { resource: book },
   *     { resource: chapter,
   *       relations: [{ from_rid: '__book__', to_rid: '__chapter__', type: 'contains', metadata: { order: 1 } }] },
   *   ];
   * }
   *
   * @param {import('./PluginContext.cjs')} ctx  — 插件上下文
   * @param {string|object} [source] — 输入源（可选；不传时执行全量扫描）
   * @returns {Promise<Array<ResourceProviderCandidate>>}
   *
   * ResourceProviderCandidate 结构：
   *   {
   *     resource: ResourceCandidate,                 // 必填
   *     relations?: RelationCandidate[]               // 与本资源同时创建的关系
   *   }
   */
  async discover(ctx, source) {
    throw new Error(
      `[ResourceProvider] ${this.constructor.name} 必须实现 discover(ctx, source) 方法，` +
      `返回 ResourceCandidate[] 或 { resource, relations? }[] 数组`
    );
  }

  /**
   * 启动对输入源的增量监听（可选）。
   * 默认抛错 "not supported"。
   *
   * @param {string|object} source
   * @param {Function} onChange — (newCandidates: ProviderCandidate[]) => void
   * @returns {Promise<() => void>} 取消监听的 dispose 函数
   */
  async watch(source, onChange) {
    throw new Error(
      `[ResourceProvider] ${this.constructor.name} 不支持增量监听`
    );
  }

  /**
   * @internal 由 Plugin System 调用：自动注册 ResourceProvider
   */
  register(context) {
    super.register(context);
    // 在 ExtensionRegistry 注册自己，让 Core 能枚举并调用 discover()
    try {
      context.extensions.register(
        this.providerId,
        'resourceProviders',
        this.providerId,
        {
          providerId: this.providerId,
          supports: this.supports.bind(this),
          // 注意：不绑死 context，由 DiscoveryService 在调用时传入
          // （DiscoveryService 会为每次 discover 创建带 config 的 ctx）
          discover: this.discover.bind(this),
          watch: this.watch.bind(this),
        }
      );
    } catch (e) {
      // 注册重复或 context 未注入时静默（单元测试 noop registry 也会进这里）
    }
  }
}

module.exports = ResourceProvider;
