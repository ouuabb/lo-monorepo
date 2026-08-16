/**
 * PluginManager — 插件系统中枢
 *
 * lo 只提供插件运行时能力，不自带任何插件。
 * 所有插件都安装在 {repoPath}/.repo/plugins/ 下。
 * 插件安装来源唯一：lo 插件仓库。
 *
 * 对外 API:
 *   initialize()     — 扫描并加载所有插件
 *   installPlugin(id)— 安装插件（来源：lo 插件仓库）
 *   unloadPlugin(id) — 卸载插件
 *   enablePlugin(id) — 启用
 *   disablePlugin(id)— 禁用
 *   reloadPlugin(id) — 重载
 *   listPlugins()    — 列出
 *   getPlugin(id)    — 获取插件实例
 *   getContext(id)   — 获取插件上下文（供扩展点消费方使用）
 */

const path = require("path");
const fs = require("fs-extra");
const os = require("os");
const PluginLoader = require("./pluginLoader.cjs");
const PluginRegistry = require("./pluginRegistry.cjs");
const TypeRegistry = require("./typeRegistry.cjs");
const ExtensionRegistry = require("./extensionRegistry.cjs");
const HookManager = require("./hookManager.cjs");
const LifecycleManager = require("./lifecycleManager.cjs");
const PluginContext = require("./pluginContext.cjs");
const {
  DEFAULT_PLUGIN_REGISTRY,
  fetchRegistry,
  findPlugin,
  installFromEntry,
} = require("./pluginRegistryClient.cjs");

class PluginManager {
  /**
   * @param {object} options
   * @param {string} options.pluginsDir — 插件目录路径（{repoPath}/.repo/plugins/）
   * @param {object} [options.repository] — Repository 实例
   * @param {object} [options.logger] — 日志
   * @param {object} [options.db] — 数据库（用于持久化插件状态）
   */
  constructor(options = {}) {
    this.pluginsDir = options.pluginsDir;

    // 子系统
    this.loader = new PluginLoader(this.pluginsDir);
    this.registry = new PluginRegistry();
    this.extensions = new ExtensionRegistry();
    this.hooks = new HookManager();
    this.lifecycle = new LifecycleManager();

    // Context 服务
    this._baseServices = {
      repository: options.repository || null,
      logger: options.logger || console,
      extensionRegistry: this.extensions,
      hookManager: this.hooks,
      eventBus: options.eventBus || null,
    };

    // 数据库（用于持久化状态）
    this.db = options.db || null;

    /** @type {Map<string, PluginContext>} pluginId → context */
    this._contexts = new Map();

    /** @type {boolean} 是否已完成 initialize()（用于幂等） */
    this._initialized = false;
  }

  // ── 插件配置 ──

  /**
   * 读取插件配置（合并 DB 存储 + manifest 默认值，按 schema 类型转换）
   *
   * P0: 修复配置注入断链。manifest.config schema 形如：
   *   { exportFilePath: { type: 'string', default: '' },
   *     autoDiscover:   { type: 'boolean', default: false } }
   *
   * @param {string} pluginId
   * @returns {Promise<object>} 配置对象（已类型转换 + 合并默认值）
   */
  async getPluginConfig(pluginId) {
    const plugin = this.registry.get(pluginId);
    if (!plugin) {
      throw new Error(
        `Plugin '${pluginId}' not found（无法读取配置：插件未加载）`,
      );
    }
    return this._resolveConfig(plugin);
  }

