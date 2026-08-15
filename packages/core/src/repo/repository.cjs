const Database = require("./database.cjs");
const ResourceService = require("./resourceService.cjs");
const RelationService = require("./relationService.cjs");
const QueryEngine = require("./queryEngine.cjs");
const FileWatcher = require("./fileWatcher.cjs");
const StagingArea = require("./staging.cjs");
const SyncOpsEngine = require("./syncOps.cjs");
const SchemaRegistry = require("./schemaRegistry.cjs");
const ViewRegistry = require("./viewRegistry.cjs");
const ContainerService = require("./containerService.cjs");
const SourceService = require("./sourceService.cjs");
const ContainerSyncEngine = require("./containerSyncEngine.cjs");
const SyncConfigService = require("./syncConfigService.cjs");
const OperationRegistry = require("./operationRegistry.cjs");
const OperationEngine = require("./operationEngine.cjs");
const TransactionEngine = require("./transactionEngine.cjs");
const GraphBuilder = require("./graphBuilder.cjs");
const GraphEngine = require("./graphEngine.cjs");
const GraphExporter = require("./graphExporter.cjs");
const GraphCache = require("./graphCache.cjs");
const GraphQueryBuilder = require("../domain/graphQuery.cjs");
const NavigationEngine = require("./navigationEngine.cjs");
const VisualizationEngine = require("./visualizationEngine.cjs");
const VisualExporter = require("./visualExporter.cjs");
const KnowledgeAnalyzer = require("./knowledgeAnalyzer.cjs");
const KnowledgeTimeline = require("./knowledgeTimeline.cjs");
const RecommendationEngine = require("./recommendationEngine.cjs");
const AIContextBuilder = require("./aiContextBuilder.cjs");
const SemanticRelationEngine = require("./semanticRelationEngine.cjs");
const SuggestionEngine = require("./suggestionEngine.cjs");
const AIMemory = require("./aiMemory.cjs");
const KnowledgeAssistant = require("./knowledgeAssistant.cjs");
const KnowledgeRepair = require("./knowledgeRepair.cjs");
const KnowledgeScheduler = require("./knowledgeScheduler.cjs");
const ResourceLifecycle = require("../domain/resourceLifecycle.cjs");
const ResourceWatcher = require("./resourceWatcher.cjs");
const FederationManager = require("./federationManager.cjs");
const FederatedGraphEngine = require("./federatedGraphEngine.cjs");
const SyncEngine = require("./syncEngine.cjs");
const KnowledgeEvolutionEngine = require("./knowledgeEvolutionEngine.cjs");
const KnowledgePatternEngine = require("./knowledgePatternEngine.cjs");
const KnowledgeStrategyEngine = require("./knowledgeStrategyEngine.cjs");
const CollectiveKnowledgeEngine = require("./collectiveKnowledgeEngine.cjs");
const EvolutionMemory = require("./evolutionMemory.cjs");
const PluginManager = require("../plugin/pluginManager.cjs");
const EventBus = require("../event/eventBus.cjs");
const EventStore = require("../event/eventStore.cjs");
const EventMiddleware = require("../event/eventMiddleware.cjs");
const Workflow = require("../workflow/workflow.cjs");
const WorkflowRegistry = require("../workflow/workflowRegistry.cjs");
const WorkflowEngine = require("../workflow/workflowEngine.cjs");
const RuleEngine = require("../workflow/ruleEngine.cjs");
const PermissionManager = require("../security/permissionManager.cjs");
const PolicyEngine = require("../security/policyEngine.cjs");
const PermissionAudit = require("../security/permissionAudit.cjs");
const SecurityManager = require("../security/securityManager.cjs");
const RuntimeKernel = require("../runtime/runtimeKernel.cjs");
const Agent = require("../agent/agent.cjs");
const AgentRegistry = require("../agent/agentRegistry.cjs");
const AgentEngine = require("../agent/agentEngine.cjs");
const AgentStore = require("../agent/agentStore.cjs");
const AgentScheduler = require("../agent/agentScheduler.cjs");
const TeamRegistry = require("../collaboration/teamRegistry.cjs");
const CollaborationEngine = require("../collaboration/collaborationEngine.cjs");
const CollaborationMemory = require("../collaboration/collaborationMemory.cjs");
const SharedMemory = require("../collaboration/sharedMemory.cjs");
const MessageBus = require("../collaboration/messageBus.cjs");
const AIOS = require("../ai/aiOS.cjs");
const EvolutionEngine = require("../evolution/evolutionEngine.cjs");
const AutomationRegistry = require("../automation/AutomationRegistry.cjs");
const AutomationEngine = require("../automation/AutomationEngine.cjs");
const AutomationStore = require("../automation/AutomationStore.cjs");
const AutomationScheduler = require("../automation/AutomationScheduler.cjs");
const ActionExecutor = require("../automation/action/ActionExecutor.cjs");
const ActionRegistry = require("../automation/action/ActionRegistry.cjs");
const TriggerResolver = require("../automation/trigger/TriggerResolver.cjs");
const { loadOperations } = require("../operations/index.cjs");
const glob = require("glob");
const fs = require("fs-extra");
const path = require("path");
const ResourceType = require("../plugin/typeRegistry.cjs");
const MarkdownParser = require("../utils/markdownParser.cjs");
const StringUtils = require("../utils/string.cjs");

class Repository {
  constructor(repoPath = process.cwd()) {
    this.repoPath = repoPath;
    this.db = null;
    this.resourceService = null;
    this.relationService = null;
    this.queryEngine = null;
    this.watcher = null;
    this.schemaRegistry = null;
    this.staging = new StagingArea(repoPath);
    this.syncOps = null;
    this.operationLogger = null;
    this.operationRegistry = null;
    this.operationEngine = null;
    this.transactionEngine = null;
    this._graphCache = null;
    this.containerService = null;
    this.sourceService = null;
    this.syncEngine = null;
    this.syncConfigService = null;
    /** @type {import('../plugin/pluginManager.cjs')|null} 插件管理器（懒初始化） */
    this._pluginManager = null;
    /** @type {Buffer|null} 解密后的仓库加密密钥（仅存在于内存中） */
    this._cryptoKey = null;
    /** @type {boolean} 是否默认加密新文件 */
    this._encryptByDefault = false;
    /** @type {string|null} Repository Identity（逻辑仓库身份，open/init 时载入） */
    this.repositoryId = null;
    /** @type {number|null} 数据模型版本（metadata.schemaVersion） */
    this.schemaVersion = null;
  }

  /**
   * Repository Context：逻辑仓库身份 + 当前物理位置
   * @returns {{ repositoryId: string, currentPath: string }}
   */
  getRepositoryContext() {
    return {
      repositoryId: this.repositoryId,
      currentPath: this.repoPath,
    };
  }

  /**
   * reinitialize：重新生成 Repository Identity（副本独立化的显式途径）。
   * lineage.origin 记录原 Identity；Resource/DB 数据不变；旧 metadata 备份。
   * @returns {Promise<{ oldId: string|null, newId: string }>}
   */
  async reinitialize() {
    const RepoMetadata = require("./repositoryMetadata.cjs");
    const { oldId, newId } = await RepoMetadata.reinitializeMetadata(this.repoPath);
    this.repositoryId = newId;
    return { oldId, newId };
  }

  async init() {
    // 初始化语义：确保 Repository metadata 存在（缺失则创建新 Identity）
    const RepoMetadata = require("./repositoryMetadata.cjs");
    let meta = await RepoMetadata.readMetadata(this.repoPath);
    if (!meta || !RepoMetadata.validateMetadata(meta).ok) {
      meta = await RepoMetadata.createMetadata(this.repoPath);
    }
    this.repositoryId = meta.repositoryId;
    this.schemaVersion = meta.schemaVersion;

    this.db = new Database(this.repoPath);
    await this.db.init();

    this.schemaRegistry = new SchemaRegistry(this.db);
    this.resourceService = new ResourceService(this.db, {
      repoPath: this.repoPath,
      getCryptoKey: () => this._cryptoKey,
      isEncryptByDefault: () => this._encryptByDefault,
      getHookManager: () =>
        this._pluginManager ? this._pluginManager.getHookManager() : null,
      getExtensionRegistry: () =>
        this._pluginManager ? this._pluginManager.getExtensionRegistry() : null,
      getSchemaRegistry: () => this.schemaRegistry,
    });
    this.viewRegistry = new ViewRegistry(this.db, {
      getSchemaRegistry: () => this.schemaRegistry,
    });
    this.relationService = new RelationService(this.db, {
      getHookManager: () =>
        this._pluginManager ? this._pluginManager.getHookManager() : null,
    });
    this.queryEngine = new QueryEngine(this.db);
    this._graphCache = new GraphCache();
    this.syncOps = new SyncOpsEngine(this.db, this.repoPath);
    this.staging.setDb(this.db);
    this.containerService = new ContainerService(
      this.db,
      this.resourceService,
      {
        getCryptoKey: () => this._cryptoKey,
      },
    );
    this._initOperationEngine();
    this.sourceService = new SourceService(this.db);
    this.syncEngine = new ContainerSyncEngine(
      this.db,
      this.containerService,
      this.sourceService,
      {
        getCryptoKey: () => this._cryptoKey,
      },
    );
    this.syncConfigService = new SyncConfigService(this.db);

    // 自动初始化插件系统（幂等，后续显式调用 initPluginSystem 不重复执行）
    try {
      await this.initPluginSystem();
    } catch (e) {
      const Logger = require("../utils/logger.cjs");
      Logger.warn?.(`插件系统未启用，仅使用内置能力: ${e.message}`);
    }

    return this;
  }

  async open({ skipAuth = false } = {}) {
    // 打开语义：metadata 必须存在且合法（开发期原则：缺失视为未完成迁移，拒绝打开）
    const RepoMetadata = require("./repositoryMetadata.cjs");
    const meta = await RepoMetadata.readMetadata(this.repoPath);
    const check = RepoMetadata.validateMetadata(meta);
    if (!check.ok) {
      throw new Error(
        `${check.message}（请确认这是已初始化的 lo Repository；如为未完成迁移的仓库，需重新初始化）`,
      );
    }
    this.repositoryId = meta.repositoryId;
    this.schemaVersion = meta.schemaVersion;

    this.db = new Database(this.repoPath);
    await this.db.init();

    this.schemaRegistry = new SchemaRegistry(this.db);
    this.resourceService = new ResourceService(this.db, {
      repoPath: this.repoPath,
      getCryptoKey: () => this._cryptoKey,
      isEncryptByDefault: () => this._encryptByDefault,
      getHookManager: () =>
        this._pluginManager ? this._pluginManager.getHookManager() : null,
      getExtensionRegistry: () =>
        this._pluginManager ? this._pluginManager.getExtensionRegistry() : null,
      getSchemaRegistry: () => this.schemaRegistry,
    });
    this.viewRegistry = new ViewRegistry(this.db, {
      getSchemaRegistry: () => this.schemaRegistry,
    });
    this.relationService = new RelationService(this.db, {
      getHookManager: () =>
        this._pluginManager ? this._pluginManager.getHookManager() : null,
    });
    this.queryEngine = new QueryEngine(this.db);
    this.syncOps = new SyncOpsEngine(this.db, this.repoPath);
    this.staging.setDb(this.db);
    this.containerService = new ContainerService(
      this.db,
      this.resourceService,
      {
        getCryptoKey: () => this._cryptoKey,
      },
    );
    this._initOperationEngine();
    this.sourceService = new SourceService(this.db);
    this.syncEngine = new ContainerSyncEngine(
      this.db,
      this.containerService,
      this.sourceService,
      {
        getCryptoKey: () => this._cryptoKey,
      },
    );
    this.syncConfigService = new SyncConfigService(this.db);

    // 门禁：检查 SSH 认证（管理类命令可跳过）
    if (!skipAuth) {
      const authed = await this.ensureAuthenticated();
      if (!authed) {
        await this.db.close();
        process.exit(1);
      }
    }

    // 加载加密密钥到内存
    await this._loadCryptoKey({ skipAuth });

    // 加载加密策略配置
    await this._loadEncryptConfig();

    // 自动初始化插件系统（幂等，后续显式调用 initPluginSystem 不重复执行）
    try {
      await this.initPluginSystem();
    } catch (e) {
      const Logger = require("../utils/logger.cjs");
      Logger.warn?.(`插件系统未启用，仅使用内置能力: ${e.message}`);
    }

    return this;
  }

  /**
   * 获取当前会话的加密密钥（返回副本，仅内存中存在）
   * 调用方获得的是独立副本，close() 时安全擦除不影响外部引用
   * @returns {Buffer|null}
   */
  get cryptoKey() {
    return this._cryptoKey ? Buffer.from(this._cryptoKey) : null;
  }

  async close() {
    if (this.watcher) {
      this.watcher.stop();
    }
    if (this._runtime) {
      const st = this._runtime.state && this._runtime.state.status;
      if (st && st !== "created" && st !== "stopped") {
        await this._runtime.stop();
      }
      this._runtime = null;
    }
    if (this._automationScheduler) {
      this._automationScheduler.stop();
      this._automationScheduler = null;
    }
    if (this.db) {
      await this.db.close();
    }
    // 安全清除内存中的加密密钥，防止冷启动攻击和内存 dump 泄漏
    if (this._cryptoKey) {
      this._cryptoKey.fill(0);
      this._cryptoKey = null;
    }
  }

  // ──────────────────────────────────────
  // 加密密钥管理
  // ──────────────────────────────────────

  /**
   * 加载仓库加密密钥到内存
   *
   * 流程:
   *   1. 检查仓库是否启用了加密 (isEncryptionEnabled)
   *   2. 优先尝试从受保护的 SSH 密钥副本解密
   *   3. 降级: 从明文副本直接加载 (未配置 SSH 保护的场景)
   *
   * @param {{ skipAuth?: boolean }} options
   */
  async _loadCryptoKey(options = {}) {
    const CryptoUtils = require("../utils/crypto.cjs");
    const SshAuth = require("../utils/sshAuth.cjs");

    if (!CryptoUtils.isEncryptionEnabled(this.repoPath)) {
      return; // 仓库未启用加密
    }

    // 尝试从受保护的密钥副本解密（需要 SSH 密钥）
    const keysJson = await this.getConfig("auth.ssh.keys");
    if (keysJson) {
      try {
        const registeredKeys = JSON.parse(keysJson);
        const localKeys = SshAuth.listKeys();

        for (const regKey of registeredKeys) {
          if (!regKey.fingerprint) continue;

          const localMatch = localKeys.find(
            (k) => k.fingerprint === regKey.fingerprint,
          );
          if (!localMatch) continue;

          const result = CryptoUtils.unlockRepoKey(
            this.repoPath,
            localMatch.publicKeyPath,
            regKey.fingerprint,
          );

          if (result.success) {
            this._cryptoKey = result.repoKey;
            return;
          }
        }
      } catch (e) {
        require("../utils/logger.cjs").error(
          "repository: 解析SSH密钥配置失败",
          e,
        );
        // 解析失败，尝试降级方案
      }
    }

    // 降级: 直接加载明文 RepoKey（适用于未配置 SSH 保护的场景）
    // 仅在 SSH 保护密钥不存在或无法匹配时才降级
    const repoKey = CryptoUtils.loadRepoKey(this.repoPath);
    if (repoKey) {
      const Logger = require("../utils/logger.cjs");
      Logger.warn("正在使用未受保护的加密密钥（明文 repo.key 存在）");
      Logger.warn("建议运行 lo auth add 使用 SSH 密钥保护仓库密钥");
      this._cryptoKey = repoKey;
    }
  }

  /**
   * 加载加密策略配置到内存
   * 读取 crypto.encryptByDefault 决定新文件是否自动加密
   */
  async _loadEncryptConfig() {
    try {
      const val = await this.getConfig("crypto.encryptByDefault");
      this._encryptByDefault = val === true || val === "true";
    } catch {
      this._encryptByDefault = false;
    }
  }

  /**
   * 当前仓库是否默认加密新文件
   * @returns {boolean}
   */
  get isEncryptByDefault() {
    return this._encryptByDefault;
  }

