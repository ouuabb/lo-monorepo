/**
 * DiscoveryService — 资源发现管道
 *
 * P0-3: 将 ResourceProvider 的 discover() 结果写入 lo Core。
 *
 * 管道流程:
 *   1. 从 ExtensionRegistry 获取 resourceProvider
 *   2. Hook: beforeDiscover（可过滤/修改 source）
 *   3. provider.discover(ctx, source) → candidates[]
 *   4. Hook: afterDiscover（可修改 candidates）
 *   5. 逐个 candidate:
 *      a. Hook: beforeResourceCreate（可去重/合并/取消）
 *      b. ResourceService.create(candidate) → resource
 *      c. Hook: afterResourceCreate
 *   6. 逐个 relation candidate:
 *      a. RelationService.create(from, to, type, metadata)
 *   7. 返回 { resources, relations, skipped, errors }
 *
 * watch 模式:
 *   provider.watch(source, onChange) → onChange(candidates)
 *   每次变更触发 step 5-6
 */

const PluginContext = require("./pluginContext.cjs");

class DiscoveryService {
  /**
   * @param {object} deps
   * @param {object} deps.repository        — Repository 实例
   * @param {object} deps.extensionRegistry — ExtensionRegistry 实例
   * @param {object} deps.hookManager       — HookManager 实例
   * @param {object} deps.logger            — 日志
   */
  constructor({ repository, extensionRegistry, hookManager, logger }) {
    this.repository = repository;
    this.extensionRegistry = extensionRegistry;
    this.hookManager = hookManager;
    this.logger = logger || console;
    this._watchers = new Map(); // providerKey → { stop, source }
  }

  /**
   * 列出所有已注册的 resourceProvider
   * @returns {Array<{ key: string, pluginId: string, value: object }>}
   */
  listProviders() {
    return this.extensionRegistry.list("resourceProviders");
  }

  /**
   * 获取指定 provider
   * @param {string} providerKey — provider 扩展点 key
   * @returns {object|null}
   */
  getProvider(providerKey) {
    const provider = this.extensionRegistry.get(
      "resourceProviders",
      providerKey,
    );
    return provider || null;
  }

  /**
   * 执行资源发现
   * @param {string} providerKey — provider 扩展点 key
   * @param {string} source      — 数据源路径/URL
   * @param {object} [options]
   * @param {boolean} [options.dryRun] — 只发现不写入
   * @param {object} [options.config]  — 传给 provider 的额外配置
   * @returns {Promise<{ resources: array, relations: array, skipped: array, errors: array, candidates: array }>}
   */
  async discover(providerKey, source, options = {}) {
    const { dryRun = false, config = {} } = options;

    // 1. 获取 provider
    const provider = this.getProvider(providerKey);
    if (!provider) {
      throw new Error(`ResourceProvider "${providerKey}" 未注册`);
    }

    // 检查 provider 是否支持该 source
    if (typeof provider.supports === "function" && !provider.supports(source)) {
      throw new Error(`Provider "${providerKey}" 不支持 source: ${source}`);
    }

    // 2. 构建 PluginContext
    const ctx = this._createContext(providerKey, config);

    // 3. Hook: beforeDiscover
    let effectiveSource = source;
    if (this.hookManager) {
      const result = await this.hookManager.runBefore("plugin:beforeDiscover", {
        providerKey,
        source,
        config,
      });
      if (result.cancelled) {
        this.logger.log(`[discover] beforeDiscover Hook 取消了操作`);
        return {
          resources: [],
          relations: [],
          skipped: [],
          errors: [],
          candidates: [],
          cancelled: true,
        };
      }
      effectiveSource = result.payload.source;
    }

    // 4. 调用 provider.discover
    this.logger.log(
      `[discover] ${providerKey} discovering: ${effectiveSource}`,
    );
    let candidates;
    try {
      candidates = await provider.discover(ctx, effectiveSource);
    } catch (e) {
      throw new Error(`Provider "${providerKey}" discover 失败: ${e.message}`);
    }

    if (!Array.isArray(candidates)) {
      candidates = [];
    }

    // 5. Hook: afterDiscover
    if (this.hookManager) {
      const afterResult = await this.hookManager.runAfter(
        "plugin:afterDiscover",
        {
          providerKey,
          source: effectiveSource,
          candidates,
        },
      );
      // afterDiscover 可以修改 candidates
      if (afterResult && afterResult.candidates) {
        candidates = afterResult.candidates;
      }
    }

    // dryRun 模式：只返回 candidates 不写入
    if (dryRun) {
      this.logger.log(
        `[discover] dry-run 模式，发现 ${candidates.length} 个候选，不写入`,
      );
      return {
        resources: [],
        relations: [],
        skipped: [],
        errors: [],
        candidates,
      };
    }

    // 6. 写入 Core
    return this._persistCandidates(candidates, providerKey, ctx);
  }