  /**
   * 设置插件配置项
   * @param {string} pluginId
   * @param {string} key   — 必须在 manifest.config 中声明
   * @param {*}      value — 按 schema.type 校验/转换后存为 TEXT
   * @returns {Promise<void>}
   */
  async setPluginConfig(pluginId, key, value) {
    const plugin = this.registry.get(pluginId);
    if (!plugin) {
      throw new Error(
        `Plugin '${pluginId}' not found（无法设置配置：插件未加载）`,
      );
    }

    const schema = (plugin.manifest().config || {})[key];
    if (!schema) {
      throw new Error(
        `插件 '${pluginId}' 未声明配置项 '${key}'（请在 manifest.config 中声明）`,
      );
    }

    const { raw, typed } = this._coerceConfigValue(
      value,
      schema.type,
      key,
      pluginId,
    );

    if (!this.db) {
      throw new Error("数据库不可用，无法持久化插件配置");
    }
    await this.db.run(
      `INSERT OR REPLACE INTO plugin_settings (plugin_id, key, value) VALUES (?, ?, ?)`,
      [pluginId, key, raw],
    );

    // 若插件已激活，同步更新其 PluginContext 的 _configData（立即生效，无需 reload）
    const ctx = this._contexts.get(pluginId);
    if (ctx) {
      ctx._configData = { ...(ctx._configData || {}), [key]: typed };
    }
  }

  /**
   * 删除插件所有配置（仅卸载且 deleteFiles=true 时调用）
   */
  async _deletePluginConfig(pluginId) {
    if (!this.db) return;
    try {
      await this.db.run("DELETE FROM plugin_settings WHERE plugin_id = ?", [
        pluginId,
      ]);
    } catch {}
  }

  /**
   * 解析插件配置：DB 存储 + manifest 默认值 → 类型转换后的对象
   * @param {object} plugin — 插件实例
   * @returns {Promise<object>}
   */
  async _resolveConfig(plugin) {
    const configSchema = plugin.manifest().config || {};
    const dbValues = await this._readConfigRows(plugin.id);

    const result = {};
    for (const [key, schema] of Object.entries(configSchema)) {
      const type = (schema && schema.type) || "string";
      if (Object.prototype.hasOwnProperty.call(dbValues, key)) {
        // DB 有存储值：按 type 反序列化
        result[key] = this._deserializeConfigValue(dbValues[key], type);
      } else if (
        schema &&
        Object.prototype.hasOwnProperty.call(schema, "default")
      ) {
        // 未存储但有默认值
        result[key] = schema.default;
      }
    }
    return result;
  }

  /**
   * 从 DB 读取插件配置原始行
   * @param {string} pluginId
   * @returns {Promise<object>} { key: value(string) }
   */
  async _readConfigRows(pluginId) {
    if (!this.db) return {};
    try {
      const rows = await this.db.all(
        "SELECT key, value FROM plugin_settings WHERE plugin_id = ?",
        [pluginId],
      );
      const map = {};
      for (const r of rows) map[r.key] = r.value;
      return map;
    } catch {
      return {};
    }
  }