  /**
   * 使用 SSH 密钥保护仓库加密密钥
   * @param {string} pubKeyPath - SSH 公钥路径
   * @param {string} fingerprint - 密钥指纹
   * @param {string} label - 密钥标签
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async protectCryptoKey(pubKeyPath, fingerprint, label) {
    const CryptoUtils = require("../utils/crypto.cjs");
    return CryptoUtils.protectRepoKeyWithSshKey(
      this.repoPath,
      pubKeyPath,
      fingerprint,
      label,
    );
  }

  /**
   * 移除受保护的加密密钥副本
   * @param {string} fingerprint
   */
  async removeProtectedCryptoKey(fingerprint) {
    const CryptoUtils = require("../utils/crypto.cjs");
    return CryptoUtils.removeProtectedKey(
      this.repoPath,
      fingerprint,
      this._cryptoKey,
    );
  }

  // ──────────────────────────────────────
  // SSH 认证
  // ──────────────────────────────────────

  /**
   * 确保当前用户已通过 SSH 认证
   * 如果仓库启用了认证且当前会话未验证，则执行挑战-应答认证
   * @returns {Promise<boolean>} 是否通过认证
   */
  async ensureAuthenticated() {
    const SshAuth = require("../utils/sshAuth.cjs");
    const Logger = require("../utils/logger.cjs");

    // 检查是否启用了认证
    const enabled = await this.getConfig("auth.ssh.enabled");
    if (!enabled) {
      return true;
    }

    // 环境变量覆盖（用于 CI/CD 等场景）
    if (
      process.env.LO_AUTH_SKIP === "1" ||
      process.env.LO_AUTH_SKIP === "true"
    ) {
      return true;
    }

    // 检查会话缓存
    const ttl = await this.getConfig("auth.ssh.sessionTtl", 15);
    if (SshAuth.isSessionValid(this.repoPath, ttl)) {
      return true;
    }

    // 读取所有注册的公钥
    const keysJson = await this.getConfig("auth.ssh.keys");
    if (!keysJson) {
      Logger.error("认证配置已损坏，请重新启用: lo auth add");
      return false;
    }

    let registeredKeys;
    try {
      registeredKeys = JSON.parse(keysJson);
    } catch {
      Logger.error("认证配置已损坏，请重新启用: lo auth add");
      return false;
    }

    if (!Array.isArray(registeredKeys) || registeredKeys.length === 0) {
      Logger.error("未注册任何 SSH 公钥，请执行: lo auth add");
      return false;
    }

    // 多密钥验证：遍历所有注册公钥，任意一把通过即可
    Logger.info("正在验证 SSH 身份...");
    const result = await SshAuth.verifyMulti(registeredKeys);

    if (result.success) {
      const matched = registeredKeys[result.matchedIndex];
      Logger.success(
        `SSH 认证通过 (${matched.label || matched.fingerprint || "未知密钥"})`,
      );
      SshAuth.setSessionCache(this.repoPath);
      return true;
    } else {
      Logger.error(`SSH 认证失败: ${result.error}`);
      return false;
    }
  }

  async importFile(filePath, type = null) {
    // P2：import 正式写入口统一进入 resource.create operation。
    // 查重语义保持（local 已注册 → 返回 existing，不产生 operation）
    const prepared = await this.resourceService.prepareImport(filePath, type);
    if (prepared.existing) {
      return prepared.existing;
    }
    const { result: resource } = await this.operationEngine.execute(
      "resource.create",
      prepared.params,
    );

    // 记录操作日志
    if (this.syncOps && resource) {
      const relPath =
        resource.location_kind === 'local' ? resource.location : '';
      await this.syncOps.recordOp(
        SyncOpsEngine.OP_TYPES.RESOURCE_CREATED,
        resource.rid,
        {
          name: resource.name,
          layer: resource.layer || 0,
          type: resource.type,
          path: relPath,
          hash: resource.hash,
          metadata: resource.metadata,
          encrypted: resource.encrypted,
          created: resource.created,
          updated: resource.updated,
        },
      );
    }

    // 如果是 note 类型资源，自动解析并同步所有派生关系（wikilink + embed）
    if (resource && resource.type === "note") {
      try {
        await this.syncMarkdownRelations(resource.rid);
      } catch (e) {
        require("../utils/logger.cjs").error(
          "repository: 同步markdown关系失败",
          e,
        );
      }
    }
    return resource;
  }

  async importDirectory(dirPath, type = null) {
    const relDir = path.relative(this.repoPath, path.resolve(dirPath));
    const patterns = ResourceType.getExtensions(type || "note").map(
      (ext) => `${relDir}/**/*${ext}`,
    );
    const globPattern =
      patterns.length === 1 ? patterns[0] : `{${patterns.join(",")}}`;

    const files = glob.sync(globPattern, {
      cwd: this.repoPath,
      ignore: ["**/node_modules/**", "**/.git/**", "**/.repo/**"],
      absolute: true,
    });

    const results = [];
    for (const file of files) {
      try {
        const resource = await this.importFile(file, type);
        results.push(resource);
      } catch (e) {
        console.warn(`Failed to import ${file}: ${e.message}`);
      }
    }

    return results;
  }

  async createResource(type, content, options = {}) {
    const {
      filename,
      metadata = {},
      overwrite = false,
      schema,
      encrypt = false,
      name: explicitName,
    } = options;

    // 018：options.title 不再并入 metadata（title 不是 Resource 名称语义）；
    // 顶层 name 选项作为候选 name（resourceService.create 统一 normalize）
    const finalMeta = { ...metadata };

    const CryptoUtils = require("../utils/crypto.cjs");

    // 类型认定（唯一事实源 ResourceType.fromPath）：
    //   显式 type 优先；无 type 且有来源名 → 按扩展名认定；否则默认 note
    const finalType =
      type || (filename ? ResourceType.fromPath(filename) : "note");
    const ext = ResourceType.getExtensions(finalType)[0] || ".md";
    const name = filename || `${Date.now()}${ext}`;
    const filePath = path.join(this.repoPath, "resources", name);
    const loc = this.resourceService.locationFromPath(filePath);

    await fs.ensureDir(path.dirname(filePath));

    // 防覆盖：目标文件已存在，或该 location 已有活跃 layer-0 记录时，默认拒绝
    // （覆盖是显式操作，需显式传 overwrite: true；name-stack 的 layer>0 版本共享 location，不受此约束）
    // 语义与数据库唯一索引（idx_resources_location_active）完全一致：
    // 仅 local 参与唯一性；external/virtual 不拦截（016 §6：external 同一文件可被多个 Resource 引用）。
    const fileExists = await fs.pathExists(filePath);
    const ownerRow = await this.db.get(
      "SELECT rid FROM resources WHERE location_kind = 'local' AND location = ? AND deleted = 0 AND layer = 0",
      [loc.value],
    );
    const existing = ownerRow
      ? await this.resourceService.getByRid(ownerRow.rid)
      : null;
    if ((fileExists || existing) && !overwrite) {
      const err = new Error(
        `目标已存在，已阻止覆盖: ${filePath}（如需覆盖请显式传 overwrite: true）`,
      );
      err.code = "RESOURCE_EXISTS";
      throw err;
    }

    // 使用 ResourceService 的统一写入方法（根据加密策略决定是否加密；
    // 显式 encrypt: true 强制加密写入——P4-1：new --encrypt 统一入口）
    const contentBuf = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, "utf-8");
    if (encrypt && !this._cryptoKey) {
      throw new Error("无法加密：加密密钥未加载，请先完成 SSH 认证");
    }
    if ((this._cryptoKey && this._encryptByDefault) || encrypt) {
      await CryptoUtils.writeEncryptedFile(
        filePath,
        contentBuf,
        this._cryptoKey,
      );
    } else {
      await fs.writeFile(filePath, contentBuf);
    }

    // 显式覆盖既有资源：更新已有记录而非新建（避免同 path 产生多条记录）
    if (existing && overwrite) {
      let updated = await this.resourceService.refresh(existing.rid);
      if (Object.keys(finalMeta).length > 0) {
        const { result: upd } = await this.operationEngine.execute(
          "resource.update",
          {
            rid: existing.rid,
            updates: { metadata: { ...updated.metadata, ...finalMeta } },
          },
        );
        updated = upd;
      }
      if (this.syncOps) {
        await this.syncOps.recordOp(
          SyncOpsEngine.OP_TYPES.RESOURCE_UPDATED,
          existing.rid,
          {
            path: path.relative(this.repoPath, filePath),
            old_hash: existing.hash,
            new_hash: updated.hash,
            metadata: updated.metadata,
          },
        );
      }
      return updated;
    }

    const { result } = await this.operationEngine.execute("resource.create", {
      type: finalType,
      location_kind: loc.kind,
      location: loc.value,
      metadata: finalMeta,
      schema,
      ...(explicitName !== undefined ? { name: explicitName } : {}),
    });

    // 记录操作日志
    if (this.syncOps) {
      const relPath = path.relative(this.repoPath, filePath);
      await this.syncOps.recordOp(
        SyncOpsEngine.OP_TYPES.RESOURCE_CREATED,
        result.rid,
        {
          name: result.name,
          layer: result.layer || 0,
          type: finalType,
          path: relPath,
          hash: result.hash,
          metadata: result.metadata,
          encrypted: result.encrypted,
          created: result.created,
          updated: result.updated,
        },
      );
    }