  /**
   * 启动增量监听
   * @param {string} providerKey
   * @param {string} source
   * @param {object} [options]
   * @returns {Promise<void>}
   */
  async watch(providerKey, source, options = {}) {
    const { config = {} } = options;

    // 如果已经在 watch，先停止
    if (this._watchers.has(providerKey)) {
      await this.stopWatch(providerKey);
    }

    const provider = this.getProvider(providerKey);
    if (!provider) {
      throw new Error(`ResourceProvider "${providerKey}" 未注册`);
    }

    if (typeof provider.watch !== "function") {
      throw new Error(`Provider "${providerKey}" 不支持增量监听 (watch)`);
    }

    const ctx = this._createContext(providerKey, config);

    this.logger.log(`[watch] ${providerKey} watching: ${source}`);

    const stop = await provider.watch(source, async (candidates) => {
      this.logger.log(
        `[watch] ${providerKey} 收到变更: ${candidates.length} 个候选`,
      );
      await this._persistCandidates(candidates, providerKey, ctx);
    });

    this._watchers.set(providerKey, { stop, source });

    return stop;
  }

  /**
   * 停止增量监听
   * @param {string} providerKey
   */
  async stopWatch(providerKey) {
    const watcher = this._watchers.get(providerKey);
    if (!watcher) return;

    if (typeof watcher.stop === "function") {
      await watcher.stop();
    }
    this._watchers.delete(providerKey);
    this.logger.log(`[watch] ${providerKey} 已停止`);
  }

  /**
   * 停止所有监听
   */
  async stopAllWatchers() {
    const keys = Array.from(this._watchers.keys());
    for (const key of keys) {
      await this.stopWatch(key);
    }
  }

  // ── 内部方法 ──

  /**
   * 创建 PluginContext 供 provider 使用
   */
  _createContext(providerKey, config) {
    return new PluginContext({
      repository: this.repository,
      resourceService: this.repository.resourceService,
      relationService: this.repository.relationService,
      extensionRegistry: this.extensionRegistry,
      hookManager: this.hookManager,
      eventBus: this.repository._eventBus || null,
      logger: this.logger,
      config,
      pluginId: providerKey,
    });
  }

  /**
   * 将 candidates 写入 Core（ResourceService + RelationService）
   */
  async _persistCandidates(candidates, providerKey, ctx) {
    const resources = [];
    const relations = [];
    const skipped = [];
    const errors = [];

    for (const candidate of candidates) {
      try {
        // 判断是资源候选还是关系候选
        if (candidate.from_rid && candidate.to_rid && candidate.type) {
          // 关系候选
          const rel = await this._createRelation(candidate, providerKey);
          if (rel) {
            relations.push(rel);
          } else {
            skipped.push(candidate);
          }
        } else if (candidate.type && (candidate.path || candidate.name)) {
          // 资源候选
          const resource = await this._createResource(
            candidate,
            providerKey,
            ctx,
          );
          if (resource) {
            resources.push(resource);
          } else {
            skipped.push(candidate);
          }
        } else {
          // 无法识别的候选
          skipped.push(candidate);
        }
      } catch (e) {
        errors.push({ candidate, error: e.message });
        this.logger.error(`[discover] 创建失败: ${e.message}`);
      }
    }

    this.logger.log(
      `[discover] ${providerKey} 完成: ` +
        `${resources.length} 资源, ${relations.length} 关系, ` +
        `${skipped.length} 跳过, ${errors.length} 错误`,
    );

    return { resources, relations, skipped, errors, candidates };
  }

  /**
   * 创建单个资源（带 Hook）
   */
  async _createResource(candidate, providerKey, ctx) {
    // Hook: beforeResourceCreate
    if (this.hookManager) {
      const result = await this.hookManager.runBefore(
        "plugin:beforeResourceCreate",
        {
          candidate,
          providerKey,
        },
      );
      if (result.cancelled) {
        return null; // 被 Hook 取消
      }
      // Hook 可能修改了 candidate
      if (result.payload && result.payload.candidate) {
        candidate = result.payload.candidate;
      }
    }

    // 通过 Facade 创建
    const resource = await ctx.resources.create(candidate);

    // Hook: afterResourceCreate
    if (this.hookManager) {
      await this.hookManager.runAfter("plugin:afterResourceCreate", {
        resource,
        providerKey,
        candidate,
      });
    }

    return resource;
  }

  /**
   * 创建单个关系（带 Hook）
   */
  async _createRelation(candidate, providerKey) {
    // Hook: beforeRelationCreate
    if (this.hookManager) {
      const result = await this.hookManager.runBefore(
        "plugin:beforeRelationCreate",
        {
          candidate,
          providerKey,
        },
      );
      if (result.cancelled) {
        return null;
      }
      if (result.payload && result.payload.candidate) {
        candidate = result.payload.candidate;
      }
    }

    const rel = await this.repository.relationService.create(
      candidate.from_rid,
      candidate.to_rid,
      candidate.type,
      candidate.metadata || {},
    );

    // Hook: afterRelationCreate
    if (this.hookManager) {
      await this.hookManager.runAfter("plugin:afterRelationCreate", {
        relation: rel,
        providerKey,
        candidate,
      });
    }

    return rel;
  }
}

module.exports = DiscoveryService;