  /**
   * 校验并转换用户输入的配置值
   * @returns {{ raw: string, typed: any }}
   */
  _coerceConfigValue(value, type, key, pluginId) {
    if (type === "boolean") {
      const b = this._toBoolean(value);
      if (b === null) {
        throw new Error(
          `配置项 '${key}'（${pluginId}）期望 boolean，得到: ${JSON.stringify(value)}`,
        );
      }
      return { raw: b ? "true" : "false", typed: b };
    }
    if (type === "number") {
      const n = Number(value);
      if (value === "" || Number.isNaN(n)) {
        throw new Error(
          `配置项 '${key}'（${pluginId}）期望 number，得到: ${JSON.stringify(value)}`,
        );
      }
      return { raw: String(n), typed: n };
    }
    // 默认 string
    if (value === null || value === undefined) {
      return { raw: "", typed: "" };
    }
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error(
        `配置项 '${key}'（${pluginId}）期望 string，得到 ${typeof value}`,
      );
    }
    const s = String(value);
    return { raw: s, typed: s };
  }

  /**
   * 反序列化 DB 中的字符串为配置类型
   */
  _deserializeConfigValue(raw, type) {
    if (type === "boolean") {
      const b = this._toBoolean(raw);
      return b === null ? false : b;
    }
    if (type === "number") {
      const n = Number(raw);
      return Number.isNaN(n) ? 0 : n;
    }
    return raw;
  }

  _toBoolean(v) {
    if (typeof v === "boolean") return v;
    if (v === "true" || v === "1" || v === 1) return true;
    if (
      v === "false" ||
      v === "0" ||
      v === 0 ||
      v === "" ||
      v === null ||
      v === undefined
    )
      return false;
    return null; // 无法识别
  }

  // ── 生命周期编排 ──

  /**
   * 初始化：扫描并加载所有插件
   */
  async initialize() {
    if (this._initialized) return;
    const plugins = await this.loader.loadAll();

    // 构建 plugin map 用于依赖检测
    const pluginMap = new Map();
    for (const p of plugins) {
      pluginMap.set(p.id, p);
    }

    // 循环依赖检测
    const cycles = this.loader.detectCycles(pluginMap);
    if (cycles.length > 0) {
      throw new Error(`Circular dependency detected: ${cycles.join(" → ")}`);
    }

    // 拓扑排序
    const sortedIds = this.loader.topologicalSort(pluginMap);

    // P2: 错误隔离——单个插件激活失败不阻塞其他插件
    // 坏插件的 initialize/enable 抛错时，log + 清理半注册状态 + 跳过，继续加载后续插件
    const failed = [];
    for (const id of sortedIds) {
      const plugin = pluginMap.get(id);
      try {
        await this._activatePlugin(plugin);
      } catch (e) {
        console.error(`[plugin] 插件 '${id}' 激活失败，跳过: ${e.message}`);
        this._safelyCleanupPlugin(id);
        failed.push(id);
      }
    }

    // 持久化到 DB
    await this._savePluginStates();

    // 幂等：只有本次实际加载到至少一个插件才锁定 _initialized
    // 如果当前没有任何插件（如新仓库、测试先 init 再手动复制插件），允许后续再次调用 initialize() 重新扫描
    if (sortedIds.length > 0) {
      this._initialized = true;
    }
  }

  /**
   * 安装插件（来源：lo 插件仓库）
   *
   * 流程（P2-1 真实化，对应参考文档第 10 节"用户安装"）：
   *   1. 从插件仓库获取 index.json 清单
   *   2. 按 id 查找插件条目
   *   3. 下载插件包到临时目录
   *   4. 校验 sha256 checksum
   *   5. 解压并移动到 {pluginsDir}/{pluginId}/
   *   6. 加载并激活插件
   *
   * 仓库地址配置优先级：options.registryUrl > LO_PLUGIN_REGISTRY 环境变量 > 默认官方地址。
   * 支持 http(s):// 与本地路径（file:// 或绝对路径）。
   *
   * @param {string} pluginId — 插件 ID
   * @param {object} [options]
   * @param {string} [options.registryUrl] — 插件仓库 index.json 地址
   * @returns {Promise<Plugin>}
   */
  async installPlugin(pluginId, options = {}) {
    const registryUrl = options.registryUrl || DEFAULT_PLUGIN_REGISTRY;
    const targetPath = path.join(this.pluginsDir, pluginId);

    if (await fs.pathExists(targetPath)) {
      throw new Error(`Plugin '${pluginId}' already installed`);
    }

    // 1-2. 获取清单并查找
    const index = await fetchRegistry(registryUrl);
    const entry = findPlugin(index, pluginId);
    if (!entry) {
      throw new Error(
        `Plugin '${pluginId}' 不在插件仓库中（检查插件 ID 与仓库地址: ${registryUrl}）`,
      );
    }

    // 3-5. 下载 → 校验 → 解压到临时目录（避免半成品污染正式插件目录）
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lo-plugin-"));
    let plugin = null;
    let installed = false;
    try {
      await installFromEntry(entry, registryUrl, tmpDir);

      // 验证解压产物包含 plugin.json
      if (!(await fs.pathExists(path.join(tmpDir, "plugin.json")))) {
        throw new Error(`插件包缺少 plugin.json: ${pluginId}`);
      }

      // 移动到正式插件目录
      await fs.ensureDir(targetPath);
      await _moveContents(tmpDir, targetPath);

      // P1-4: 安装插件 npm 依赖（若有 dependencies，运行 npm install --production）
      await this._installDependencies(targetPath, pluginId);

      // 6. 加载并激活
      plugin = await this.loader.load(targetPath);
      if (!plugin) {
        throw new Error(`Failed to load plugin: ${pluginId}`);
      }

      await this._activatePlugin(plugin);
      await this._savePluginStates();
      installed = true;

      return plugin;
    } finally {
      await fs.remove(tmpDir);
      // 安装未成功（加载/激活失败）时回滚，避免半成品污染正式插件目录
      if (!installed) {
        await fs.remove(targetPath).catch(() => {});
        if (plugin) {
          try {
            this.registry.unregister(plugin.id);
            this.extensions.unregisterAll(plugin.id);
            this.hooks.unregisterAll(plugin.id);
            this.lifecycle.remove(plugin.id);
            this._contexts.delete(plugin.id);
            this._unregisterMetadataFields(plugin.id);
            this._unregisterTypeExtensions(plugin.id);
          } catch {}
        }
      }
    }
  }

  /**
   * 更新插件到最新版本（P1-3）
   *
   * 安全更新流程（失败自动回滚到旧版本）：
   *   1. 检查远程仓库版本，与当前比较，相同/更低则跳过
   *   2. 先下载新版本到临时目录 + 校验 + 解压（不碰旧版本）
   *   3. 下载校验成功后，才卸载旧插件(保留配置) + 备份旧文件
   *   4. 移动新版本到插件目录 + 依赖安装 + 加载激活
   *   5. 激活失败 → 删除新版本半成品 + 恢复旧文件 + 重新加载旧版本
   *
   * 配置自动保留：unloadPlugin(deleteFiles=false) 不清理 plugin_settings，
   * _activatePlugin 从 DB 读回配置。
   *
   * @param {string} id — 插件 ID
   * @param {object} [options]
   * @param {string} [options.registryUrl] — 仓库地址
   * @returns {Promise<{upToDate: boolean, currentVersion: string, newVersion?: string}>}
   */
  async updatePlugin(id, options = {}) {
    const plugin = this.registry.get(id);
    if (!plugin) {
      throw new Error(`Plugin '${id}' not found（无法更新：插件未加载）`);
    }

    const currentVersion = plugin.version;
    const registryUrl = options.registryUrl || DEFAULT_PLUGIN_REGISTRY;
    const pluginDir = path.join(this.pluginsDir, id);

    // 1. 获取远程版本
    const index = await fetchRegistry(registryUrl);
    const entry = findPlugin(index, id);
    if (!entry) {
      throw new Error(
        `Plugin '${id}' 不在插件仓库中（检查仓库地址: ${registryUrl}）`,
      );
    }

    const remoteVersion = entry.version;

    // 2. 版本比较：相同或当前更高则跳过
    if (_compareVersions(currentVersion, remoteVersion) >= 0) {
      return { upToDate: true, currentVersion };
    }

    // 3. 先下载新版本到临时目录 + 校验 + 解压（旧版本完全不受影响）
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lo-update-"));
    let newPlugin = null;
    let activated = false;
    let backupDir = null;

    try {
      await installFromEntry(entry, registryUrl, tmpDir);

      // 验证解压产物包含 plugin.json
      if (!(await fs.pathExists(path.join(tmpDir, "plugin.json")))) {
        throw new Error(`插件包缺少 plugin.json: ${id}`);
      }

      // 4. 下载校验成功 → 卸载旧插件(保留配置) + 备份旧文件
      await this.unloadPlugin(id, { deleteFiles: false });

      if (await fs.pathExists(pluginDir)) {
        const candidateBackup = `${pluginDir}.bak-${Date.now()}`;
        await fs.move(pluginDir, candidateBackup);
        backupDir = candidateBackup;
      }

      // 5. 移动新版本到插件目录 + 依赖安装
      await fs.ensureDir(pluginDir);
      await _moveContents(tmpDir, pluginDir);
      await this._installDependencies(pluginDir, id);

      // 6. 加载激活（配置从 DB 读回）
      newPlugin = await this.loader.load(pluginDir);
      if (!newPlugin) {
        throw new Error(`Failed to load plugin: ${id}`);
      }
      await this._activatePlugin(newPlugin);
      await this._savePluginStates();
      activated = true;

      // 7. 成功：删除备份
      if (backupDir) {
        await fs.remove(backupDir).catch(() => {});
      }

      return { upToDate: false, currentVersion, newVersion: remoteVersion };
    } finally {
      await fs.remove(tmpDir).catch(() => {});
      // 激活失败 → 回滚到旧版本
      if (!activated) {
        // 先清理新插件注册（必须在恢复旧版本之前，否则 unregister(newPlugin.id)
        // 会把同 id 的旧版本也从 registry 移除）
        if (newPlugin) {
          try {
            this.registry.unregister(newPlugin.id);
            this.extensions.unregisterAll(newPlugin.id);
            this.hooks.unregisterAll(newPlugin.id);
            this.lifecycle.remove(newPlugin.id);
            this._contexts.delete(newPlugin.id);
            this._unregisterMetadataFields(newPlugin.id);
            this._unregisterTypeExtensions(newPlugin.id);
          } catch {}
        }
        // 仅当已进入替换阶段（backupDir 存在）才需清理新版本半成品 + 恢复旧文件
        // 下载阶段失败时 backupDir=null，旧版本未动，不能碰 pluginDir
        if (backupDir) {
          // 清理新版本半成品
          if (await fs.pathExists(pluginDir)) {
            await fs.remove(pluginDir).catch(() => {});
          }
          // 恢复旧文件 + 重新加载
          if (await fs.pathExists(backupDir)) {
            try {
              await fs.move(backupDir, pluginDir, { overwrite: true });
              const oldPlugin = await this.loader.load(pluginDir);
              if (oldPlugin) {
                await this._activatePlugin(oldPlugin);
                await this._savePluginStates();
              }
            } catch {}
          }
        }
      }
    }
  }

  /**
   * 安装插件 npm 依赖（P1-4）
   *
   * 读取 package.json（npm 标准）或 plugin.json 的 dependencies，
   * 非空则在插件目录运行 `npm install --production`。
   * 无依赖或无 package.json 时跳过。
   *
   * @param {string} pluginDir — 插件目录
   * @param {string} pluginId — 插件 ID（日志/错误用）
   */
  async _installDependencies(pluginDir, pluginId) {
    let deps = {};
    // 优先 package.json（npm 标准）
    try {
      const pkg = JSON.parse(
        await fs.readFile(path.join(pluginDir, "package.json"), "utf8"),
      );
      deps = { ...(pkg.dependencies || {}) };
      // 合并 peerDependencies：插件可能按 npm 惯例将宿主提供的依赖声明为 peerDeps。
      // @lo/plugins-sdk / lo-plugins-sdk 由 lo 运行时（monorepo workspace 链接）提供，无需安装；其余 peerDeps 需安装。
      const peerDeps = pkg.peerDependencies || {};
      let merged = false;
      for (const [name, ver] of Object.entries(peerDeps)) {
        if (name !== "@lo/plugins-sdk" && name !== "lo-plugins-sdk" && !deps[name]) {
          deps[name] = ver;
          merged = true;
        }
      }
      // 将合并后的 dependencies 写回 package.json，使无参数 npm install 能正确安装全部依赖
      // 同时避免通过 shell 传参时版本范围中的 ^ 等特殊字符被 cmd.exe 转义消耗
      if (merged) {
        pkg.dependencies = deps;
        await fs.writeFile(
          path.join(pluginDir, "package.json"),
          JSON.stringify(pkg, null, 2),
        );
      }
    } catch {
      // 无 package.json，检查 plugin.json 是否声明 dependencies
      try {
        const manifest = JSON.parse(
          await fs.readFile(path.join(pluginDir, "plugin.json"), "utf8"),
        );
        deps = manifest.dependencies || {};
      } catch {
        return; // 无可读的清单，跳过
      }
    }

    if (Object.keys(deps).length === 0) return; // 无依赖，跳过

    const { execSync } = require("child_process");
    this._baseServices.logger.log(
      `[plugin] 安装依赖 (${pluginId}): ${Object.keys(deps).join(", ")}`,
    );
    // --legacy-peer-deps 避免 @lo/plugins-sdk 等 peerDep 解析失败
    try {
      execSync(
        "npm install --production --no-audit --no-fund --legacy-peer-deps",
        {
          cwd: pluginDir,
          stdio: "pipe",
          timeout: 60000,
        },
      );
    } catch (e) {
      throw new Error(`插件 '${pluginId}' 依赖安装失败: ${e.message}`);
    }
  }

  /**
   * 卸载插件
   * @param {string} id — 插件 ID
   * @param {object} [options]
   * @param {boolean} [options.deleteFiles=false] — 是否删除插件文件
   */
  async unloadPlugin(id, options = {}) {
    const { deleteFiles = false } = options;
    const plugin = this.registry.get(id);
    if (!plugin) throw new Error(`Plugin '${id}' not found`);

    const pluginDir = plugin._pluginDir;

    // 禁用 → 销毁
    if (this.lifecycle.isEnabled(id)) {
      await this._transition(id, "disabled", () => plugin.disable());
    }

    await this._transition(id, "disposed", () => plugin.dispose());

    // 清理注册
    this.extensions.unregisterAll(id);
    this.hooks.unregisterAll(id);
    this.registry.unregister(id);
    this.lifecycle.remove(id);
    this._contexts.delete(id);
    this._unregisterMetadataFields(id);
    this._unregisterTypeExtensions(id);

    await this._deletePluginState(id);

    // 删除文件
    if (deleteFiles && pluginDir) {
      try {
        await fs.remove(pluginDir);
      } catch (e) {
        console.error(`[plugin] Failed to remove plugin files: ${e.message}`);
      }
      // P0: 彻底卸载时清理用户配置（reload / 普通卸载保留配置）
      await this._deletePluginConfig(id);
    }
  }

  /**
   * 启用插件
   */
  async enablePlugin(id) {
    const plugin = this.registry.get(id);
    if (!plugin) throw new Error(`Plugin '${id}' not found`);

    const current = this.lifecycle.getState(id);
    if (current === "enabled") return;

    if (current === "disabled" || current === "initialized") {
      await this._transition(id, "enabled", () => plugin.enable());
    }

    await this._savePluginStates();
  }

  /**
   * 禁用插件
   */
  async disablePlugin(id) {
    const plugin = this.registry.get(id);
    if (!plugin) throw new Error(`Plugin '${id}' not found`);

    if (this.lifecycle.isEnabled(id)) {
      await this._transition(id, "disabled", () => plugin.disable());
      await this._savePluginStates();
    }
  }

  /**
   * 重载插件
   */
  async reloadPlugin(id) {
    const plugin = this.registry.get(id);
    if (!plugin) throw new Error(`Plugin '${id}' not found`);

    const pluginDir = plugin._pluginDir;
    if (!pluginDir) throw new Error("Cannot reload: plugin directory unknown");

    // 卸载
    await this.unloadPlugin(id);

    // 重新加载
    const reloaded = await this.loader.load(pluginDir);
    if (!reloaded) throw new Error(`Failed to reload plugin: ${id}`);

    await this._activatePlugin(reloaded);
    await this._savePluginStates();

    return reloaded;
  }

  // ── 查询 ──

  listPlugins() {
    return this.registry.list();
  }

  getPlugin(id) {
    return this.registry.get(id);
  }

  getExtensionRegistry() {
    return this.extensions;
  }

  /**
   * 获取插件上下文（供扩展点消费方使用，如 importers 需创建资源/关系）
   * @param {string} pluginId
   * @returns {PluginContext|null}
   */
  getContext(pluginId) {
    return this._contexts.get(pluginId) || null;
  }

  getHookManager() {
    return this.hooks;
  }

  // ── 内部方法 ──

  /**
   * 激活插件：注册 → 初始化 → 启用
   *
   * P0-2: 使用 $setContext() 注入上下文（SDK 接口），
   *       同时保留 plugin.context = ctx 向后兼容。
   *       注入 resourceService / relationService 供 Facade 使用。
   */
  async _activatePlugin(plugin) {
    const id = plugin.id;

    // P0: 读取插件配置（DB 存储 + manifest 默认值），注入 PluginContext
    //     修复此前 context.config() 永远返回 {} 的断链 bug
    const config = await this._resolveConfig(plugin);

    // P0: 注入 setConfig 闭包，委托 pm.setPluginConfig（修复 ctx.setConfig 空头声明 bug）
    //     箭头函数捕获 this 与 id，插件内 ctx.setConfig(key, value) 即落库 + 立即同步 _configData
    const setConfigFn = (key, value) => this.setPluginConfig(id, key, value);

    // 构建 PluginContext，注入 ResourceService / RelationService / config / setConfigFn
    const services = {
      ...this._baseServices,
      pluginId: id,
      config,
      setConfigFn,
      resourceService: this._baseServices.repository
        ? this._baseServices.repository.resourceService
        : null,
      relationService: this._baseServices.repository
        ? this._baseServices.repository.relationService
        : null,
      // U3：Mode/Viewer 注册与解析（写入 mode_definitions/viewer_definitions 表）
      modes: {
        register: (def) => this._baseServices.repository.registerPluginMode(def, id),
        resolve: async (rid) => {
          const modes = await this._baseServices.repository.resolveModes(rid);
          return { ok: true, modes };
        },
      },
      viewers: {
        register: (def) => this._baseServices.repository.registerPluginViewer(def, id),
      },
    };
    const context = new PluginContext(services);

    // SDK 注入顺序：先 $setContext，再 register
    if (typeof plugin.$setContext === "function") {
      // SDK 插件：通过 $setContext 注入，context 是只读 getter
      plugin.$setContext(context);
    } else {
      // 向后兼容：旧插件可能依赖 context setter
      plugin.context = context;
    }
    this._contexts.set(id, context);

    this.registry.register(plugin);
    this.lifecycle.setState(id, "loaded");
    plugin.state = "loaded";

    // U3：register 可能含异步注册（ctx.modes/viewers.register）；await 兼容同步/异步
    await plugin.register(context);
    this.extensions.registerAll(id, plugin.contributes);

    // 注册插件声明的自定义 metadata 字段（contributes.resourceTypes[].metadataSchema）
    this._registerMetadataFields(id, plugin.contributes);

    // 注册插件扩展的文件类型（contributes.resourceTypes[].extensions）
    this._registerTypeExtensions(id, plugin.contributes);

    this.lifecycle.setState(id, "initialized");
    plugin.state = "initialized";
    await plugin.initialize();

    await this._transition(id, "enabled", () => plugin.enable());
  }

  /**
   * 安全清理插件注册状态（不调用 disable/dispose）
   * 用于插件激活失败时的回滚——插件可能处于不一致状态，不能安全调用生命周期方法
   * @param {string} id — 插件 ID
   */
  _safelyCleanupPlugin(id) {
    try {
      this.extensions.unregisterAll(id);
    } catch {}
    try {
      this.hooks.unregisterAll(id);
    } catch {}
    try {
      this.lifecycle.remove(id);
    } catch {}
    try {
      this.registry.unregister(id);
    } catch {}
    try {
      this._contexts.delete(id);
    } catch {}
    try {
      this._unregisterMetadataFields(id);
    } catch {}
    try {
      this._unregisterTypeExtensions(id);
    } catch {}
  }

  async _transition(id, targetState, action) {
    try {
      if (action) await action();
    } catch (e) {
      console.error(
        `[plugin] Transition failed for '${id}' → ${targetState}: ${e.message}`,
      );
      throw e;
    }
    this.lifecycle.setState(id, targetState);

    const plugin = this.registry.get(id);
    if (plugin) {
      plugin.state = targetState;
    }
  }

  async _savePluginStates() {
    if (!this.db) return;

    for (const plugin of this.registry.plugins) {
      const state = this.lifecycle.getState(plugin.id);
      const enabled = state === "enabled" ? 1 : 0;

      try {
        await this.db.run(
          `INSERT OR REPLACE INTO plugins (id, name, version, enabled, installed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            plugin.id,
            plugin.name,
            plugin.version,
            enabled,
            Date.now(),
            Date.now(),
          ],
        );
      } catch {}
    }
  }

  async _deletePluginState(id) {
    if (!this.db) return;
    try {
      await this.db.run("DELETE FROM plugins WHERE id = ?", [id]);
    } catch {}
  }

  /**
   * 注册插件 contributes.resourceTypes 中声明的自定义 metadata 字段
   *
   * metadataSchema 格式（纯数据，无函数）:
   *   {
   *     recordId:    { type: 'string' },
   *     translation: { type: 'string' },
   *     ...
   *   }
   * type 取值: 'string' | 'number' | 'boolean' | 'array'
   */
  _registerMetadataFields(pluginId, contributes) {
    if (!contributes || !Array.isArray(contributes.resourceTypes)) return;

    let registerMetadataField;
    try {
      ({ registerMetadataField } = require("../utils/validateMetadata.cjs"));
    } catch {
      return; // validateMetadata 不可用时静默跳过
    }

    // type → check 函数映射
    const typeCheckers = {
      string: (v) => typeof v === "string",
      number: (v) => typeof v === "number",
      boolean: (v) => typeof v === "boolean",
      array: (v) => Array.isArray(v),
    };

    for (const rt of contributes.resourceTypes) {
      if (!rt || !rt.metadataSchema || typeof rt.metadataSchema !== "object")
        continue;

      for (const [fieldName, fieldDef] of Object.entries(rt.metadataSchema)) {
        const typeName = fieldDef && fieldDef.type;
        const checkFn = typeCheckers[typeName];
        if (!checkFn) {
          console.warn(
            `[plugin] ${pluginId} metadata 字段 "${fieldName}" 类型未知: ${typeName}，` +
              `支持: string|number|boolean|array`,
          );
          continue;
        }

        try {
          registerMetadataField(
            fieldName,
            { type: typeName, check: checkFn },
            { owner: pluginId, resourceType: rt.type },
          );
        } catch (e) {
          console.warn(
            `[plugin] ${pluginId} 注册 metadata 字段 "${fieldName}" 失败: ${e.message}`,
          );
        }
      }
    }
  }

  /**
   * 注销插件注册的所有 metadata 字段（卸载时调用）
   */
  _unregisterMetadataFields(pluginId) {
    try {
      const {
        unregisterMetadataFields,
      } = require("../utils/validateMetadata.cjs");
      unregisterMetadataFields(pluginId);
    } catch {}
  }

  /**
   * 注册插件 contributes.resourceTypes 中声明的文件扩展名
   * 使 lo 核心的文件类型判断能感知插件扩展的类型
   */
  _registerTypeExtensions(pluginId, contributes) {
    if (!contributes || !Array.isArray(contributes.resourceTypes)) return;
    for (const rt of contributes.resourceTypes) {
      if (!rt || !Array.isArray(rt.extensions)) continue;
      for (const ext of rt.extensions) {
        TypeRegistry.register(pluginId, ext, rt.type);
      }
    }
  }

  /**
   * 注销插件注册的所有文件扩展名（卸载时调用）
   */
  _unregisterTypeExtensions(pluginId) {
    TypeRegistry.unregisterAll(pluginId);
  }
}

/**
 * 移动目录内容到目标目录（排除安装包自身 tar.gz）
 * @param {string} srcDir
 * @param {string} destDir
 */
async function _moveContents(srcDir, destDir) {
  const entries = await fs.readdir(srcDir);
  for (const name of entries) {
    if (name.endsWith(".tar.gz")) continue; // 排除安装包本体
    await fs.move(path.join(srcDir, name), path.join(destDir, name), {
      overwrite: true,
    });
  }
}

/**
 * 语义化版本比较（P1-3 updatePlugin 用）
 * @param {string} a
 * @param {string} b
 * @returns {number} a>b → 正数；a<b → 负数；相等 → 0
 */
function _compareVersions(a, b) {
  const pa = String(a || "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

// 暴露为静态方法供测试直接覆盖边界（预发布/空/undefined/多位/非数字段）
PluginManager.compareVersions = _compareVersions;

module.exports = PluginManager;