    return result;
  }

  /**
   * 创建具有 Container Capability 的资源
   *
   * 对应 `lo create resource project ./demo`:
   *   - type: 资源类型 (project, album, dataset, collection 等)
   *   - path: 内容来源目录
   *   - capabilities: 自动根据 type 加载对应 capability（如 project → ["container"]）
   *   - container_schema: 自动根据 type 加载容器规则
   *
   * @param {string} type - 资源类型
   * @param {string} contentPath - 内容来源路径（目录或文件）
   * @param {{ name?: string, capabilities?: string[], container_schema?: object, metadata?: object, scanMembers?: boolean }} options
   * @returns {Promise<object>} 创建的 Resource
   */
  async createResourceWithContainer(type, contentPath, options = {}) {
    const absPath = path.resolve(this.repoPath, contentPath);
    const {
      name: customName,
      capabilities,
      container_schema,
      metadata = {},
      scanMembers = true,
    } = options;

    // 根据 type 推导默认 capabilities 和 container_schema
    const defaults = this._getContainerDefaults(type);
    const finalCapabilities = capabilities || defaults.capabilities;
    const finalSchema = container_schema || defaults.container_schema;

    const resourceName = customName || path.basename(absPath);

    // 创建 Resource（没有实际内容文件时使用目录路径作为占位）
    const exists = await fs.pathExists(absPath);
    if (!exists) {
      throw new Error(`路径不存在: ${absPath}`);
    }

    const { result: resource } = await this.operationEngine.execute(
      "resource.create",
      {
        type,
        path: absPath,
        name: resourceName,
        // 018：不再写入 metadata.title（title 不是 Resource 名称语义）
        metadata,
        capabilities: finalCapabilities,
        container_schema: finalSchema,
      },
    );
    this.emitEvent(
      "container.created",
      {
        rid: resource.rid,
        type,
        path: absPath,
        name: resourceName,
        capabilities: finalCapabilities,
        metadata: resource.metadata,
      },
      { source: "repository" },
    );

    // 绑定 Content Source
    const isDir = (await fs.stat(absPath)).isDirectory();
    if (isDir) {
      await this.sourceService.addLocalFolderSource(resource.rid, absPath);
    } else {
      await this.sourceService.addSource(resource.rid, "local_file", absPath);
    }

    // 如果具有 container 能力且是目录，扫描成员
    if (finalCapabilities.includes("container") && isDir && scanMembers) {
      await this.syncEngine.scan(resource.rid);
    }

    // 记录操作日志
    if (this.syncOps) {
      await this.syncOps.recordOp(
        SyncOpsEngine.OP_TYPES.RESOURCE_CREATED,
        resource.rid,
        {
          name: resource.name,
          layer: resource.layer || 0,
          type: resource.type,
          path: path.relative(this.repoPath, absPath),
          hash: resource.hash,
          metadata: resource.metadata,
          capabilities: resource.capabilities,
          container_schema: resource.container_schema,
          encrypted: resource.encrypted,
          created: resource.created,
          updated: resource.updated,
        },
      );
    }

    return resource;
  }

  /**
   * 根据资源类型获取默认的 capabilities 和 container_schema
   */
  _getContainerDefaults(type) {
    const defaults = {
      project: {
        capabilities: ["container"],
        container_schema: {
          allowed_types: [
            "note",
            "document",
            "image",
            "code",
            "json",
            "yaml",
            "xml",
            "csv",
            "text",
          ],
        },
      },
      album: {
        capabilities: ["container"],
        container_schema: {
          allowed_types: ["image", "video"],
        },
      },
      dataset: {
        capabilities: ["container"],
        container_schema: {
          allowed_types: ["csv", "json", "yaml", "xml"],
        },
      },
      course: {
        capabilities: ["container"],
        container_schema: {
          allowed_types: ["note", "video", "audio", "document", "image", "pdf"],
        },
      },
      collection: {
        capabilities: ["container"],
        container_schema: {
          allowed_types: [], // 不限制
        },
      },
    };

    return defaults[type] || { capabilities: [], container_schema: {} };
  }

  /**
   * 绑定 Content Source 到 Resource
   * @param {string} resourceRid
   * @param {string} sourceType - local_folder / git_repository 等
   * @param {string} location
   * @param {object} [metadata]
   */
  async bindSource(resourceRid, sourceType, location, metadata = {}) {
    return this.sourceService.addSource(
      resourceRid,
      sourceType,
      location,
      metadata,
    );
  }

  /**
   * 获取 Resource 的 Content Source
   * @param {string} resourceRid
   */
  async getResourceSources(resourceRid) {
    return this.sourceService.getSources(resourceRid);
  }

  /**
   * 扫描容器内容源，刷新成员列表
   * @param {string} containerRid
   */
  async scanContainerMembers(containerRid) {
    if (!(await this.containerService.hasContainerCapability(containerRid))) {
      throw new Error(`Resource ${containerRid} 不具有 Container Capability`);
    }
    const { results } = await this.syncEngine.scan(containerRid);
    return results;
  }

  /**
   * 获取容器成员列表
   * @param {string} containerRid
   * @param {{ resourceOnly?: boolean, fileOnly?: boolean }} options
   */
  async getContainerMembers(containerRid, options = {}) {
    return this.containerService.getMembers(containerRid, options);
  }

  /**
   * Promote: 将容器中的文件成员提升为独立 Resource
   *
   * 提升后的文件:
   *   - 拥有独立 RID
   *   - 可以参与 Relation
   *   - 仍然是容器的成员（resource_rid 指向新 Resource）
   *
   * @param {string} containerRid - 容器 RID
   * @param {string} memberPath - 成员在容器中的路径
   * @param {{ sourceId?: number, type?: string, metadata?: object }} options
   * @returns {Promise<object>} 新创建的 Resource
   */
  async promoteMember(containerRid, memberPath, options = {}) {
    // 经 OperationEngine 执行：记录操作日志，可撤销
    const { result } = await this._transactionalOp(
      containerRid,
      "member.promote",
      {
        containerRid,
        memberPath,
        sourceId: options.sourceId || null,
        type: options.type || null,
        metadata: options.metadata || {},
      },
      options,
    );

    // 记录操作日志
    if (this.syncOps) {
      await this.syncOps.recordOp("member_promoted", result.rid, {
        container_rid: containerRid,
        member_path: memberPath,
        name: result.name,
        type: result.type,
        hash: result.hash,
        metadata: result.metadata,
      });
    }

    this.emitEvent(
      "container.member.promoted",
      {
        containerRid,
        memberPath,
        rid: result.rid,
        name: result.name,
        type: result.type,
        metadata: result.metadata,
      },
      { source: "repository" },
    );

    return result;
  }

  /**
   * Demote: 将已提升的容器成员降级为普通文件成员
   *
   * 降级后的成员:
   *   - resource_rid 被清除（设为 NULL）
   *   - 不再关联独立 Resource
   *   - Resource 本身不受影响（仍独立存在）
   *
   * @param {string} containerRid - 容器 RID
   * @param {string} memberPath - 成员在容器中的路径
   * @returns {Promise<object>} 降级结果
   */
  async demoteMember(containerRid, memberPath, options = {}) {
    // 经 OperationEngine 执行：记录操作日志，可撤销
    const { result } = await this._transactionalOp(
      containerRid,
      "member.demote",
      {
        containerRid,
        memberPath,
        sourceId: options.sourceId || null,
      },
      options,
    );

    // 记录操作日志
    if (this.syncOps) {
      await this.syncOps.recordOp(
        "member_demoted",
        result.previousResourceRid,
        {
          container_rid: containerRid,
          member_path: memberPath,
          resource_exists: !!result.resource_exists,
        },
      );
    }

    this.emitEvent(
      "container.member.demoted",
      {
        containerRid,
        memberPath,
        previousResourceRid: result.previousResourceRid,
      },
      { source: "repository" },
    );

    return result;
  }

  /**
   * 获取容器成员统计
   * @param {string} containerRid
   */
  async getContainerMemberStats(containerRid) {
    return this.containerService.getMemberStats(containerRid);
  }

  /**
   * 按名称或 RID 解析容器
   * @param {string} identifier - 容器名称或 RID
   * @returns {Promise<string|null>}
   */
  _initOperationEngine() {
    this.operationRegistry = new OperationRegistry();

    // 自动加载 src/operations/ 下的所有 handler（Phase 4.5）
    loadOperations(this.operationRegistry);

    this.operationEngine = new OperationEngine(
      this.db,
      this.operationRegistry,
      this.containerService,
    );
    this.operationEngine.setService("relationService", this.relationService);
    this.operationEngine.setService("resourceService", this.resourceService);
    this.operationEngine.setService("schemaRegistry", this.schemaRegistry);
    this.operationEngine.setService("viewRegistry", this.viewRegistry);
    // 注入领域事件发射器：OperationEngine.execute 成功后统一 emit（Operation → Event 绑定）
    this.operationEngine.setEventEmitter((type, payload) =>
      this.emitEvent(type, payload, { source: "repository" }),
    );
    this.transactionEngine = new TransactionEngine(
      this.db,
      this.operationEngine,
    );

    // 供 ContainerService 的 scan/sync 记录操作日志
    this.containerService.setTransactionEngine(this.transactionEngine);
  }

  async resolveContainer(identifier) {
    return this.containerService.resolve(identifier);
  }

  /**
   * 标记 Container 为 dirty（内容源文件变更，等待 sync）
   * @param {string} containerRid
   */
  async markContainerDirty(containerRid) {
    return this.syncEngine.markDirty(containerRid);
  }

  /**
   * 检查 Container 是否有待同步的变更
   * @param {string} containerRid
   * @returns {Promise<boolean>}
   */
  async isContainerDirty(containerRid) {
    return this.syncEngine.isDirty(containerRid);
  }

  /**
   * 忽略容器成员
   * @param {string} containerRid
   * @param {string} memberPath
   * @param {number} [sourceId]
   */
  async ignoreContainerMember(containerRid, memberPath, options = {}) {
    const { result } = await this._transactionalOp(
      containerRid,
      "member.ignore",
      {
        containerRid,
        memberPath,
        sourceId: options.sourceId || null,
      },
      options,
    );
    if (this.syncOps) {
      await this.syncOps.recordOp("member_ignored", containerRid, {
        member_path: memberPath,
      });
    }
    return result;
  }

  /**
   * 取消忽略容器成员
   * @param {string} containerRid
   * @param {string} memberPath
   * @param {number} [sourceId]
   */
  async unignoreContainerMember(containerRid, memberPath, options = {}) {
    const { result } = await this._transactionalOp(
      containerRid,
      "member.unignore",
      {
        containerRid,
        memberPath,
        sourceId: options.sourceId || null,
      },
      options,
    );
    if (this.syncOps) {
      await this.syncOps.recordOp("member_unignored", containerRid, {
        member_path: memberPath,
      });
    }
    return result;
  }

  // ────────── Phase 4.1: Member API ──────────

  /**
   * 自动事务包装：单个操作自动 begin→execute→commit，失败自动 rollback
   * @private
   */
  async _transactionalOp(containerRid, opType, opParams, options = {}) {
    if (options.transactionId) {
      // 在已有事务中执行
      return this.transactionEngine.execute(
        options.transactionId,
        opType,
        opParams,
        options,
      );
    }
    // 自动事务
    const tx = await this.transactionEngine.begin({
      containerRid,
      type: opType,
    });
    try {
      const result = await this.transactionEngine.execute(
        tx.transactionId,
        opType,
        opParams,
        options,
      );
      await this.transactionEngine.commit(tx.transactionId);
      return result;
    } catch (err) {
      await this.transactionEngine.rollback(tx.transactionId);
      throw err;
    }
  }

  /**
   * 重命名容器成员
   */
  async renameContainerMember(containerRid, memberPath, newPath, options = {}) {
    return this._transactionalOp(
      containerRid,
      "member.rename",
      {
        containerRid,
        memberPath,
        newPath,
        sourceId: options.sourceId || null,
      },
      options,
    );
  }

  /**
   * 软删除容器成员
   */
  async removeContainerMember(containerRid, memberPath, options = {}) {
    return this._transactionalOp(
      containerRid,
      "member.remove",
      {
        containerRid,
        memberPath,
        sourceId: options.sourceId || null,
      },
      options,
    );
  }

  /**
   * 恢复已删除的容器成员
   */
  async restoreContainerMember(containerRid, memberPath, options = {}) {
    return this._transactionalOp(
      containerRid,
      "member.restore",
      {
        containerRid,
        memberPath,
        sourceId: options.sourceId || null,
      },
      options,
    );
  }

  /**
   * 移动成员到另一个容器
   */
  async moveContainerMember(
    containerRid,
    memberPath,
    targetContainerRid,
    options = {},
  ) {
    return this._transactionalOp(
      containerRid,
      "member.move",
      {
        containerRid,
        memberPath,
        targetContainerRid,
        sourceId: options.sourceId || null,
      },
      options,
    );
  }

  /**
   * 复制成员到另一个容器
   */
  async copyContainerMember(
    containerRid,
    memberPath,
    targetContainerRid,
    options = {},
  ) {
    return this._transactionalOp(
      containerRid,
      "member.copy",
      {
        containerRid,
        memberPath,
        targetContainerRid,
        sourceId: options.sourceId || null,
      },
      options,
    );
  }

  /**
   * Phase 4.2: 获取容器的操作历史
   */
  async getContainerHistory(containerRid, options = {}) {
    return this.operationEngine.getHistory(containerRid, options);
  }

  /**
   * Phase 4.2: 获取特定成员的操作历史
   */
  async getMemberHistory(containerRid, memberPath) {
    return this.operationEngine.getMemberHistory(containerRid, memberPath);
  }

  /**
   * Phase 4.2: 撤销操作
   */
  async undoContainerOperation(operationId) {
    return this.operationEngine.undo(operationId);
  }

  // ────────── Phase 4.4: Transaction API ──────────

  /**
   * 统一执行操作（对外 Operation API 入口）
   *
   * 直接透传现有 OperationEngine.execute，不增加业务逻辑。
   * @param {string} type — 操作类型（见 getOperationTypes()）
   * @param {object} params — 操作 handler 参数
   * @param {{ actor?: string, parentOperationId?: string, transactionId?: string }} [options]
   * @returns {Promise<{ operationId: string, result: object }>}
   */
  async executeOperation(type, params, options = {}) {
    return this.operationEngine.execute(type, params, options);
  }

  /**
   * 获取单个操作记录
   */
  async getOperationRecord(operationId) {
    return this.operationEngine.getOperation(operationId);
  }

  /**
   * 开始一个事务（批量操作入口）
   */
  async beginTransaction(containerRid, type, description = null) {
    return this.transactionEngine.begin({ containerRid, type, description });
  }

  /**
   * 在事务中执行操作
   */
  async executeInTransaction(transactionId, type, params, options = {}) {
    return this.transactionEngine.execute(transactionId, type, params, options);
  }

  /**
   * 提交事务
   */
  async commitTransaction(transactionId) {
    return this.transactionEngine.commit(transactionId);
  }

  /**
   * 回滚事务
   */
  async rollbackTransaction(transactionId) {
    return this.transactionEngine.rollback(transactionId);
  }

  /**
   * 获取容器的事务列表
   */
  async getContainerTransactions(containerRid, options = {}) {
    return this.transactionEngine.getTransactions(containerRid, options);
  }

  /**
   * 获取事务详情
   */
  async getTransactionDetail(transactionId) {
    return this.transactionEngine.getTransaction(transactionId);
  }

  /**
   * 获取容器成员的内容变更差异（只读，不修改数据库）
   *
   * 遍历容器的所有 Content Source，对比文件系统与 container_members 表，
   * 返回每个 source 的新增/修改/删除文件列表。
   *
   * @param {string} containerRid
   * @returns {Promise<Array<{ source: string, added: Array, modified: Array, deleted: Array, unchanged: number }>>}
   */
  async getContainerDiff(containerRid) {
    if (!(await this.containerService.hasContainerCapability(containerRid))) {
      throw new Error(`Resource ${containerRid} 不具有 Container Capability`);
    }
    return this.syncEngine.diff(containerRid);
  }

  /**
   * 同步容器成员：将文件系统的变化应用到数据库
   *
   * 对比文件系统与 container_members 表，然后:
   *   - 新增数据库中没有的文件
   *   - 更新 hash 变化的文件
   *   - 移除文件系统中已不存在的成员
   *
   * @param {string} containerRid
   * @returns {Promise<Array<{ source: string, added: number, updated: number, removed: number, errors: Array }>>}
   */
  async syncContainerMembers(containerRid) {
    if (!(await this.containerService.hasContainerCapability(containerRid))) {
      throw new Error(`Resource ${containerRid} 不具有 Container Capability`);
    }
    return this.syncEngine.sync(containerRid);
  }

  async getResource(rid) {
    return this.resourceService.getByRid(rid);
  }

  /**
   * 统一资源解析：rid > name > path 三级查找
   * rid 是一等公民，优先按 rid 查；其次按 name（逻辑名称）；最后按 path 降级
   * @param {string} input - 用户输入（可能是 rid、名称或路径）
   * @returns {Promise<object|null>}
   */
  async resolveResource(input) {
    if (typeof input !== "string" || input.length === 0) return null;

    // 1. 按 rid 精确匹配
    if (input.startsWith("res_")) {
      return this.resourceService.getByRid(input);
    }

    // 2. 按 canonical name 匹配（018 §4：输入统一 normalize 后精确匹配；
    //    无 slug/旧名 fallback；name 存储值即 canonical name）
    const normalized = StringUtils.normalizeResourceName(input);
    const byName = await this.resourceService.getByName(normalized);
    if (byName) return byName;

    // 3. 按路径降级匹配（Storage 层查找，非名称语义）
    const byPath = await this.resourceService.getByPath(input);
    if (byPath) return byPath;

    const absPath = path.join(this.repoPath, "resources", input);
    if (absPath !== input) {
      const byAbs = await this.resourceService.getByPath(absPath);
      if (byAbs) return byAbs;
    }

    return null;
  }

  /**
   * 一致性检查：检查容器 ORPHAN_RESOURCE / ORPHAN_SOURCE / INVALID_STATUS / ORPHAN_OPERATION
   *
   * @param {string} containerRid
   * @returns {Promise<{ issues: Array }>}
   */
  async verifyContainer(containerRid) {
    const issues = [];
    const MemberStateMachine = require("../domain/memberStateMachine.cjs");

    // 1. Member 检查
    const members = await this.db.all(
      "SELECT * FROM container_members WHERE container_rid = ?",
      [containerRid],
    );

    for (const m of members) {
      // 1a. ORPHAN_RESOURCE: promoted 但 resource_rid 不存在
      if (m.resource_rid) {
        const res = await this.db.get(
          "SELECT rid FROM resources WHERE rid = ?",
          [m.resource_rid],
        );
        if (!res) {
          issues.push({
            level: "error",
            category: "ORPHAN_RESOURCE",
            message: `member ${m.path} (id=${m.id}) promoted but resource ${m.resource_rid} missing`,
            member: m.path,
            detail: { memberId: m.id, resourceRid: m.resource_rid },
          });
        }
      }

      // 1b. ORPHAN_SOURCE: source_id 存在但 resource_sources 不存在
      if (m.source_id) {
        const src = await this.db.get(
          "SELECT id FROM resource_sources WHERE id = ?",
          [m.source_id],
        );
        if (!src) {
          issues.push({
            level: "error",
            category: "ORPHAN_SOURCE",
            message: `member ${m.path} (id=${m.id}) references missing source ${m.source_id}`,
            member: m.path,
            detail: { memberId: m.id, sourceId: m.source_id },
          });
        }
      }

      // 1c. INVALID_STATUS: 状态值不在合法范围内
      if (m.status && !MemberStateMachine.isValidStatus(m.status)) {
        issues.push({
          level: "error",
          category: "INVALID_STATUS",
          message: `member ${m.path} (id=${m.id}) has invalid status: ${m.status}`,
          member: m.path,
          detail: { memberId: m.id, status: m.status },
        });
      }
    }

    // 2. Operation 检查
    const ops = await this.db.all(
      "SELECT * FROM container_operations WHERE container_rid = ?",
      [containerRid],
    );

    for (const op of ops) {
      // 检查 before/after JSON 合法性
      if (op.before) {
        try {
          JSON.parse(op.before);
        } catch (e) {
          issues.push({
            level: "warn",
            category: "CORRUPT_OPERATION",
            message: `operation ${op.operation_id} has invalid before JSON`,
            detail: { operationId: op.operation_id },
          });
        }
      }
      if (op.after) {
        try {
          JSON.parse(op.after);
        } catch (e) {
          issues.push({
            level: "warn",
            category: "CORRUPT_OPERATION",
            message: `operation ${op.operation_id} has invalid after JSON`,
            detail: { operationId: op.operation_id },
          });
        }
      }

      // 检查 transaction_id 引用
      if (op.transaction_id) {
        const tx = await this.db.get(
          "SELECT transaction_id FROM container_transactions WHERE transaction_id = ?",
          [op.transaction_id],
        );
        if (!tx) {
          issues.push({
            level: "warn",
            category: "ORPHAN_OPERATION",
            message: `operation ${op.operation_id} references missing transaction ${op.transaction_id}`,
            detail: {
              operationId: op.operation_id,
              transactionId: op.transaction_id,
            },
          });
        }
      }
    }

    // 3. Transaction 检查
    const txs = await this.db.all(
      "SELECT * FROM container_transactions WHERE container_rid = ?",
      [containerRid],
    );

    for (const tx of txs) {
      // 检查状态合法性
      const validTxStatuses = ["active", "committed", "rolled_back", "failed"];
      if (!validTxStatuses.includes(tx.status)) {
        issues.push({
          level: "error",
          category: "INVALID_TX_STATUS",
          message: `transaction ${tx.transaction_id} has invalid status: ${tx.status}`,
          detail: { transactionId: tx.transaction_id, status: tx.status },
        });
      }
    }

    return { containerRid, issues, ok: issues.length === 0 };
  }

  /**
   * 获取所有已注册的操作类型
   */
  getOperationTypes() {
    return this.operationRegistry.list();
  }

  async getResourceByName(name) {
    return this.resourceService.getByName(name);
  }

  async getResourceByPath(filePath) {
    return this.resourceService.getByPath(filePath);
  }

  async getAllResources(options = {}) {
    return this.resourceService.getAll(options);
  }

  /**
   * 正式 rename 入口（018 §5）：唯一修改 name 的 Repository 操作。
   *
   * - 统一经 normalizeResourceName；冲突（目标 (name, layer) 活跃占用）→ RENAME_CONFLICT
   * - 走 resource.update operation（可撤销）；rid/location/layer/content/metadata 不变
   * - 不自动入栈、不自动重写 [[name]]
   * @param {string} rid
   * @param {string} newName
   * @returns {Promise<object>} 更新后的 Resource
   */
  async renameResource(rid, newName) {
    const result = await this.updateResource(rid, { name: newName });
    return result;
  }

  async updateResource(rid, updates) {
    const oldResource = await this.resourceService.getByRid(rid);
    const { result } = await this.operationEngine.execute("resource.update", {
      rid,
      updates,
    });

    // 记录操作日志
    if (this.syncOps && oldResource) {
      await this.syncOps.recordOp(
        SyncOpsEngine.OP_TYPES.RESOURCE_UPDATED,
        rid,
        {
          path:
            oldResource.location_kind === 'local' ? oldResource.location : '',
          old_hash: oldResource.hash,
          new_hash: result.hash,
          metadata: result.metadata,
        },
      );
    }

    return result;
  }

  async deleteResource(rid, soft = true) {
    const resource = await this.resourceService.getByRid(rid);
    const result = soft
      ? (
          await this.operationEngine.execute("resource.delete", {
            rid,
          })
        ).result
      : await this.resourceService.delete(rid, false);

    // 记录操作日志
    if (this.syncOps && resource) {
      await this.syncOps.recordOp(
        SyncOpsEngine.OP_TYPES.RESOURCE_DELETED,
        rid,
        {
          path:
            resource.location_kind === 'local' ? resource.location : '',
          type: resource.type,
          hash: resource.hash,
        },
      );
    }

    return result;
  }

  async moveResource(rid, newPath) {
    const oldResource = await this.resourceService.getByRid(rid);
    const { result } = await this.operationEngine.execute("resource.move", {
      rid,
      newPath,
    });

    // 记录操作日志
    if (this.syncOps && oldResource) {
      await this.syncOps.recordOp(SyncOpsEngine.OP_TYPES.RESOURCE_MOVED, rid, {
        old_path:
          oldResource.location_kind === 'local' ? oldResource.location : '',
        new_path: path.relative(this.repoPath, newPath),
      });
    }

    return result;
  }

  async linkResources(ridA, ridB, type = "reference") {
    // P3：link 写入口统一经 relation.create operation（可撤销）
    if (type === "wikilink") {
      return this.createRelation(ridA, ridB, type);
    }
    const a = await this.createRelation(ridA, ridB, type);
    const b = await this.createRelation(ridB, ridA, type);
    return { a, b };
  }

  async unlinkResources(ridA, ridB, type = "reference") {
    // P3：unlink 写入口统一经 relation.remove operation（软删，可撤销）。
    // 找不到/已软删的关系按"不存在"处理（保持 CLI 不报错的既有语义）
    const removeDirection = async (from, to) => {
      const rel = await this.relationService.getByTriple(from, to, type);
      if (rel && !rel.deleted) {
        return this.removeRelation(rel.id);
      }
      return { removed: false };
    };
    if (type === "wikilink") {
      return removeDirection(ridA, ridB);
    }
    await removeDirection(ridA, ridB);
    await removeDirection(ridB, ridA);
    return { removed: true };
  }

  /**
   * Phase 5.1: 创建关系
   * Phase 5.2: 通过 OperationEngine 执行（获得 undo/redo/history）
   */
  async createRelation(fromRid, toRid, type = "reference", metadata = {}) {
    const { result } = await this.operationEngine.execute("relation.create", {
      fromRid,
      toRid,
      type,
      metadata,
    });
    this._invalidateGraphCache();
    return result;
  }

  /**
   * Phase 5.1: 软删除关系（按 id）
   * Phase 5.2: 通过 OperationEngine 执行
   */
  async removeRelation(id) {
    // 预加载完整关系数据用于 undo 重建
    const rel = await this.relationService.getById(id);
    if (!rel) throw new Error(`关系不存在: ${id}`);

    const { result } = await this.operationEngine.execute("relation.remove", {
      id,
      fromRid: rel.from_rid,
      toRid: rel.to_rid,
      type: rel.type,
      metadata: rel.metadata,
    });
    this._invalidateGraphCache();
    return result;
  }

  /**
   * Phase 5.1: 更新关系
   * Phase 5.2: 通过 OperationEngine 执行
   */
  async updateRelation(id, updates) {
    // 读取旧状态用于 undo
    const old = await this.relationService.getById(id);
    if (!old) throw new Error(`关系不存在: ${id}`);

    const params = {
      id,
      updates,
      oldType: old.type,
      oldMetadata: old.metadata,
    };

    const { result } = await this.operationEngine.execute(
      "relation.update",
      params,
    );
    this._invalidateGraphCache();
    return result;
  }

  /**
   * Phase 5.1: 获取单条关系
   */
  async getRelation(id) {
    return this.relationService.getById(id);
  }

  /**
   * 创建 Schema（经 OperationEngine 记录）
   */
  async createSchema(input) {
    const { result } = await this.operationEngine.execute("schema.create", {
      input,
    });
    return result;
  }

  /**
   * 更新 Schema（经 OperationEngine 记录）
   */
  async updateSchema(id, patch) {
    const { result } = await this.operationEngine.execute("schema.update", {
      id,
      patch,
    });
    return result;
  }

  /**
   * 删除 Schema（经 OperationEngine 记录）
   */
  async deleteSchema(id) {
    const { result } = await this.operationEngine.execute("schema.delete", {
      id,
    });
    return result;
  }

  /**
   * 创建 View（经 OperationEngine 记录）
   */
  async createView(input) {
    const { result } = await this.operationEngine.execute("view.create", {
      input,
    });
    return result;
  }

  /**
   * 更新 View（经 OperationEngine 记录）
   */
  async updateView(id, patch) {
    const { result } = await this.operationEngine.execute("view.update", {
      id,
      patch,
    });
    return result;
  }

  /**
   * 删除 View（经 OperationEngine 记录）
   */
  async deleteView(id) {
    const { result } = await this.operationEngine.execute("view.delete", {
      id,
    });
    return result;
  }

  /**
   * Phase 5.1: 列出关系（支持过滤）
   */
  async listRelations(filter = {}) {
    return this.relationService.listAll(filter);
  }

  // ──────────────────────────────────────
  // Phase 5.3: Graph API
  // ──────────────────────────────────────

  /**
   * 构建资源关系图
   */
  async getGraph() {
    if (this._graphCache && this._graphCache.has()) {
      return this._graphCache.get();
    }
    const relations = await this.relationService.listAll({ limit: 10000 });
    const builder = new GraphBuilder();
    const graph = builder.build(relations);
    if (this._graphCache) this._graphCache.set(graph);
    return graph;
  }

  /**
   * 使图缓存失效（relation 变更后调用）
   */
  _invalidateGraphCache() {
    if (this._graphCache) this._graphCache.invalidate();
  }

  async _getGraphEngine() {
    const graph = await this.getGraph();
    return new GraphEngine(graph);
  }

  async getNeighbors(rid) {
    const engine = await this._getGraphEngine();
    return engine.neighbors(rid);
  }

  async getBacklinks(rid) {
    const engine = await this._getGraphEngine();
    return engine.incoming(rid);
  }

  async getOutgoingLinks(rid) {
    const engine = await this._getGraphEngine();
    return engine.outgoing(rid);
  }

  async findPath(fromRid, toRid) {
    const engine = await this._getGraphEngine();
    return engine.findPath(fromRid, toRid);
  }

  async detectCycles() {
    const engine = await this._getGraphEngine();
    return engine.detectCycles();
  }

  async getReachable(rid) {
    const engine = await this._getGraphEngine();
    return engine.reachable(rid);
  }

  async getSubGraph(rid, depth = 2) {
    const engine = await this._getGraphEngine();
    return engine.subGraph(rid, depth);
  }

  async getGraphStats() {
    const engine = await this._getGraphEngine();
    return engine.stats();
  }

  /**
   * Phase 5.4: PageRank 分析
   */
  async getPageRank(options) {
    const engine = await this._getGraphEngine();
    return engine.pageRank(options);
  }

  /**
   * Phase 5.4: 中心节点
   */
  async getCentralNodes(topN) {
    const engine = await this._getGraphEngine();
    return engine.centralNodes(topN);
  }

  /**
   * Phase 5.4: 孤立节点
   */
  async getIsolatedNodes() {
    const engine = await this._getGraphEngine();
    return engine.isolatedNodes();
  }

  /**
   * Phase 5.4: 聚簇分析
   */
  async getClusters() {
    const engine = await this._getGraphEngine();
    return engine.clusters();
  }

  /**
   * Phase 5.4: 图查询 DSL
   * @returns {GraphQueryBuilder}
   */
  queryGraph() {
    // queryGraph 每次都重建（保证最新），不使用缓存
    const relationsPromise = this.relationService.listAll({ limit: 10000 });
    // 返回 lazy builder，在 run() 时才执行查询
    return {
      from: (rid) => this._buildQuery(rid, relationsPromise),
    };
  }

  async _buildQuery(rid, relationsPromise) {
    const relations = await relationsPromise;
    const builder = new GraphBuilder();
    const graph = builder.build(relations);
    const engine = new GraphEngine(graph);
    return new GraphQueryBuilder(engine).from(rid);
  }

  // ──────────────────────────────────────
  // Phase 5.5: Knowledge Navigation API
  // ──────────────────────────────────────

  async _getNavigationEngine() {
    const engine = await this._getGraphEngine();
    return new NavigationEngine(engine);
  }

  /**
   * 相关资源推荐
   */
  async getRelatedResources(rid, options) {
    const nav = await this._getNavigationEngine();
    return nav.related(rid, options);
  }

  /**
   * 反向链接详情（带关系类型）
   */
  async getBacklinkDetails(rid) {
    const nav = await this._getNavigationEngine();
    return nav.backlinks(rid);
  }

  /**
   * 资源邻域视图
   */
  async getResourceNeighborhood(rid, depth = 2) {
    const nav = await this._getNavigationEngine();
    return nav.neighborhood(rid, { depth });
  }

  /**
   * 知识路径解释
   */
  async getExplainPath(a, b) {
    const nav = await this._getNavigationEngine();
    return nav.explainPath(a, b);
  }

  /**
   * 影响分析
   */
  async analyzeImpact(rid) {
    const nav = await this._getNavigationEngine();
    return nav.impact(rid);
  }

  // ──────────────────────────────────────
  // Phase 5.6: Visualization API
  // ──────────────────────────────────────

  async _getVisualizationEngine() {
    const engine = await this._getGraphEngine();
    return new VisualizationEngine(engine);
  }

  /**
   * 可视化图（支持完整/邻域/类型三种视图）
   */
  async visualizeGraph(options = {}) {
    const ve = await this._getVisualizationEngine();
    return ve.visualize(options);
  }

  /**
   * 导出可视化结果
   */
  async exportVisualGraph(options = {}) {
    const {
      format = "json",
      layout = "force",
      rid,
      depth,
      type: graphType,
      width,
      height,
    } = options;
    const ve = await this._getVisualizationEngine();

    let vg;
    if (rid) {
      vg = ve.visualizeNeighborhood(rid, {
        depth: depth || 2,
        layout,
        width,
        height,
      });
    } else if (graphType) {
      vg = ve.visualizeByType(graphType, { layout, width, height });
    } else {
      vg = ve.visualizeFull({ layout, width, height });
    }

    if (!vg) throw new Error("Visualization failed");

    const exporter = new VisualExporter(vg, { width, height });

    switch (format) {
      case "html":
        return exporter.toHTML();
      case "svg":
        return exporter.toSVG();
      case "json":
        return exporter.toJSON();
      default:
        throw new Error(`不支持的导出格式: ${format}`);
    }
  }

  // ──────────────────────────────────────
  // Phase 5.7: Knowledge Intelligence API
  // ──────────────────────────────────────

  async _getKnowledgeAnalyzer() {
    const engine = await this._getGraphEngine();
    const nav = await this._getNavigationEngine();
    return new KnowledgeAnalyzer(engine, nav);
  }

  /**
   * 知识分析报告
   */
  async getKnowledgeReport() {
    const analyzer = await this._getKnowledgeAnalyzer();
    return analyzer.report();
  }

  /**
   * 知识密度
   */
  async getKnowledgeDensity() {
    const analyzer = await this._getKnowledgeAnalyzer();
    return analyzer.density();
  }

  /**
   * 知识缺口检测
   */
  async findKnowledgeGaps(options) {
    const analyzer = await this._getKnowledgeAnalyzer();
    return analyzer.gaps(options);
  }

  /**
   * 推荐
   */
  async _getRecommendationEngine() {
    const engine = await this._getGraphEngine();
    const nav = await this._getNavigationEngine();
    return new RecommendationEngine(engine, nav);
  }

  async getRecommendations(rid, options) {
    const rec = await this._getRecommendationEngine();
    return rec.related(rid, options);
  }

  async getNextLearning(rid, options) {
    const rec = await this._getRecommendationEngine();
    return rec.nextLearning(rid, options);
  }

  async getForgottenKnowledge(options) {
    const rec = await this._getRecommendationEngine();
    return rec.forgotten(options);
  }

  /**
   * 知识演化时间线
   */
  async getKnowledgeTimeline() {
    const timeline = new KnowledgeTimeline(this.db);
    const [monthly, growth, activity] = await Promise.all([
      timeline.monthly(),
      timeline.growthRate(),
      timeline.activity(),
    ]);
    return { monthly, growth, activity };
  }

  // ──────────────────────────────────────
  // Phase 5.8: AI Assisted Knowledge Graph
  // ──────────────────────────────────────

  /**
   * 获取 AI 上下文构建器
   */
  async _getAIContextBuilder() {
    const engine = await this._getGraphEngine();
    const nav = await this._getNavigationEngine();
    const analyzer = await this._getKnowledgeAnalyzer();
    const resolveName = (rid) => {
      try {
        return this.rs.get(rid);
      } catch {
        return { name: rid };
      }
    };
    return new AIContextBuilder(engine, nav, analyzer, resolveName);
  }

  /**
   * 构建 AI 上下文（用于外部 AI API 调用）
   */
  async buildAIContext(rid) {
    const builder = await this._getAIContextBuilder();
    if (rid) {
      return builder.buildResourceContext(rid);
    }
    return builder.buildGlobalContext();
  }

  /**
   * 构建对话上下文
   */
  async buildChatContext(query) {
    const builder = await this._getAIContextBuilder();
    return builder.buildChatContext(query);
  }

  /**
   * 生成 AI 建议（基于规则引擎）
   */
  async generateSuggestions(options) {
    const engine = await this._getGraphEngine();
    const nav = await this._getNavigationEngine();
    const semantic = new SemanticRelationEngine(engine, nav);
    const suggestions = semantic.suggest(options);

    // 保存到数据库
    const se = new SuggestionEngine(this.db);
    await se.createBatch(
      suggestions.map((s) => ({
        type: "relation",
        source: s.source,
        target: s.target,
        confidence: s.confidence,
        reason: s.reason,
        payload: { suggestedType: s.suggestedType },
      })),
    );

    return suggestions;
  }

  /**
   * 获取建议列表
   */
  async listSuggestions(options) {
    const se = new SuggestionEngine(this.db);
    return se.list(options);
  }

  /**
   * 批准建议（只改状态，不执行操作）
   */
  async approveSuggestion(id) {
    const se = new SuggestionEngine(this.db);
    return se.approve(id);
  }

  /**
   * 执行已批准的建议（创建 relation）
   */
  async executeApprovedSuggestion(id) {
    const se = new SuggestionEngine(this.db);
    const suggestion = await se.get(id);
    if (!suggestion) throw new Error("建议不存在");
    if (suggestion.status !== "approved") throw new Error("建议尚未审批");

    if (
      suggestion.type === "relation" &&
      suggestion.source &&
      suggestion.target
    ) {
      const relType =
        (suggestion.payload && suggestion.payload.suggestedType) || "reference";
      return this.createRelation(suggestion.source, suggestion.target, relType);
    }
    throw new Error(`不支持的建议类型: ${suggestion.type}`);
  }

  /**
   * 拒绝建议
   */
  async rejectSuggestion(id) {
    const se = new SuggestionEngine(this.db);
    return se.reject(id);
  }

  /**
   * 建议统计
   */
  async getSuggestionStats() {
    const se = new SuggestionEngine(this.db);
    return se.stats();
  }

  /**
   * AI 知识问答
   * @param {string} query
   */
  async askKnowledge(query) {
    const builder = await this._getAIContextBuilder();
    const analyzer = await this._getKnowledgeAnalyzer();
    const rec = await this._getRecommendationEngine();
    const assistant = new KnowledgeAssistant(builder, analyzer, rec);
    return assistant.ask(query);
  }

  /**
   * AI 解释资源
   * @param {string} rid
   */
  async explainWithAI(rid) {
    const builder = await this._getAIContextBuilder();
    const analyzer = await this._getKnowledgeAnalyzer();
    const assistant = new KnowledgeAssistant(builder, analyzer);
    return assistant.explain(rid);
  }

  /**
   * AI 摘要资源
   * @param {string} rid
   */
  async summarizeWithAI(rid) {
    const builder = await this._getAIContextBuilder();
    const analyzer = await this._getKnowledgeAnalyzer();
    const assistant = new KnowledgeAssistant(builder, analyzer);
    return assistant.summarize(rid);
  }

  /**
   * AI Memory 操作
   */
  async getAIMemory() {
    return new AIMemory(this.db);
  }

  // ──────────────────────────────────────
  // Phase 5.9: Knowledge OS Automation
  // ──────────────────────────────────────

  /**
   * 获取知识修复引擎
   */
  async _getKnowledgeRepair() {
    const engine = await this._getGraphEngine();
    return new KnowledgeRepair(this.db, engine);
  }

  /**
   * 获取知识调度器
   */
  _getKnowledgeScheduler() {
    const services = {};
    // Lazy: 异步获取服务引用（尽量避免在构造时加载引擎）
    return {
      db: this.db,
      services,
      _repo: this,
      async runAll() {
        const repo = this._repo;
        services.graphEngine = await repo._getGraphEngine();
        try {
          services.knowledgeAnalyzer = await repo._getKnowledgeAnalyzer();
        } catch (e) {
          require("../utils/logger.cjs").error(
            "repository: 初始化knowledgeAnalyzer失败",
            e,
          );
        }
        try {
          services.recommendationEngine = await repo._getRecommendationEngine();
        } catch (e) {
          require("../utils/logger.cjs").error(
            "repository: 初始化recommendationEngine失败",
            e,
          );
        }
        try {
          services.knowledgeRepair = await repo._getKnowledgeRepair();
        } catch (e) {
          require("../utils/logger.cjs").error(
            "repository: 初始化knowledgeRepair失败",
            e,
          );
        }
        const se = new SuggestionEngine(repo.db);
        services.suggestionEngine = se;
        const scheduler = new KnowledgeScheduler(repo.db, services);
        return scheduler.runAll();
      },
      async scanForgotten() {
        const repo = this._repo;
        services.graphEngine = await repo._getGraphEngine();
        const scheduler = new KnowledgeScheduler(repo.db, services);
        return scheduler.scanForgottenResources();
      },
      async analyzeHealth() {
        const repo = this._repo;
        try {
          services.knowledgeAnalyzer = await repo._getKnowledgeAnalyzer();
        } catch (e) {
          require("../utils/logger.cjs").error(
            "repository: 初始化knowledgeAnalyzer失败",
            e,
          );
        }
        try {
          services.knowledgeRepair = await repo._getKnowledgeRepair();
        } catch (e) {
          require("../utils/logger.cjs").error(
            "repository: 初始化knowledgeRepair失败",
            e,
          );
        }
        const scheduler = new KnowledgeScheduler(repo.db, services);
        return scheduler.analyzeKnowledgeHealth();
      },
      async generateReport() {
        const repo = this._repo;
        services.graphEngine = await repo._getGraphEngine();
        try {
          services.knowledgeAnalyzer = await repo._getKnowledgeAnalyzer();
        } catch (e) {
          require("../utils/logger.cjs").error(
            "repository: 初始化knowledgeAnalyzer失败",
            e,
          );
        }
        try {
          services.knowledgeRepair = await repo._getKnowledgeRepair();
        } catch (e) {
          require("../utils/logger.cjs").error(
            "repository: 初始化knowledgeRepair失败",
            e,
          );
        }
        const scheduler = new KnowledgeScheduler(repo.db, services);
        return scheduler.generateKnowledgeReport();
      },
    };
  }

  /**
   * 获取资源生命周期状态
   */
  async getKnowledgeLifecycle() {
    const resources = await this.db.all(`
      SELECT rid, name, created, updated FROM resources WHERE deleted = 0
    `);

    // 获取最后关系时间
    const lastRels = await this.db.all(`
      SELECT r.from_rid, MAX(r.created) as last_rel
      FROM relations r WHERE r.deleted = 0
      GROUP BY r.from_rid
    `);
    const relMap = new Map();
    for (const r of lastRels) {
      relMap.set(r.from_rid, r.last_rel || 0);
    }

    // 获取 PageRank 评分
    const pageRanks = new Map();
    try {
      const engine = await this._getGraphEngine();
      const pr = engine.pageRank({ iterations: 20, damping: 0.85 });
      for (const r of pr) pageRanks.set(r.rid, r.score);
    } catch (e) {
      require("../utils/logger.cjs").error("repository: 计算PageRank失败", e);
    }

    const inputs = resources.map((r) => ({
      rid: r.rid,
      name: r.name,
      score: pageRanks.get(r.rid) || 0,
      lastRelation: relMap.get(r.rid) || 0,
      created: r.created,
      updated: r.updated,
    }));

    const lifecycles = ResourceLifecycle.batch(inputs);
    const summary = ResourceLifecycle.summary(lifecycles);

    return {
      summary,
      resources: lifecycles.map((lc) => lc.toJSON()),
    };
  }

  /**
   * 运行知识修复诊断
   */
  async runKnowledgeRepair() {
    const repair = await this._getKnowledgeRepair();
    return repair.diagnose();
  }

  /**
   * 运行完整自动化管线
   */
  async runAutomation() {
    const scheduler = this._getKnowledgeScheduler();
    return scheduler.runAll();
  }

  /**
   * 扫描遗忘资源
   */
  async scanForgottenResources() {
    const scheduler = this._getKnowledgeScheduler();
    return scheduler.scanForgotten();
  }

  /**
   * 分析知识健康度
   */
  async analyzeKnowledgeHealth() {
    const scheduler = this._getKnowledgeScheduler();
    return scheduler.analyzeHealth();
  }

  /**
   * 资源文件监控
   */
  async watchResources() {
    const watcher = new ResourceWatcher(this.db, this.repoPath);
    return watcher.check();
  }

  /**
   * 获取知识事件记录
   * @param {{ type?: string, limit?: number }} options
   */
  async getKnowledgeEvents(options = {}) {
    const { type, limit = 50 } = options;
    let sql = "SELECT * FROM knowledge_events";
    const params = [];

    if (type) {
      sql += " WHERE type = ?";
      params.push(type);
    }

    sql += " ORDER BY created DESC LIMIT ?";
    params.push(limit);

    const rows = await this.db.all(sql, params);
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      rid: r.rid,
      payload: (() => {
        try {
          return JSON.parse(r.payload || "{}");
        } catch {
          return {};
        }
      })(),
      created: r.created,
    }));
  }

  // ──────────────────────────────────────
  // Phase 5.10: Distributed Knowledge Graph
  // ──────────────────────────────────────

  /**
   * 获取联邦管理器
   */
  getFederationManager() {
    return new FederationManager(this.db, this.repoPath);
  }

  /**
   * 获取联邦图引擎
   */
  getFederatedGraphEngine() {
    return new FederatedGraphEngine();
  }

  /**
   * 获取同步引擎
   */
  getSyncEngine() {
    return new SyncEngine(this.db, this.repoPath);
  }

  /**
   * 联邦仓库操作
   */
  async registerFederatedRepository(name, namespace, repoPath) {
    const fm = this.getFederationManager();
    return fm.register({ name, namespace, repoPath });
  }

  async removeFederatedRepository(namespaceOrName) {
    const fm = this.getFederationManager();
    return fm.remove(namespaceOrName);
  }

  async listFederatedRepositories() {
    const fm = this.getFederationManager();
    return fm.list();
  }

  /**
   * 构建联邦图
   * @param {string} localNamespace
   */
  async buildFederatedGraph(localNamespace) {
    const fm = this.getFederationManager();
    const sources = await fm.list();
    const engine = this.getFederatedGraphEngine();
    return engine.buildFederatedGraph(
      sources,
      this.repoPath,
      localNamespace || "local",
    );
  }

  /**
   * 同步: pull
   */
  async syncPull(namespace) {
    const fm = this.getFederationManager();
    const repo = await fm.getByNamespace(namespace);
    if (!repo) throw new Error(`Unknown namespace: ${namespace}`);

    const se = this.getSyncEngine();
    return se.pull(repo.path, namespace);
  }

  /**
   * 同步: push
   */
  async syncPush(namespace) {
    const fm = this.getFederationManager();
    const repo = await fm.getByNamespace(namespace);
    if (!repo) throw new Error(`Unknown namespace: ${namespace}`);

    const se = this.getSyncEngine();
    return se.push(repo.path, namespace);
  }

  /**
   * 同步状态
   */
  async getSyncStatus() {
    const se = this.getSyncEngine();
    return se.status();
  }

  /**
   * 冲突列表
   */
  async listConflicts(options) {
    const se = this.getSyncEngine();
    return se.listConflicts(options);
  }

  /**
   * 解决冲突
   */
  async resolveConflict(conflictId, strategy) {
    const se = this.getSyncEngine();
    return se.resolveConflict(conflictId, strategy);
  }

  /**
   * 在联邦中查找资源
   */
  async resolveFederatedResource(ridOrName) {
    const fm = this.getFederationManager();
    return fm.resolveResource(ridOrName);
  }

  /**
   * 联邦图查询
   * @param {string} fromId - globalId
   * @param {{ depth?: number, sources?: Array<string> }} options
   */
  async queryFederatedGraph(fromId, options = {}) {
    const { depth = 3, sources = null } = options;
    const localNS = "local"; // 当前仓库用 local namespace
    const result = await this.buildFederatedGraph(localNS);
    const engine = this.getFederatedGraphEngine();
    return engine.queryFederated(result.graph, fromId, depth, sources);
  }

  /**
   * 获取同步历史
   */
  async getSyncHistory(limit = 20) {
    const se = this.getSyncEngine();
    return se.syncHistory(limit);
  }

  // ──────────────────────────────────────
  // Phase 5.11: Knowledge Evolution & Collective Intelligence
  // ──────────────────────────────────────

  /**
   * 获取知识演化引擎
   */
  async _getKnowledgeEvolutionEngine() {
    const engine = await this._getGraphEngine();
    return new KnowledgeEvolutionEngine(this.db, engine);
  }

  /**
   * 获取知识模式引擎
   */
  async _getPatternEngine() {
    const engine = await this._getGraphEngine();
    return new KnowledgePatternEngine(engine, this.db);
  }

  /**
   * 获取知识策略引擎
   */
  async _getStrategyEngine() {
    const engine = await this._getGraphEngine();
    const ee = new KnowledgeEvolutionEngine(this.db, engine);
    return new KnowledgeStrategyEngine(this.db, {
      graphEngine: engine,
      evolutionEngine: ee,
    });
  }

  /**
   * 获取演化记忆
   */
  getEvolutionMemory() {
    return new EvolutionMemory(this.db);
  }

  /**
   * 知识演化分析
   */
  async analyzeEvolution(options = {}) {
    const ee = await this._getKnowledgeEvolutionEngine();
    return ee.analyze(options);
  }

  /**
   * 知识模式检测
   */
  async detectKnowledgePatterns(options = {}) {
    const pe = await this._getPatternEngine();
    return pe.detectAll(options);
  }

  /**
   * 生成知识策略
   */
  async generateKnowledgeStrategy() {
    const engine = await this._getGraphEngine();
    const ee = new KnowledgeEvolutionEngine(this.db, engine);

    let pe = null;
    try {
      pe = await this._getPatternEngine();
    } catch (e) {
      require("../utils/logger.cjs").error(
        "repository: 初始化patternEngine失败",
        e,
      );
    }

    const se = new KnowledgeStrategyEngine(this.db, {
      graphEngine: engine,
      evolutionEngine: ee,
      patternEngine: pe,
    });

    return se.generate();
  }

  /**
   * 集体知识分析
   */
  async collectiveKnowledgeAnalysis() {
    const fm = this.getFederationManager();
    const ce = new CollectiveKnowledgeEngine(this.db, fm);
    return ce.analyze();
  }

  /**
   * 创建知识快照
   */
  async createKnowledgeSnapshot() {
    const em = this.getEvolutionMemory();

    // Gather current stats
    const [resCount, relCount] = await Promise.all([
      this.db.get("SELECT COUNT(*) as c FROM resources WHERE deleted = 0"),
      this.db.get("SELECT COUNT(*) as c FROM relations WHERE deleted = 0"),
    ]);

    let density = 0;
    let entropy = 0;
    let growth = 0;

    try {
      const engine = await this._getGraphEngine();
      const analyzer = new (require("./knowledgeAnalyzer.cjs"))(engine);
      const d = await analyzer.density();
      density = d.density;

      const ee = new KnowledgeEvolutionEngine(this.db, engine);
      const ent = await ee.entropy();
      entropy = ent.normalized;

      const gr = await ee.growthRate(30);
      growth = gr.rate;
    } catch (e) {
      require("../utils/logger.cjs").error(
        "repository: 计算知识快照指标失败",
        e,
      );
    }

    return em.createSnapshot({
      resourceCount: resCount ? resCount.c : 0,
      relationCount: relCount ? relCount.c : 0,
      density,
      entropy,
      growth,
    });
  }

  /**
   * 列出知识快照
   */
  async listKnowledgeSnapshots(limit = 20) {
    const em = this.getEvolutionMemory();
    return em.list({ limit });
  }

  /**
   * 比较快照
   */
  async compareSnapshots(snapshotId) {
    const em = this.getEvolutionMemory();
    return em.compare(snapshotId);
  }

  // ──────────────────────────────────────
  // Phase 6.1: Plugin System
  // ──────────────────────────────────────

  /**
   * 获取 PluginManager（懒初始化）
   *
   * 插件目录: {repoPath}/.repo/plugins/
   * lo 系统本身不提供任何内置插件。
   */
  getPluginManager() {
    if (!this._pluginManager) {
      const pluginsDir = path.join(this.repoPath, ".repo", "plugins");

      this._pluginManager = new PluginManager({
        pluginsDir,
        repository: this,
        db: this.db,
        eventBus: this._getEventBus(),
      });
    }
    return this._pluginManager;
  }

  /**
   * 初始化插件系统
   */
  async initPluginSystem() {
    const pm = this.getPluginManager();
    await pm.initialize();
    return pm.listPlugins();
  }

  /**
   * 列出插件
   */
  async listPlugins() {
    const pm = this.getPluginManager();
    return pm.listPlugins();
  }

  /**
   * 安装插件（来源：lo 插件仓库）
   * @param {string} pluginId — 插件 ID
   * @param {object} [options]
   * @param {string} [options.registryUrl] — 插件仓库 index.json 地址（默认官方地址）
   */
  async installPlugin(pluginId, options = {}) {
    const pm = this.getPluginManager();
    return pm.installPlugin(pluginId, options);
  }

  /**
   * 卸载插件
   * @param {string} id — 插件 ID
   * @param {object} [options]
   * @param {boolean} [options.deleteFiles=false] — 是否同时删除插件文件
   */
  async uninstallPlugin(id, options = {}) {
    const pm = this.getPluginManager();
    return pm.unloadPlugin(id, options);
  }

  /**
   * P1-3: 更新插件到最新版本（保留配置）
   * @param {string} id — 插件 ID
   * @param {object} [options]
   * @param {string} [options.registryUrl] — 仓库地址
   * @returns {Promise<{upToDate: boolean, currentVersion: string, newVersion?: string}>}
   */
  async updatePlugin(id, options = {}) {
    const pm = this.getPluginManager();
    return pm.updatePlugin(id, options);
  }

  /**
   * 启用插件
   */
  async enablePlugin(id) {
    const pm = this.getPluginManager();
    return pm.enablePlugin(id);
  }

  /**
   * 禁用插件
   */
  async disablePlugin(id) {
    const pm = this.getPluginManager();
    return pm.disablePlugin(id);
  }

  /**
   * 重载插件
   */
  async reloadPlugin(id) {
    const pm = this.getPluginManager();
    return pm.reloadPlugin(id);
  }

  /**
   * 获取插件管理器 Hook/Action
   */
  getPluginHookManager() {
    return this.getPluginManager().getHookManager();
  }

  getPluginExtensionRegistry() {
    return this.getPluginManager().getExtensionRegistry();
  }

  /**
   * P0: 读取插件配置（合并 DB 存储 + manifest 默认值，按 schema 类型转换）
   * @param {string} id — 插件 ID
   * @returns {Promise<object>}
   */
  async getPluginConfig(id) {
    const pm = this.getPluginManager();
    return pm.getPluginConfig(id);
  }

  /**
   * P0: 设置插件配置项
   * @param {string} id    — 插件 ID
   * @param {string} key   — manifest.config 中声明的 key
   * @param {*}      value — 按 schema.type 校验/转换
   * @returns {Promise<void>}
   */
  async setPluginConfig(id, key, value) {
    const pm = this.getPluginManager();
    return pm.setPluginConfig(id, key, value);
  }

  /**
   * P0-3: 获取 DiscoveryService（懒初始化）
   * 提供资源发现管道：provider.discover → candidates → Core 写入
   */
  getDiscoveryService() {
    if (!this._discoveryService) {
      const DiscoveryService = require("../plugin/discoveryService.cjs");
      this._discoveryService = new DiscoveryService({
        repository: this,
        extensionRegistry: this.getPluginExtensionRegistry(),
        hookManager: this.getPluginHookManager(),
        logger: this.logger || console,
      });
    }
    return this._discoveryService;
  }

  // ──────────────────────────────────────
  // Phase 6.2: Event Bus System
  // ──────────────────────────────────────

  /**
   * 获取 EventBus（懒初始化）
   */
  _getEventBus() {
    if (!this._eventBus) {
      const store = new EventStore(this.db);
      const middleware = new EventMiddleware();

      // 默认日志中间件
      middleware.register(
        "afterEmit",
        (event) => {
          // Lightweight logging
          if (event.type !== "resource.updated") {
            // Debug: console.log(`[event] ${event.type} (${event.source})`);
          }
          return event;
        },
        -100,
      );

      this._eventBus = new EventBus({ store, middleware });
    }
    return this._eventBus;
  }

  /**
   * 发布事件
   * @param {string} type — 事件类型
   * @param {any} payload — 事件数据
   * @param {{ source?: string, metadata?: object }} options
   */
  emitEvent(type, payload, options = {}) {
    const bus = this._getEventBus();
    return bus.emit({
      type,
      payload,
      source: options.source || "repository",
      metadata: options.metadata || {},
    });
  }

  /**
   * 注册事件监听器
   */
  onEvent(type, handler) {
    const bus = this._getEventBus();
    bus.on(type, handler);
  }

  /**
   * 移除事件监听器
   */
  offEvent(type, handler) {
    const bus = this._getEventBus();
    bus.off(type, handler);
  }

  /**
   * 获取事件历史
   */
  async getEventHistory(options = {}) {
    const store = new EventStore(this.db);
    return store.query(options);
  }

  /**
   * 事件统计
   */
  async getEventStats() {
    const store = new EventStore(this.db);
    return store.typeStats();
  }

  /**
   * Event Replay
   */
  async replayEvents(options = {}) {
    const store = new EventStore(this.db);
    return store.replay(options);
  }

  /**
   * 获取事件监听器列表
   */
  getEventListeners(type) {
    const bus = this._getEventBus();
    return bus.listeners(type);
  }

  getRegisteredEventTypes() {
    const bus = this._getEventBus();
    return bus.registeredTypes();
  }

  // ──────────────────────────────────────
  // Phase 6.3: Workflow Engine
  // ──────────────────────────────────────

  /**
   * 获取 WorkflowEngine（懒初始化）
   */
  _getWorkflowEngine() {
    if (!this._workflowEngine) {
      const ruleEngine = new RuleEngine({ logger: this.logger || console });

      const registry = new WorkflowRegistry(this.db);

      this._workflowEngine = new WorkflowEngine({
        db: this.db,
        registry,
        ruleEngine,
        eventBus: this._getEventBus(),
        logger: this.logger || console,
        operationEngine: this.operationEngine || null,
        // applicableSchemas 作用域校验：返回 resource 已绑定 schema 的 id 列表
        schemaResolver: async (resourceRid) => {
          const bound =
            await this.schemaRegistry.getResourceSchema(resourceRid);
          return bound ? [bound.id] : [];
        },
      });
    }
    return this._workflowEngine;
  }

  /**
   * 初始化工作流系统
   */
  async initWorkflowSystem() {
    const engine = this._getWorkflowEngine();
    const loaded = await engine.registry.load();

    // 注册内置工作流
    if (loaded === 0) {
      await this._registerBuiltinWorkflows();
    }

    return engine;
  }

  /**
   * 注册内置工作流
   */
  async _registerBuiltinWorkflows() {
    const engine = this._getWorkflowEngine();

    // TaskWorkflow — 示例：任务流程 todo → doing → done
    const taskWorkflow = new Workflow({
      id: "task",
      name: "任务流程",
      description: "任务从待办到完成的状态流转",
      version: 1,
      applicableSchemas: [],
      states: [
        { id: "todo", name: "待办" },
        { id: "doing", name: "处理中" },
        { id: "done", name: "完成" },
      ],
      transitions: [
        { id: "start", from: "todo", to: "doing", name: "开始处理" },
        { id: "finish", from: "doing", to: "done", name: "完成" },
        { id: "reopen", from: "done", to: "todo", name: "重新打开" },
      ],
    });
    await engine.registry.create(taskWorkflow);
  }

  /**
   * 创建工作流
   */
  async createWorkflow(def) {
    const engine = this._getWorkflowEngine();
    const wf = new Workflow(def);
    await engine.registry.create(wf);
    return wf.toJSON();
  }

  /**
   * 更新工作流
   */
  async updateWorkflow(id, patch) {
    const engine = this._getWorkflowEngine();
    const wf = await engine.registry.update(id, patch);
    return wf.toJSON();
  }

  /**
   * 删除工作流（软删：status → deprecated，保留定义与实例/历史）
   * Workflow 是知识资产，不级联删除历史；彻底清理走 purgeWorkflow。
   */
  async deleteWorkflow(id) {
    const engine = this._getWorkflowEngine();
    await engine.registry.remove(id);
    return true;
  }

  /**
   * 彻底删除工作流（定义 + 实例/日志级联删除）—— 仅显式清理时使用
   */
  async purgeWorkflow(id) {
    const engine = this._getWorkflowEngine();
    await engine.registry.hardRemove(id);
    return true;
  }

  /**
   * 列出工作流
   */
  async listWorkflows() {
    const engine = this._getWorkflowEngine();
    return engine.listWorkflows();
  }

  /**
   * 获取工作流定义
   */
  async getWorkflow(id) {
    const engine = this._getWorkflowEngine();
    return engine.getWorkflow(id);
  }

  /**
   * 获取指定版本的定义快照（冻结定义，用于解释历史实例）
   */
  async getWorkflowVersion(id, version) {
    const engine = this._getWorkflowEngine();
    return engine.getWorkflowVersion(id, version);
  }

  /**
   * 列出定义的所有版本快照
   */
  async listWorkflowVersions(id) {
    const engine = this._getWorkflowEngine();
    return engine.listWorkflowVersions(id);
  }

  /**
   * Resource 加入 Workflow（创建实例）
   * 若已有 active 实例则复用；历史（detached/completed）实例不覆盖，创建新实例。
   */
  async attachWorkflow(resourceRid, workflowId, opts) {
    const engine = this._getWorkflowEngine();
    return engine.attach(resourceRid, workflowId, opts);
  }

  /**
   * Resource 退出 Workflow（软删：标记 detached，保留实例与历史）
   */
  async detachWorkflow(instanceId) {
    const engine = this._getWorkflowEngine();
    return engine.detach(instanceId);
  }

  /**
   * 恢复已 detached 的 Workflow 实例为 active（保留当前状态与历史）
   */
  async resumeWorkflow(instanceId, opts) {
    const engine = this._getWorkflowEngine();
    return engine.resume(instanceId, opts);
  }

  /**
   * 状态转换（唯一合法状态变化入口）
   */
  async transitionWorkflow(opts) {
    const engine = this._getWorkflowEngine();
    return engine.transition(opts);
  }

  /**
   * 预检状态转换
   */
  async canTransitionWorkflow(opts) {
    const engine = this._getWorkflowEngine();
    return engine.canTransition(opts);
  }

  /**
   * 列出 Workflow 实例
   */
  async listWorkflowInstances(filter) {
    const engine = this._getWorkflowEngine();
    return engine.listInstances(filter || {});
  }

  /**
   * 获取 Workflow 实例
   */
  async getWorkflowInstance(id) {
    const engine = this._getWorkflowEngine();
    return engine.getInstance(id);
  }

  /**
   * Workflow 转换历史
   */
  async getWorkflowHistory(filter, limit) {
    const engine = this._getWorkflowEngine();
    return engine.getHistory(filter || {}, limit);
  }

  // ──────────────────────────────────────
  // Phase 6.4: Permission System
  // ──────────────────────────────────────

  _getPermissionManager() {
    if (!this._permissionManager) {
      this._permissionManager = new PermissionManager(this.db);
      this._permissionManager.initialize().catch(() => {});
    }
    return this._permissionManager;
  }

  _getPolicyEngine() {
    if (!this._policyEngine) {
      this._policyEngine = new PolicyEngine({
        permissionManager: this._getPermissionManager(),
        audit: new PermissionAudit(this.db),
      });
    }
    return this._policyEngine;
  }

  async checkPermission(subject, action, resource) {
    const engine = this._getPolicyEngine();
    return engine.check(subject, action, resource);
  }

  async initPermissionSystem() {
    const pm = this._getPermissionManager();
    await pm.initialize();
    return pm;
  }

  async createRole(def) {
    const pm = this._getPermissionManager();
    return pm.createRole(def);
  }

  async listRoles() {
    const pm = this._getPermissionManager();
    return pm.listRoles();
  }

  async assignRole(subjectId, roleId) {
    const pm = this._getPermissionManager();
    return pm.assignRole(subjectId, roleId);
  }

  async unassignRole(subjectId, roleId) {
    const pm = this._getPermissionManager();
    return pm.unassignRole(subjectId, roleId);
  }

  async grantPermission(subjectId, action) {
    const pm = this._getPermissionManager();
    return pm.grantPermission(subjectId, action);
  }

  async revokePermission(subjectId, action) {
    const pm = this._getPermissionManager();
    return pm.revokePermission(subjectId, action);
  }

  async setResourceACL(resourceId, policy) {
    const pm = this._getPermissionManager();
    return pm.setResourceACL(resourceId, policy);
  }

  async getPermissionAudit(options) {
    const audit = new PermissionAudit(this.db);
    return audit.query(options);
  }

  async getDeniedPermissionStats() {
    const audit = new PermissionAudit(this.db);
    return audit.deniedStats();
  }

  // ──────────────────────────────────────
  // Phase 6.9: Security Manager（统一安全入口）
  // ──────────────────────────────────────

  _getSecurityManager() {
    if (!this._securityManager) {
      this._securityManager = new SecurityManager({
        db: this.db,
        eventBus: this._eventBus,
        logger: this.logger,
      });
    }
    return this._securityManager;
  }

  async initSecuritySystem() {
    const sec = this._getSecurityManager();
    await sec.initialize();
    return sec;
  }

  /** @type {SecurityManager} */
  get security() {
    return this._getSecurityManager();
  }

  // ──────────────────────────────────────
  // Phase 6.10: Knowledge Runtime
  // ──────────────────────────────────────

  _getRuntime() {
    if (!this._runtime) {
      this._runtime = new RuntimeKernel({
        db: this.db,
        eventBus: this._eventBus,
        security: this.security,
        logger: this.logger,
      });
    }
    return this._runtime;
  }

  async initRuntimeSystem() {
    const rt = this._getRuntime();
    if (rt.state.status === "created") {
      await rt.start();
    }
    return rt;
  }

  /** @type {RuntimeKernel} */
  get runtime() {
    return this._getRuntime();
  }

  // ──────────────────────────────────────
  // Automation: 行为编排层
  // ──────────────────────────────────────

  _getAutomationEngine() {
    if (!this._automationEngine) {
      this._initAutomation();
    }
    return this._automationEngine;
  }

  _initAutomation() {
    const registry = new AutomationRegistry(this.db);
    const store = new AutomationStore(this.db);
    const suggestionEngine = new SuggestionEngine(this.db);
    const extRegistry = this.getPluginExtensionRegistry();
    const executor = new ActionExecutor({
      repo: this,
      registry: new ActionRegistry(),
      extensionRegistry: extRegistry || null,
      suggestionEngine,
    });
    const triggerResolver = new TriggerResolver();

    this._automationRegistry = registry;
    this._automationStore = store;
    this._automationExecutor = executor;

    // 供 automation.* Operation handler 使用
    if (this.operationEngine) {
      try {
        this.operationEngine.setService("automationRegistry", registry);
      } catch (e) {
        /* ignore */
      }
    }

    this._automationEngine = new AutomationEngine({
      repo: this,
      registry,
      executor,
      store,
      eventBus: this._getEventBus(),
      suggestionEngine,
      triggerResolver,
      logger: this.logger || console,
    });

    this._automationScheduler = new AutomationScheduler({
      registry,
      engine: this._automationEngine,
      triggerResolver,
      scheduler: (this._getRuntime() && this._getRuntime().scheduler) || null,
      eventBus: this._getEventBus(),
      logger: this.logger || console,
    });
  }

  /**
   * 初始化 Automation 系统：加载注册表 → 注册内置 → 默认启用 → 启动调度器
   */
  async initAutomationSystem() {
    const engine = this._getAutomationEngine();
    await this._automationRegistry.load();

    // 注册内置自动化（仅当未存在时）
    const {
      knowledgeMaintenanceDefinition,
    } = require("../automation/builtin/knowledgeMaintenance.cjs");
    if (!this._automationRegistry.get("knowledge.maintenance.daily")) {
      const builtin = knowledgeMaintenanceDefinition();
      builtin.createdAt = Date.now();
      builtin.updatedAt = Date.now();
      this._automationRegistry._automations.set(builtin.id, builtin);
      await this._automationStore.saveAutomation(builtin);
    }

    // 默认启用 + 启动调度器
    if (!this._automationSchedulerStarted) {
      this._automationScheduler.start();
      this._automationSchedulerStarted = true;
    }

    return engine;
  }

  /** @type {AutomationEngine} */
  get automation() {
    return this._getAutomationEngine();
  }

  /** @type {AutomationScheduler} */
  get automationScheduler() {
    return this._automationScheduler;
  }

  // ── Automation facade ──────────────────

  async automationList() {
    const engine = this._getAutomationEngine();
    return engine.registry.list();
  }

  async automationShow(id) {
    const engine = this._getAutomationEngine();
    const a = engine.registry.get(id);
    if (!a) throw new Error(`Automation '${id}' 不存在`);
    return a.toJSON();
  }

  async automationCreate(def) {
    const { result } = await this.operationEngine.execute("automation.create", {
      def,
    });
    // 新增后刷新调度
    if (this._automationScheduler) this._automationScheduler.reload();
    return result;
  }

  async automationEnable(id) {
    const a = await this._automationRegistry.enable(id);
    if (this._automationScheduler) this._automationScheduler.reload();
    return a.toJSON();
  }

  async automationUpdate(id, patch) {
    const { result } = await this.operationEngine.execute("automation.update", {
      id,
      patch,
    });
    if (this._automationScheduler) this._automationScheduler.reload();
    return result;
  }

  async automationRemove(id) {
    const { result } = await this.operationEngine.execute("automation.remove", {
      id,
    });
    if (this._automationScheduler) this._automationScheduler.reload();
    return result;
  }

  async automationDisable(id) {
    const a = await this._automationRegistry.disable(id);
    if (this._automationScheduler) this._automationScheduler.reload();
    return a.toJSON();
  }

  async automationRun(id, opts = {}) {
    const engine = this._getAutomationEngine();
    // 未指定 id 时执行内置知识维护
    const target = id || "knowledge.maintenance.daily";
    return engine.executeAutomation(target, {
      triggerSource: opts.triggerSource || "cli",
      input: opts.input || null,
    });
  }

  async automationHistory(options = {}) {
    const store = this._automationStore || new AutomationStore(this.db);
    return store.listRuns(options);
  }

  async runKnowledgeReport() {
    const scheduler = new KnowledgeScheduler(
      this.db,
      await this._getSchedulerServices(),
    );
    return scheduler.generateKnowledgeReport();
  }

  async _getSchedulerServices() {
    const services = {};
    try {
      services.graphEngine = await this._getGraphEngine();
    } catch {}
    try {
      services.knowledgeAnalyzer = await this._getKnowledgeAnalyzer();
    } catch {}
    try {
      services.knowledgeRepair = await this._getKnowledgeRepair();
    } catch {}
    return services;
  }

  // ──────────────────────────────────────
  // Phase 6.5: Agent System
  // ──────────────────────────────────────

  _getAgentEngine() {
    if (!this._agentEngine) {
      const registry = new AgentRegistry();
      const store = new AgentStore(this.db);

      this._agentEngine = new AgentEngine({
        registry,
        store,
        repository: this,
        workflowEngine: this._getWorkflowEngine
          ? this._getWorkflowEngine()
          : null,
        eventBus: this._getEventBus(),
        logger: this.logger || console,
      });

      this._agentScheduler = new AgentScheduler({
        agentEngine: this._agentEngine,
        eventBus: this._getEventBus(),
        logger: this.logger || console,
      });
    }
    return this._agentEngine;
  }

  async initAgentSystem() {
    const engine = this._getAgentEngine();

    // 注册内置 Agent
    if (engine.listAgents().length === 0) {
      await this._registerBuiltinAgents();
    }

    // 启动调度器
    this._agentScheduler.start();

    return engine;
  }

  async _registerBuiltinAgents() {
    const engine = this._getAgentEngine();

    // Knowledge Reviewer — 周期检查遗忘/孤立/断裂
    await engine.register(
      new Agent({
        id: "knowledge-reviewer",
        name: "Knowledge Reviewer",
        type: "maintenance",
        description: "定期检查遗忘知识、孤立资源、断裂关系",
        capabilities: [
          "knowledge.analyze",
          "resource.inspect",
          "suggestion.create",
        ],
        triggers: [
          { type: "schedule", schedule: { cron: "weekly", time: "02:00" } },
        ],
      }),
    );

    // Knowledge Assistant — 资源创建时自动分析
    await engine.register(
      new Agent({
        id: "knowledge-assistant",
        name: "Knowledge Assistant",
        type: "assistant",
        description: "监听资源创建，自动提取摘要、推荐关系、生成标签",
        capabilities: [
          "resource.inspect",
          "suggestion.create",
          "notification.send",
        ],
        triggers: [{ type: "event", event: "resource.created" }],
      }),
    );

    // Research Agent — 知识缺口发现
    await engine.register(
      new Agent({
        id: "research-agent",
        name: "Research Agent",
        type: "research",
        description: "发现知识缺口，生成学习任务",
        capabilities: ["knowledge.analyze", "graph.query", "suggestion.create"],
        triggers: [
          { type: "schedule", schedule: { cron: "daily", time: "09:00" } },
        ],
      }),
    );
  }

  async registerAgent(def) {
    const engine = this._getAgentEngine();
    const agent = new Agent(def);
    await engine.register(agent);
    return agent.toJSON();
  }

  async listAgents() {
    const engine = this._getAgentEngine();
    return engine.listAgents();
  }

  async startAgent(id) {
    const engine = this._getAgentEngine();
    return engine.start(id);
  }

  async stopAgent(id) {
    const engine = this._getAgentEngine();
    return engine.stop(id);
  }

  async executeAgent(id, options) {
    const engine = this._getAgentEngine();
    return engine.execute(id, options);
  }

  async getAgentRuns(agentId, limit) {
    const engine = this._getAgentEngine();
    return engine.getRuns(agentId, limit);
  }

  async getAgentMemory(agentId, limit) {
    const engine = this._getAgentEngine();
    return engine.getMemory(agentId, limit);
  }

  // ──────────────────────────────────────
  // Phase 6.6: Multi-Agent Collaboration
  // ──────────────────────────────────────

  _getCollaborationEngine() {
    if (!this._collaborationEngine) {
      const teamRegistry = new TeamRegistry();
      const memory = new CollaborationMemory(this.db);
      const messageBus = new MessageBus({
        memory,
        eventBus: this._getEventBus(),
      });
      const sharedMemory = new SharedMemory(this.db);

      this._collaborationEngine = new CollaborationEngine({
        teamRegistry,
        messageBus,
        sharedMemory,
        memory,
        agentEngine: this._agentEngine,
        eventBus: this._getEventBus(),
        logger: this.logger || console,
      });
    }
    return this._collaborationEngine;
  }

  async initCollaborationSystem() {
    const engine = this._getCollaborationEngine();
    return engine;
  }

  async createAgentTeam(def) {
    const engine = this._getCollaborationEngine();
    return engine.createTeam(def);
  }

  async listAgentTeams() {
    const engine = this._getCollaborationEngine();
    return engine.listTeams();
  }

  async sendAgentMessage(from, to, type, payload) {
    const engine = this._getCollaborationEngine();
    return engine.sendMessage(from, to, type, payload);
  }

  async getAgentMessages(agentId, limit) {
    const engine = this._getCollaborationEngine();
    return engine.getMessages(agentId, limit);
  }

  async createAgentTask(teamId, goal) {
    const engine = this._getCollaborationEngine();
    return engine.createTask(teamId, goal);
  }

  async assignAgentTask(taskId) {
    const engine = this._getCollaborationEngine();
    return engine.assignTask(taskId);
  }

  async executeAgentTeam(teamId, goal) {
    const engine = this._getCollaborationEngine();
    return engine.executeTeam(teamId, goal);
  }

  async getSharedMemory(scope, type) {
    const engine = this._getCollaborationEngine();
    return engine.getSharedMemory(scope, type);
  }

  async getCollaborationHistory(teamId, limit) {
    const memory = new CollaborationMemory(this.db);
    return memory.listTasks(teamId, limit);
  }

  // ──────────────────────────────────────
  // Phase 6.7: AI Native Knowledge OS
  // ──────────────────────────────────────

  _getAIOS() {
    if (!this._aiOS) {
      this._aiOS = new AIOS({
        repository: this,
        graphEngine: this._getGraphEngine ? this._getGraphEngine() : null,
        agentEngine: this._getAgentEngine ? this._getAgentEngine() : null,
        workflowEngine: this._getWorkflowEngine
          ? this._getWorkflowEngine()
          : null,
        eventBus: this._getEventBus(),
      });
    }
    return this._aiOS;
  }

  async initAIOS() {
    const aiOS = this._getAIOS();
    aiOS.start();
    return aiOS;
  }

  async askAI(input, options) {
    const aiOS = this._getAIOS();
    return aiOS.ask(input, options);
  }

  async analyzeKnowledge(input) {
    const aiOS = this._getAIOS();
    return aiOS.analyze(input);
  }

  async getAIInsights() {
    const aiOS = this._getAIOS();
    return aiOS.insights();
  }

  async getAIStatus() {
    const aiOS = this._getAIOS();
    const obs = await aiOS.observe();
    return {
      running: aiOS.running,
      memory: obs.memory,
      concepts: obs.concepts,
      learning: obs.learning,
    };
  }

  // ──────────────────────────────────────
  // Phase 6.8: Knowledge OS Self-Evolution
  // ──────────────────────────────────────

  _getEvolutionEngine() {
    if (!this._evolutionEngine) {
      this._evolutionEngine = new EvolutionEngine({
        repository: this,
        graphEngine: this._getGraphEngine ? this._getGraphEngine() : null,
        agentEngine: this._getAgentEngine ? this._getAgentEngine() : null,
        workflowEngine: this._getWorkflowEngine
          ? this._getWorkflowEngine()
          : null,
        eventBus: this._getEventBus(),
        logger: this.logger || console,
      });
    }
    return this._evolutionEngine;
  }

  async initEvolutionEngine() {
    const engine = this._getEvolutionEngine();
    engine.start();
    return engine;
  }

  async observeSystem() {
    const engine = this._getEvolutionEngine();
    return engine.observe();
  }

  async analyzeHealth() {
    const engine = this._getEvolutionEngine();
    const snapshot = await engine.observe();
    return engine.healthAnalyzer.analyze(snapshot);
  }

  async detectEvolution() {
    const engine = this._getEvolutionEngine();
    const snapshot = await engine.observe();
    const health = await engine.healthAnalyzer.analyze(snapshot);
    return engine.detector.detect(snapshot, health);
  }

  async generateEvolutionPlan() {
    const engine = this._getEvolutionEngine();
    const opportunities = await this.detectEvolution();
    const strategies = engine.strategy.generate(opportunities);
    return engine.planner.plan(strategies);
  }

  async executeEvolution() {
    const engine = this._getEvolutionEngine();
    return engine.evolve();
  }

  async getEvolutionHistory(limit) {
    const engine = this._getEvolutionEngine();
    return engine.history(limit);
  }

  async getEvolutionStatus() {
    const engine = this._getEvolutionEngine();
    return engine.status();
  }

  async rollbackEvolution() {
    const engine = this._getEvolutionEngine();
    return engine.rollback();
  }

  async exportGraph(format = "json", options = {}) {
    // ── Hook: beforeExport ──
    const hooks = this._pluginManager
      ? this._pluginManager.getHookManager()
      : null;
    let finalFormat = format;
    let finalOptions = options;
    if (hooks) {
      const { cancelled, payload } = await hooks.runBefore("beforeExport", {
        format,
        options,
      });
      if (cancelled) throw new Error(`导出被 hook 取消`);
      finalFormat = payload.format !== undefined ? payload.format : format;
      finalOptions = payload.options !== undefined ? payload.options : options;
    }

    const graph = await this.getGraph();
    const exporter = new GraphExporter(graph);
    let result;
    switch (finalFormat) {
      case "json":
        result = exporter.toJSON();
        break;
      case "dot":
        result = exporter.toDOT(finalOptions);
        break;
      case "mermaid":
        result = exporter.toMermaid(finalOptions);
        break;
      case "adjacency":
        result = exporter.toAdjacencyList();
        break;
      default:
        throw new Error(`不支持的导出格式: ${finalFormat}`);
    }

    // ── Hook: afterExport ──
    if (hooks) {
      await hooks.runAfter("afterExport", {
        format: finalFormat,
        options: finalOptions,
        result,
      });
    }

    return result;
  }

  // ──────────────────────────────────────

  /**
   * 同步指定 Markdown 资源的所有派生关系（wikilink + embed）
   * 读取 .md 文件内容，一次解析所有引用类型，全量重建 relations 表
   *
   * 流程：read → parse all refs → delete old parser-originated relations → create new relations
   *
   * @param {string} rid - Markdown 资源的 RID
   * @returns {{wikilinks: number, embeds: number, broken: number, error?: string}}
   */
  async syncMarkdownRelations(rid) {
    const resource = await this.resourceService.getByRid(rid);
    if (!resource)
      return {
        wikilinks: 0,
        embeds: 0,
        broken: 0,
        error: "Resource not found",
      };
    if (resource.type !== "note") return { wikilinks: 0, embeds: 0, broken: 0 };

    try {
      const content = await this.resourceService._readFile(
        this.resourceService.resolveLocation({
          kind: resource.location_kind,
          value: resource.location,
        }),
        "utf-8",
      );

      // 聚合解析所有引用类型
      const { wikilinks, embeds } = MarkdownParser.parse(content);

      // ── 在事务中执行删除+创建，保证原子性 ──
      await this.db.exec("BEGIN");

      try {
        // 删除旧的 parser 创建的派生关系
        // wikilink: 删除 origin='markdown_parser' 的新数据 + origin 为 NULL 的历史数据
        await this.relationService.removeByFromRidAndType(
          rid,
          "wikilink",
          "markdown_parser",
        );
        await this.db.run(
          `DELETE FROM relations WHERE from_rid = ? AND type = ? AND json_extract(metadata, '$.origin') IS NULL`,
          [rid, "wikilink"],
        );
        // embed: 删除 origin='markdown_parser' 的关系
        await this.relationService.removeByFromRidAndType(
          rid,
          "embed",
          "markdown_parser",
        );

        // 创建新的 wikilink 关系
        let wikilinkCount = 0;
        for (const wl of wikilinks) {
          const targetRid = await this._resolveWikiLinkTarget(wl.target);
          if (targetRid && targetRid !== rid) {
            try {
              await this.relationService.create(rid, targetRid, "wikilink", {
                origin: "markdown_parser",
              });
              wikilinkCount++;
            } catch (e) {
              // UNIQUE 约束冲突，静默跳过
            }
          }
        }

        // 创建新的 embed 关系
        let embedCount = 0;
        let brokenCount = 0;
        for (const emb of embeds) {
          const targetRid = await this._resolveImageResource(
            resource,
            emb.target_path,
          );
          if (!targetRid) {
            brokenCount++;
            continue;
          }
          if (targetRid === rid) continue;
          try {
            await this.relationService.create(rid, targetRid, "embed", {
              origin: "markdown_parser",
              alt: emb.alt || "",
              ...(emb.title ? { title: emb.title } : {}),
            });
            embedCount++;
          } catch (e) {
            // UNIQUE 约束冲突，静默跳过
          }
        }

        await this.db.exec("COMMIT");
        return {
          wikilinks: wikilinkCount,
          embeds: embedCount,
          broken: brokenCount,
        };
      } catch (txError) {
        await this.db.exec("ROLLBACK");
        throw txError;
      }
    } catch (e) {
      return { wikilinks: 0, embeds: 0, broken: 0, error: e.message };
    }
  }

  /**
   * 将 wikilink target 解析为 RID
   * 复用 resolveResource 的 rid > name 查找逻辑
   * @param {string} target - 可能是 RID、name 或用户输入
   * @returns {Promise<string|null>}
   */
  async _resolveWikiLinkTarget(target) {
    const resource = await this.resolveResource(target);
    return resource ? resource.rid : null;
  }

  /**
   * 将 Markdown 中的图片引用解析为目标资源 RID
   * 复用 resolveResource，优先 RID → 路径上下文匹配 → name 匹配
   * @param {object} sourceResource - Markdown 资源对象（用于路径上下文解析）
   * @param {string} targetPath - Markdown 中的图片路径或 RID
   * @returns {Promise<string|null>} 目标资源 RID，找不到返回 null
   */
  async _resolveImageResource(sourceResource, targetPath) {
    if (/^https?:/i.test(targetPath) || /^data:/i.test(targetPath)) {
      return null;
    }

    // 1. 如果是 RID 格式，直接用 resolveResource 查找
    if (targetPath.startsWith("res_")) {
      const resource = await this.resolveResource(targetPath);
      return resource ? resource.rid : null;
    }

    // 2. 尝试基于 source resource 的路径上下文解析
    //    notes/test.md 引用 ./assets/photo.png
    //    → 拼接为 notes/assets/photo.png → resolveResource
    if (sourceResource && sourceResource.location_kind === 'local' && sourceResource.location) {
      const sourceDir = sourceResource.location.replace(/[^/\\]*$/, "");
      const combinedPath = sourceDir + targetPath.replace(/^\.\/?/);
      const resource = await this.resolveResource(combinedPath);
      if (resource) return resource.rid;
    }

    // 3. 退而求其次：按文件名候选查找（018 §3：入口自定候选 → resolveResource 统一 normalize）
    //    ./assets/img.png → basename 剥离 → resolveResource
    const candidate = this._candidateNameFromPath(targetPath);
    if (!candidate) return null;

    const resource = await this.resolveResource(candidate);
    return resource ? resource.rid : null;
  }

  /**
   * 从文件路径提取候选 name（embed 图片解析专用候选来源；018 §3）
   * 提取文件名（不含扩展名）、去除日期前缀、随机后缀——与创建链路的
   * filename 候选规则一致；最终由 resolveResource 统一 normalize。
   * @param {string} filePath - 文件路径或资源引用
   * @returns {string|null} 候选名称
   */
  _candidateNameFromPath(filePath) {
    if (!filePath) return null;

    // 提取文件名部分（去除目录）
    // ./assets/img.png → img.png, ../photo.jpg → photo.jpg
    let fileName = filePath;
    const lastSlash = Math.max(
      filePath.lastIndexOf("/"),
      filePath.lastIndexOf("\\"),
    );
    if (lastSlash !== -1) {
      fileName = filePath.substring(lastSlash + 1);
    }

    // 去除扩展名
    // img.png → img, photo.jpg → photo
    const lastDot = fileName.lastIndexOf(".");
    if (lastDot !== -1) {
      fileName = fileName.substring(0, lastDot);
    }

    // 去除日期前缀: YYYY-MM-DD-xxx → xxx
    fileName = fileName.replace(/^\d{4}-\d{2}-\d{2}-/, "");
    // 去除随机后缀: xxx-xxxxxxxx → xxx
    fileName = fileName.replace(/-[a-f0-9]{8}$/, "");

    return fileName || null;
  }

  async getRelations(rid) {
    return this.relationService.getRelations(rid);
  }

  /**
   * 全量重建所有 Markdown 资源的派生关系（wikilink + embed）
   * 适用于：批量更新、新功能初始化、修复数据不一致
   * @returns {Promise<{wikilinks: number, embeds: number, broken: number, errors: string[]}>}
   */
  async syncAllMarkdownRelations() {
    const allResources = await this.resourceService.getAll();
    let totalWikilinks = 0;
    let totalEmbeds = 0;
    let totalBroken = 0;
    const errors = [];

    for (const r of allResources) {
      if (r.type === "note") {
        try {
          const result = await this.syncMarkdownRelations(r.rid);
          if (result.error) {
            errors.push(`${r.rid}: ${result.error}`);
          } else {
            totalWikilinks += result.wikilinks;
            totalEmbeds += result.embeds;
            totalBroken += result.broken;
          }
        } catch (e) {
          errors.push(`${r.rid}: ${e.message}`);
        }
      }
    }

    return {
      wikilinks: totalWikilinks,
      embeds: totalEmbeds,
      broken: totalBroken,
      errors,
    };
  }

  async query(options = {}) {
    return this.queryEngine.queryResources(options);
  }

  async search(query) {
    // ── Hook: beforeSearch ──
    const hooks = this._pluginManager
      ? this._pluginManager.getHookManager()
      : null;
    let finalQuery = query;
    if (hooks) {
      const { cancelled, payload } = await hooks.runBefore("beforeSearch", {
        query,
      });
      if (cancelled) throw new Error(`搜索被 hook 取消`);
      finalQuery = payload.query !== undefined ? payload.query : query;
    }

    const results = await this.queryEngine.search(finalQuery);

    // ── Hook: afterSearch ──
    if (hooks) {
      await hooks.runAfter("afterSearch", { query: finalQuery, results });
    }

    return results;
  }

  async getStats() {
    return this.queryEngine.getStats();
  }

  async getResourceGraph(rid) {
    return this.queryEngine.getGraph(rid);
  }

  async getConfig(key, defaultValue) {
    const row = await this.db.get(
      "SELECT value FROM sync_config WHERE key = ?",
      [key],
    );
    if (row) {
      const value = row.value;
      if (value === "") return defaultValue;
      if (value === "true") return true;
      if (value === "false") return false;
      if (!isNaN(value)) return Number(value);
      return value;
    }
    return defaultValue;
  }

  async setConfig(key, value) {
    const strValue =
      typeof value === "boolean" ? value.toString() : String(value);
    await this.db.run(
      "INSERT OR REPLACE INTO sync_config (key, value) VALUES (?, ?)",
      [key, strValue],
    );
    return value;
  }

  async getLastSyncTime() {
    return this.getConfig("lastSyncTime", 0);
  }

  async setLastSyncTime(timestamp) {
    await this.setConfig("lastSyncTime", timestamp);
  }

  async logSync(action, path, details = "") {
    await this.db.run(
      "INSERT INTO sync_log (timestamp, action, path, details) VALUES (?, ?, ?, ?)",
      [Date.now(), action, path, details],
    );
  }

  async sync(options = {}) {
    const { full = false, wikilinks = false } = options;

    const result = {
      added: [],
      deleted: [],
      updated: [],
      renamed: [],
      skipped: [],
      total: 0,
      wikilinks: 0,
    };

    const lastSyncTime = full ? 0 : await this.getLastSyncTime();
    const currentTime = Date.now();

    const files = glob.sync("**/*", {
      cwd: this.repoPath,
      ignore: ["**/node_modules/**", "**/.git/**", "**/.repo/**"],
      absolute: true,
      nodir: true,
    });

    const dbResources = await this.resourceService.getAll();
    // 文件同步只覆盖仓库内（local）资源：key = 解析后的绝对路径
    const dbByPath = new Map(
      dbResources
        .filter((r) => r.location_kind === 'local' && r.location)
        .map((r) => [path.join(this.repoPath, r.location), r]),
    );

    // 第一阶段：处理路径匹配的文件（刷新已存在的），收集"疑似新增"文件
    const newFileCandidates = [];
    const wikilinkSyncRids = new Set();

    for (const file of files) {
      try {
        if (!ResourceType.isSupported(file)) {
          continue;
        }

        const existing = dbByPath.get(file);

        if (!existing) {
          // 新文件（可能来自重命名），始终处理，不依赖 mtime（rename 会保留原始 mtime）
          newFileCandidates.push(file);
        } else {
          // 已存在的文件：用 mtime 做增量过滤
          if (!full) {
            const stats = await fs.stat(file);
            if (stats.mtime.getTime() < lastSyncTime) {
              continue;
            }
          }
          const refreshed = await this.resourceService.refresh(existing.rid);
          if (
            refreshed.hash !== existing.hash ||
            JSON.stringify(refreshed.metadata) !==
              JSON.stringify(existing.metadata)
          ) {
            result.updated.push({
              path: file,
              type: existing.type,
              rid: existing.rid,
            });
            // md 文件内容变更后需要同步 wikilink
            if (file.toLowerCase().endsWith(".md")) {
              wikilinkSyncRids.add(existing.rid);
            }
            await this.logSync("updated", file, "hash or metadata changed");

            if (this.syncOps) {
              const relPath = path.relative(this.repoPath, file);
              await this.syncOps.recordOp(
                SyncOpsEngine.OP_TYPES.RESOURCE_UPDATED,
                existing.rid,
                {
                  path: relPath,
                  old_hash: existing.hash,
                  new_hash: refreshed.hash,
                  metadata: refreshed.metadata,
                },
              );
            }
          }
        }
      } catch (e) {
        result.skipped.push({
          path: file,
          error: e.message,
        });
      }
    }

    // 收集"疑似删除"的 DB 记录（路径在磁盘上不存在）
    // 跳过无文件资源（virtual）与仓库外资源（external）——不属于文件同步范畴
    const deletedCandidates = [];
    for (const resource of dbResources) {
      if (resource.location_kind !== 'local' || !resource.location) continue;
      const abs = path.join(this.repoPath, resource.location);
      if (!(await fs.pathExists(abs))) {
        deletedCandidates.push(resource);
      }
    }

    // 第二阶段：匹配"疑似删除"和"疑似新增"的 hash，检测重命名
    const HashUtils = require("../utils/hash.cjs");
    const newFileHashes = new Map();
    for (const file of newFileCandidates) {
      try {
        newFileHashes.set(
          file,
          await HashUtils.fromFile(file, this._cryptoKey),
        );
      } catch (e) {
        result.skipped.push({ path: file, error: e.message });
      }
    }

    const matchedNewPaths = new Set();
    for (const deletedResource of deletedCandidates) {
      const deletedAbs = path.join(
        this.repoPath,
        deletedResource.location_kind === 'local' ? deletedResource.location : '',
      );
      let matched = false;
      for (const [newFile, newHash] of newFileHashes) {
        if (matchedNewPaths.has(newFile)) continue;
        if (newHash === deletedResource.hash) {
          // 重命名：更新路径，RID 不变
          await this.resourceService.updatePath(deletedResource.rid, newFile);
          result.renamed.push({
            oldPath: deletedAbs,
            newPath: newFile,
            rid: deletedResource.rid,
          });
          await this.logSync(
            "renamed",
            `${deletedAbs} -> ${newFile}`,
            "hash matched",
          );

          if (this.syncOps) {
            const oldRel =
              deletedResource.location_kind === 'local'
                ? deletedResource.location
                : '';
            const newRel = path.relative(this.repoPath, newFile);
            await this.syncOps.recordOp(
              SyncOpsEngine.OP_TYPES.RESOURCE_MOVED,
              deletedResource.rid,
              {
                old_path: oldRel,
                new_path: newRel,
              },
            );
          }
          matchedNewPaths.add(newFile);
          matched = true;
          break;
        }
      }

      if (!matched) {
        // 真正的删除
        await this.resourceService.delete(deletedResource.rid, true);
        result.deleted.push({
          path: deletedAbs,
          type: deletedResource.type,
          rid: deletedResource.rid,
        });
        await this.logSync("deleted", deletedAbs, "file not found");

        if (this.syncOps) {
          const relPath =
            deletedResource.location_kind === 'local'
              ? deletedResource.location
              : '';
          await this.syncOps.recordOp(
            SyncOpsEngine.OP_TYPES.RESOURCE_DELETED,
            deletedResource.rid,
            {
              path: relPath,
              type: deletedResource.type,
              hash: deletedResource.hash,
            },
          );
        }
      }
    }

    // 未被匹配的新文件 → 真正的新增
    for (const [newFile] of newFileHashes) {
      if (matchedNewPaths.has(newFile)) continue;
      try {
        const resource = await this.importFile(newFile);
        result.added.push({
          path: newFile,
          type: resource.type,
          rid: resource.rid,
        });
        // .md 文件的 wikilink 已在 importFile 中同步，此处跟踪计数
        if (newFile.toLowerCase().endsWith(".md")) {
          wikilinkSyncRids.add(resource.rid);
        }
        await this.logSync("added", newFile, resource.type);

        if (this.syncOps) {
          const relPath = path.relative(this.repoPath, newFile);
          await this.syncOps.recordOp(
            SyncOpsEngine.OP_TYPES.RESOURCE_CREATED,
            resource.rid,
            {
              name: resource.name,
              layer: resource.layer || 0,
              type: resource.type,
              path: relPath,
              hash: resource.hash,
              metadata: resource.metadata,
              encrypted: resource.encrypted,
              created: resource.created,
              updated: resource.updated,
            },
          );
        }
      } catch (e) {
        result.skipped.push({ path: newFile, error: e.message });
      }
    }

    await this.setLastSyncTime(currentTime);

    // 同步 Markdown 派生关系（wikilink + embed）
    if (wikilinks) {
      // 全量扫描：所有 note 类型资源
      const allResources = await this.resourceService.getAll();
      for (const r of allResources) {
        if (r.type === "note") {
          const syncResult = await this.syncMarkdownRelations(r.rid);
          if (!syncResult.error) {
            result.wikilinks += syncResult.wikilinks;
            result.embeds = (result.embeds || 0) + syncResult.embeds;
          }
        }
      }
    } else {
      // 增量：只同步变更过的 .md 文件
      for (const rid of wikilinkSyncRids) {
        const syncResult = await this.syncMarkdownRelations(rid);
        if (!syncResult.error) {
          result.wikilinks += syncResult.wikilinks;
          result.embeds = (result.embeds || 0) + syncResult.embeds;
        }
      }
    }

    result.total =
      result.added.length +
      result.deleted.length +
      result.updated.length +
      result.renamed.length;

    return result;
  }

  async commit(message, stagingResult, isMerge = false) {
    await this.db.run(
      "INSERT INTO commits (message, timestamp, added, updated, deleted, renamed, metadata, merge) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        message,
        Date.now(),
        stagingResult.added,
        stagingResult.updated || 0,
        stagingResult.deleted,
        stagingResult.renamed,
        stagingResult.metadata || 0,
        isMerge ? 1 : 0,
      ],
    );
  }

  async getCommits(limit = 20) {
    return this.db.all(
      "SELECT * FROM commits ORDER BY timestamp DESC LIMIT ?",
      [limit],
    );
  }

  startWatcher(callback) {
    this.watcher = new FileWatcher(this.repoPath, async (event) => {
      try {
        await this._handleFileEvent(event);
        if (callback) {
          callback(event);
        }
      } catch (e) {
        console.error(`Watcher event error: ${e.message}`);
      }
    });

    this.watcher.start();
    return this;
  }

  async _syncNewFiles() {
    const resourcesDir = path.join(this.repoPath, "resources");

    if (!(await fs.pathExists(resourcesDir))) {
      return { added: 0, deleted: 0, updated: 0, moved: 0 };
    }

    const lastSyncTime = await this.getLastSyncTime();
    const currentTime = Date.now();

    const files = glob.sync("**/*", {
      cwd: resourcesDir,
      ignore: ["**/node_modules/**", "**/.git/**"],
      absolute: true,
      nodir: true,
    });

    let addedCount = 0;
    let movedCount = 0;
    for (const file of files) {
      try {
        if (!ResourceType.isSupported(file)) {
          continue;
        }

        const stats = await fs.stat(file);
        const mtime = stats.mtime.getTime();

        if (lastSyncTime > 0 && mtime < lastSyncTime) {
          continue;
        }

        const existingByPath = await this.resourceService.getByPath(file);
        if (existingByPath) {
          continue;
        }

        const existingByHash = await this.resourceService.getByHash(file);
        if (existingByHash) {
          await this.resourceService.update(existingByHash.rid, { path: file });
          movedCount++;
        } else {
          await this.importFile(file);
          addedCount++;
        }
      } catch (e) {
        console.warn(`Failed to sync ${file}: ${e.message}`);
      }
    }

    if (addedCount > 0 || movedCount > 0) {
      await this.setLastSyncTime(currentTime);
    }

    return { added: addedCount, deleted: 0, updated: 0, moved: movedCount };
  }

  async _handleFileEvent(event) {
    const { event: eventType, path: filePath } = event;

    // 检查是否属于 Container Source —— 容器内容由 sync engine 管理
    if (this.containerService) {
      const inSource =
        await this.containerService.isInContainerSource(filePath);
      if (inSource) {
        // 标记对应容器为 dirty（文件变更，等待 sync）
        await this._markContainersDirtyForFile(filePath);
        return;
      }
    }

    switch (eventType) {
      case "add":
        if (ResourceType.isSupported(filePath)) {
          await this.importFile(filePath);
        }
        break;

      case "change":
        const resource = await this.resourceService.getByPath(filePath);
        if (resource) {
          await this.resourceService.rehash(resource.rid);
          // note 类型资源内容变化时，重新解析所有派生关系
          if (resource.type === "note") {
            try {
              await this.syncMarkdownRelations(resource.rid);
            } catch (e) {
              require("../utils/logger.cjs").error(
                "repository: 同步markdown关系失败",
                e,
              );
            }
          }
        }
        break;

      case "delete":
        const deletedResource = await this.resourceService.getByPath(filePath);
        if (deletedResource) {
          await this.resourceService.delete(deletedResource.rid, true);
        }
        break;
    }
  }

  /**
   * 找到包含指定文件路径的 Container，标记为 dirty
   */
  async _markContainersDirtyForFile(filePath) {
    try {
      const normalizedPath = filePath.replace(/\\/g, "/");
      const sources = await this.sourceService.getEnabledSources();
      for (const src of sources) {
        const normalizedSource = src.location.replace(/\\/g, "/");
        if (
          normalizedPath.startsWith(`${normalizedSource}/`) ||
          normalizedPath === normalizedSource
        ) {
          await this.syncEngine.markDirty(src.resource_rid);
        }
      }
    } catch (e) {
      // 静默失败，不影响 watcher 主流程
    }
  }

  static async create(repoPath) {
    await fs.ensureDir(repoPath);
    await fs.ensureDir(path.join(repoPath, ".repo"));
    await fs.ensureDir(path.join(repoPath, ".repo", "plugins"));
    await fs.ensureDir(path.join(repoPath, "resources"));

    const repo = new Repository(repoPath);
    await repo.init();

    return repo;
  }
}

module.exports = Repository;
