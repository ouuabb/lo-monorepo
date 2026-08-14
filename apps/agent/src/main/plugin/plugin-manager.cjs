/**
 * plugin-manager.cjs —— 插件管理器
 *
 * 职责：
 *   - 生命周期编排（load → activate → deactivate → dispose）
 *   - 插件注册表（id → 实例）
 *   - 构造插件 Context（注入 loImpl / logger / config）
 *   - 收集插件 contributes → 注册到 ExtensionRegistry
 *
 * 边界：
 *   - 插件经 ctx.lo（SDK 契约）调用 Host Adapter；Host 内部经 @lo/client 访问 Core
 *   - 插件不能直接访问 lo Core HTTP
 */
const { PluginLoader } = require('./plugin-loader.cjs');
const { createLoImpl } = require('./lo-adapter.cjs');
const { PluginInstaller } = require('./plugin-installer.cjs');
const { resolveActivationOrder } = require('./activation-order.cjs');
const fs = require('fs');
const path = require('path');
const {
  fromHost,
  AgentPluginContext,
  parseContributes,
  resolvePermissions,
} = require('@lo/agent-plugins-sdk');

class PluginManager {
  /**
   * @param {object} options
   * @param {string} options.pluginsDir — 插件根目录
   * @param {string} options.hostRequireBase — 解析 SDK 的基准路径
   * @param {import('../lo-core.cjs')} options.loCore — LoCoreService
   * @param {import('./extension-registry.cjs')} [options.extensionRegistry]
   * @param {import('./plugin-store.cjs')} [options.pluginStore] — 配置/设置持久化
   * @param {object} [options.logger] — 宿主 logger
   */
  constructor(options) {
    this.pluginsDir = options.pluginsDir;
    this.loCore = options.loCore;
    this.logger = options.logger || console;
    this.loader = new PluginLoader(options.pluginsDir, options.hostRequireBase);
    /** @type {import('./extension-registry.cjs')} */
    this.extensionRegistry = options.extensionRegistry || null;
    /** @type {import('./plugin-store.cjs')} */
    this.pluginStore = options.pluginStore || null;
    /** @type {import('./plugin-installer.cjs')} */
    this.installer = new PluginInstaller(options.pluginsDir);
    /** @type {Map<string, { plugin, manifest, dir, state, enabled }>} */
    this._registry = new Map();
    /** @type {Map<string, number>} pluginId → isolated worldId（渲染端 UI，Host 统一分配） */
    this._uiWorldIds = new Map();
    /** 渲染端 isolated worldId 分配游标（1000+ 起，避开 Electron 保留 world） */
    this._uiWorldCounter = 0;
    /** 激活中的插件集合（循环依赖保护） */
    this._activating = new Set();
  }

  /** 扫描并加载全部插件（发现 → 加载 → 实例化） */
  async initialize() {
    const loaded = await this.loader.loadAll();
    for (const { id, manifest, dir, plugin } of loaded) {
      this._registry.set(id, { id, plugin, manifest, dir, state: 'loaded' });
    }
    return this.list();
  }

  /** 激活单个插件（构造 context + activate） */
  async activate(id) {
    const entry = this._registry.get(id);
    if (!entry) throw new Error(`插件未加载: ${id}`);
    if (entry.state === 'activated') return;
    // 硬依赖（dependsOn）先激活：即使被依赖方声明了延迟激活也强制先激活
    await this._ensureDepsActivated(entry);
    if (this._activating.has(id)) return; // 循环依赖保护
    this._activating.add(id);

    try {
      const ctx = this._createContext(entry);
      if (typeof entry.plugin.$setContext === 'function') {
        entry.plugin.$setContext(ctx);
      } else {
        entry.plugin.context = ctx;
      }

      await entry.plugin.activate(ctx);
      entry.state = 'activated';
      // 收集插件 contributes → 注册扩展点（纯数据）
      if (this.extensionRegistry) {
        const points = parseContributes(entry.manifest);
        entry.extensionPoints = this.extensionRegistry.registerAll(points);
      }
    } catch (e) {
      console.error(`[plugin] 激活失败 ${id}: ${e.message}`);
      throw e;
    } finally {
      this._activating.delete(id);
    }
  }

  /** 确保 manifest.dependsOn 声明的依赖已激活（无环保护） */
  async _ensureDepsActivated(entry) {
    const deps = Array.isArray(entry.manifest && entry.manifest.dependsOn)
      ? entry.manifest.dependsOn
      : [];
    for (const dep of deps) {
      const d = this._registry.get(dep);
      if (d && d.state !== 'activated' && !this._activating.has(dep)) {
        await this.activate(dep);
      }
    }
  }

  /** 是否延迟激活（仅含 onCommand/onView/onPanel/onEditor 触发点） */
  _isLazy(entry) {
    const ev = entry.manifest && entry.manifest.activationEvents;
    if (!Array.isArray(ev) || ev.length === 0) return false;
    return !ev.some((t) => t === 'onStartup' || t === '*');
  }

  /**
   * 按触发点激活匹配的延迟激活插件（如 onCommand:<id> → 激活声明该触发点的插件）
   * @param {'onCommand'|'onView'|'onPanel'|'onEditor'} prefix
   * @param {string} id
   */
  async _activateForTrigger(prefix, id) {
    const trigger = `${prefix}:${id}`;
    for (const entry of this._registry.values()) {
      if (entry.state !== 'loaded') continue;
      const ev = entry.manifest && entry.manifest.activationEvents;
      if (Array.isArray(ev) && ev.includes(trigger)) {
        try {
          await this.activate(entry.id);
        } catch (e) {
          console.error(`[plugin] 触发激活失败 ${entry.id}: ${e.message}`);
        }
      }
    }
  }

  /**
   * 激活全部已加载插件（按 manifest.dependsOn 依赖拓扑排序：提供者先激活；
   * 声明延迟激活（activationEvents 仅含 onCommand/onView/onPanel/onEditor）的插件跳过，按触发点懒激活）
   */
  async activateAll() {
    const entries = Array.from(this._registry.values()).map((e) => ({
      id: e.id,
      manifest: e.manifest,
    }));
    const { ordered, cycles } = resolveActivationOrder(entries);
    for (const id of cycles) {
      console.warn(`[plugin] 依赖循环或缺失，按原顺序激活: ${id}`);
    }
    for (const id of ordered) {
      const entry = this._registry.get(id);
      if (entry && this._isLazy(entry)) continue; // 延迟激活插件启动不激活
      try {
        await this.activate(id);
      } catch (e) {
        // 错误隔离：单插件激活失败不影响其他
        console.error(`[plugin] 跳过 ${id}: ${e.message}`);
      }
    }
    return this.list();
  }

  /** 停用激活 */
  async deactivate(id) {
    const entry = this._registry.get(id);
    if (!entry || entry.state !== 'activated') return;
    if (typeof entry.plugin.deactivate === 'function') {
      await entry.plugin.deactivate();
    }
    entry.state = 'deactivated';
  }

  /** 停用全部 */
  async deactivateAll() {
    for (const id of this._registry.keys()) {
      try {
        await this.deactivate(id);
      } catch (e) {
        console.error(`[plugin] 停用失败 ${id}: ${e.message}`);
      }
    }
  }

  /** 销毁插件 */
  async dispose(id) {
    const entry = this._registry.get(id);
    if (!entry) return;
    if (typeof entry.plugin.dispose === 'function') {
      await entry.plugin.dispose();
    }
    // 清理该插件注册的扩展点
    if (this.extensionRegistry) {
      this.extensionRegistry.unregisterByPlugin(id);
    }
    this.releaseUiWorldId(id);
    this._registry.delete(id);
  }

  /** 销毁全部 */
  async disposeAll() {
    for (const id of Array.from(this._registry.keys())) {
      try {
        await this.dispose(id);
      } catch (e) {
        console.error(`[plugin] 销毁失败 ${id}: ${e.message}`);
      }
    }
  }

  /** 列出插件 */
  list() {
    return Array.from(this._registry.entries()).map(([id, e]) => ({
      id,
      name: e.manifest.name || id,
      version: e.manifest.version,
      state: e.state,
      enabled: !!e.enabled,
      manifest: e.manifest,
    }));
  }

  /**
   * 列出插件（策展形状，供管理面板 UI 使用）
   * 只暴露插件声明的元信息与权限/配置 schema，不透传 main 入口等内部字段。
   */
  listForUi() {
    return Array.from(this._registry.values()).map((e) => {
      const m = e.manifest || {};
      return {
        id: e.id,
        name: m.name || e.id,
        version: m.version || '',
        description: m.description || '',
        author: m.author || '',
        state: e.state,
        enabled: !!e.enabled,
        dependsOn: m.dependsOn || [],
        permissions: m.permissions || {},
        contributes: m.contributes || {},
        config: m.config || {},
      };
    });
  }

  /** 获取插件实例 */
  get(id) {
    const e = this._registry.get(id);
    return e ? e.plugin : null;
  }

  /**
   * 获取插件服务 api（插件间通信：消费者按服务 ID 取提供者的 api）
   * @param {string} serviceId — 服务 ID（如 'demo.status-service'）
   * @returns {object|null} 服务的 api 对象；不存在/未注入注册表返回 null
   */
  getService(serviceId) {
    if (!this.extensionRegistry) return null;
    const svc = this.extensionRegistry.getService(serviceId);
    return svc ? svc.api : null;
  }

  /** 列出宿主内全部插件服务（元信息，不含 api） */
  listServices() {
    if (!this.extensionRegistry) return [];
    return this.extensionRegistry.listServices();
  }

  // ── 渲染端 UI（mountEl / isolated world） ──

  /**
   * 分配/复用插件渲染端 isolated worldId（Host 统一管理，插件不得自行指定）
   * @param {string} pluginId
   * @returns {number} worldId（1000+）
   */
  getUiWorldId(pluginId) {
    if (this._uiWorldIds.has(pluginId)) return this._uiWorldIds.get(pluginId);
    const worldId = 1000 + this._uiWorldCounter++;
    this._uiWorldIds.set(pluginId, worldId);
    return worldId;
  }

  /** 释放插件渲染端 worldId（禁用/销毁时） */
  releaseUiWorldId(pluginId) {
    this._uiWorldIds.delete(pluginId);
  }

  /**
   * 读取插件渲染端入口（manifest.ui）源码，供渲染进程 isolated world 加载
   * @param {string} pluginId
   * @returns {{ source: string, worldId: number }}
   */
  getUiModule(pluginId) {
    const entry = this._registry.get(pluginId);
    if (!entry) throw new Error(`插件未加载: ${pluginId}`);
    const ui = entry.manifest && entry.manifest.ui;
    if (!ui) throw new Error(`插件未声明 ui: ${pluginId}`);
    const target = path.resolve(entry.dir, ui);
    const base = path.resolve(entry.dir);
    if (!target.startsWith(base + path.sep)) {
      throw new Error(`ui 路径越界: ${ui}`);
    }
    if (!fs.existsSync(target)) {
      throw new Error(`ui 入口不存在: ${ui}`);
    }
    return { source: fs.readFileSync(target, 'utf8'), worldId: this.getUiWorldId(pluginId) };
  }

  /**
   * 渲染端插件 UI 的 ctx 能力代理（renderer → main）。
   * 复用插件主进程既有 context（ctx.lo facade 权限裁决），不新增能力映射。
   * @param {object} payload
   * @param {string} payload.pluginId
   * @param {'lo'|'config'|'executeCommand'} payload.target
   * @param {string} payload.method
   * @param {string} [payload.ns] — target='lo' 时的命名空间（operations/relations/events/resources/health）
   * @param {unknown[]} [payload.args]
   */
  async invokePluginUiCtx({ pluginId, target, ns, method, args = [] }) {
    const entry = this._registry.get(pluginId);
    if (!entry) throw new Error(`插件未加载: ${pluginId}`);
    if (entry.state !== 'activated') throw new Error(`插件未激活: ${pluginId}`);
    const ctx = entry.plugin.context;
    if (target === 'lo') {
      const ALLOWED_NS = ['operations', 'relations', 'events', 'resources', 'health'];
      if (!ALLOWED_NS.includes(ns)) throw new Error(`未知 lo 命名空间: ${ns}`);
      const lo = ctx && ctx.lo;
      const fn = lo && lo[ns] && lo[ns][method];
      if (typeof fn !== 'function') throw new Error(`ctx.lo.${ns}.${method} 不存在`);
      return fn(...args);
    }
    if (target === 'config') {
      if (method !== 'config') throw new Error(`未知 config 方法: ${method}`);
      return ctx.config(...args);
    }
    if (target === 'executeCommand') {
      if (method !== 'execute') throw new Error(`未知 executeCommand 方法: ${method}`);
      const [commandId, cmdArgs] = args;
      return this.executeCommand(commandId, Array.isArray(cmdArgs) ? cmdArgs : []);
    }
    throw new Error(`未知 ctx target: ${target}`);
  }

  /**
   * 构造插件 Context —— 用 SDK AgentPluginContext 实例化
   *
   * 注入：
   *   - loImpl（ctx.lo 实现，Host Adapter）→ LoCoreService → @lo/client
   *   - extensionsImpl（ctx.extensions 实现）→ ExtensionRegistry.registerCommands
   *   - permissions（resolvePermissions 输出）→ ctx.lo 白名单过滤（最小权限）
   *   - configValues（manifest.config 默认值 + plugin-config.json 用户配置）
   *   - settingsImpl（ctx.settings 实现）→ PluginStore 沙箱
   *   - logger
   *
   * SDK 定义契约；Host 提供实现。
   */
  _createContext(entry) {
    // 合并默认值与用户持久化配置
    const configValues = { ...this._defaultConfigValues(entry) };
    if (this.pluginStore) {
      Object.assign(configValues, this.pluginStore.getPluginConfig(entry.id));
    }
    return new AgentPluginContext({
      pluginId: entry.id,
      loImpl: createLoImpl(this.loCore),
      extensionsImpl: {
        registerCommands: (defs) => this._registerCommands(entry.id, defs),
        registerView: (defs) => this._registerViews(entry.id, defs),
        registerPanel: (def) => this._registerPanels(entry.id, def ? [def] : []),
        registerEditor: (def) => this._registerEditors(entry.id, def ? [def] : []),
        registerService: (defs) => this._registerServices(entry.id, defs),
        getService: (id) => this.getService(id),
        listServices: () => this.listServices(),
      },
      permissions: resolvePermissions(entry.manifest.permissions),
      logger: fromHost(this.logger).child({ plugin: entry.id }),
      configValues,
      settings: this._createSettingsImpl(entry.id),
    });
  }

  /** 从 manifest.config schema 提取默认值 */
  _defaultConfigValues(entry) {
    const schema = entry.manifest.config || {};
    const values = {};
    for (const [k, def] of Object.entries(schema)) {
      values[k] = def && def.default !== undefined ? def.default : undefined;
    }
    return values;
  }

  /** 构造 ctx.settings 沙箱实现（经 PluginStore，仅插件私有文件） */
  _createSettingsImpl(pluginId) {
    const store = this.pluginStore;
    return {
      async get(key, defaultValue) {
        if (!store) return defaultValue;
        const data = store.getPluginSettings(pluginId);
        return key === undefined ? data : data[key] !== undefined ? data[key] : defaultValue;
      },
      async set(key, value) {
        if (!store) throw new Error(`[plugin] settings 不可用：pluginStore 未注入 (${pluginId})`);
        store.setPluginSetting(pluginId, key, value);
        return value;
      },
    };
  }

  // ── 生命周期：enable / disable ──

  /** 启用插件（调用 plugin.enable；若未激活先激活） */
  async enable(id) {
    const entry = this._registry.get(id);
    if (!entry) throw new Error(`插件未加载: ${id}`);
    if (entry.state !== 'activated') {
      await this.activate(id);
    }
    if (typeof entry.plugin.enable === 'function') {
      await entry.plugin.enable();
    }
    entry.enabled = true;
    return this.list().find((x) => x.id === id);
  }

  /** 禁用插件（调用 plugin.disable，并完全禁用：清理扩展点 + 停用） */
  async disable(id) {
    const entry = this._registry.get(id);
    if (!entry) return;
    if (typeof entry.plugin.disable === 'function') {
      await entry.plugin.disable();
    }
    entry.enabled = false;
    // 完全禁用：命令/视图从注册表移除；再次 enable 时 activate 重新注册
    if (this.extensionRegistry) {
      this.extensionRegistry.unregisterByPlugin(id);
    }
    this.releaseUiWorldId(id);
    if (entry.state === 'activated') {
      if (typeof entry.plugin.deactivate === 'function') {
        await entry.plugin.deactivate();
      }
      entry.state = 'deactivated';
    }
    return this.list().find((x) => x.id === id);
  }

  // ── 配置管理（plugin-config.json） ──

  /** 读取插件配置值对象 */
  getConfig(id) {
    if (!this.pluginStore) throw new Error('pluginStore 未注入');
    return this.pluginStore.getPluginConfig(id);
  }

  /** 设置插件单条配置并落盘 */
  setConfig(id, key, value) {
    if (!this.pluginStore) throw new Error('pluginStore 未注入');
    return this.pluginStore.setPluginConfig(id, key, value);
  }

  // ── 设置管理（plugin-settings/<id>.json） ──

  /** 读取插件私有设置 */
  getSettings(id) {
    if (!this.pluginStore) throw new Error('pluginStore 未注入');
    return this.pluginStore.getPluginSettings(id);
  }

  /** 设置插件私有设置并落盘 */
  setSettings(id, key, value) {
    if (!this.pluginStore) throw new Error('pluginStore 未注入');
    return this.pluginStore.setPluginSetting(id, key, value);
  }

  // ── 安装 ──

  /** 从分发仓库安装插件（下载 → 校验 → 解压 → 加载） */
  async install(id, registryUrl, options = {}) {
    const result = await this.installer.install(id, registryUrl, options);
    // 加载已安装插件并注册
    const loaded = this.loader.load(result.dir);
    if (loaded.id !== id) {
      throw new Error(`插件包 id 不匹配: 期望 ${id}，实际 ${loaded.id}`);
    }
    this._registry.set(id, { id, plugin: loaded.plugin, manifest: loaded.manifest, dir: result.dir, state: 'loaded' });
    return { id, version: result.version, dir: result.dir, state: 'loaded' };
  }

  // ── 卸载 ──

  /** 卸载插件（deactivate + dispose + 删除目录 + 清理配置/设置/扩展点） */
  async uninstall(id) {
    const entry = this._registry.get(id);
    await this.deactivate(id);
    await this.dispose(id);
    if (entry && entry.dir) {
      this.loader.remove(entry.dir);
    }
    if (this.pluginStore) this.pluginStore.clearPlugin(id);
    return { ok: true, id };
  }

  /**
   * 将插件的命令注册到 ExtensionRegistry
   * @param {string} pluginId
   * @param {Array} defs — [{ id, title?, handler }]
   */
  _registerCommands(pluginId, defs) {
    if (!this.extensionRegistry) {
      throw new Error(`[plugin] 命令注册失败：extensionRegistry 未注入 (${pluginId})`);
    }
    return this.extensionRegistry.registerCommands(pluginId, defs);
  }

  /**
   * 将插件的视图注册到 ExtensionRegistry
   * @param {string} pluginId
   * @param {Array} defs — [{ id, title?, type?, render }]
   */
  _registerViews(pluginId, defs) {
    if (!this.extensionRegistry) {
      throw new Error(`[plugin] 视图注册失败：extensionRegistry 未注入 (${pluginId})`);
    }
    return this.extensionRegistry.registerViews(pluginId, defs);
  }

  /**
   * 将插件的服务注册到 ExtensionRegistry（供其他插件消费）
   * @param {string} pluginId
   * @param {Array} defs — [{ id, title?, version?, api }]
   */
  _registerServices(pluginId, defs) {
    if (!this.extensionRegistry) {
      throw new Error(`[plugin] 服务注册失败：extensionRegistry 未注入 (${pluginId})`);
    }
    return this.extensionRegistry.registerServices(pluginId, defs);
  }

  /**
   * 将插件的面板注册到 ExtensionRegistry（供渲染进程按 area 挂载）
   * @param {string} pluginId
   * @param {Array} defs — [{ id, title?, area?, render }]
   */
  _registerPanels(pluginId, defs) {
    if (!this.extensionRegistry) {
      throw new Error(`[plugin] 面板注册失败：extensionRegistry 未注入 (${pluginId})`);
    }
    return this.extensionRegistry.registerPanels(pluginId, defs);
  }

  /**
   * 将插件的编辑器注册到 ExtensionRegistry（供渲染进程按 resourceType 挂载）
   * @param {string} pluginId
   * @param {Array} defs — [{ id, title?, resourceType?, render }]
   */
  _registerEditors(pluginId, defs) {
    if (!this.extensionRegistry) {
      throw new Error(`[plugin] 编辑器注册失败：extensionRegistry 未注入 (${pluginId})`);
    }
    return this.extensionRegistry.registerEditors(pluginId, defs);
  }

  /**
   * 查找能力；缺失时按触发点懒激活匹配插件后重试（延迟激活支持）
   * @param {(id: string) => object|null} getter
   * @param {'onCommand'|'onView'|'onPanel'|'onEditor'} prefix
   * @param {string} id
   */
  async _findOrTrigger(getter, prefix, id) {
    let item = getter(id);
    if (!item) {
      await this._activateForTrigger(prefix, id);
      item = getter(id);
    }
    return item;
  }

  /** 渲染插件面板（同视图渲染快照模型：render 返回 HTML，经 IPC 交付渲染进程） */
  async renderPanel(panelId, context = {}) {
    if (!this.extensionRegistry) {
      throw new Error('extensionRegistry 未注入，无法渲染面板');
    }
    const panel = await this._findOrTrigger(
      (x) => this.extensionRegistry.getPanel(x),
      'onPanel',
      panelId,
    );
    if (!panel) {
      throw new Error(`面板不存在: ${panelId}`);
    }
    const entry = this._registry.get(panel.pluginId);
    if (!entry) {
      throw new Error(`插件未加载: ${panel.pluginId}`);
    }
    if (entry.state !== 'activated') {
      throw new Error(`插件未激活: ${panel.pluginId}`);
    }
    const html = await panel.render(context || {}, entry.plugin.context);
    return { pluginId: panel.pluginId, panelId, title: panel.title, area: panel.area, html };
  }

  /** 渲染插件编辑器（同视图渲染快照模型：render 返回 HTML，经 IPC 交付渲染进程） */
  async renderEditor(editorId, context = {}) {
    if (!this.extensionRegistry) {
      throw new Error('extensionRegistry 未注入，无法渲染编辑器');
    }
    const editor = await this._findOrTrigger(
      (x) => this.extensionRegistry.getEditor(x),
      'onEditor',
      editorId,
    );
    if (!editor) {
      throw new Error(`编辑器不存在: ${editorId}`);
    }
    const entry = this._registry.get(editor.pluginId);
    if (!entry) {
      throw new Error(`插件未加载: ${editor.pluginId}`);
    }
    if (entry.state !== 'activated') {
      throw new Error(`插件未激活: ${editor.pluginId}`);
    }
    const html = await editor.render(context || {}, entry.plugin.context);
    return {
      pluginId: editor.pluginId,
      editorId,
      title: editor.title,
      resourceType: editor.resourceType,
      html,
    };
  }

  /**
   * 渲染插件视图（UI 挂载层：render 返回 HTML 字符串，经白名单 IPC 交付渲染进程）
   * @param {string} viewId — 视图 ID（如 'demo.status'）
   * @param {object} [context] — 传给 render 的上下文（如 { rid }）
   * @returns {Promise<{ pluginId, viewId, title, type, html }>}
   */
  async renderView(viewId, context = {}) {
    if (!this.extensionRegistry) {
      throw new Error('extensionRegistry 未注入，无法渲染视图');
    }
    const view = await this._findOrTrigger(
      (x) => this.extensionRegistry.getView(x),
      'onView',
      viewId,
    );
    if (!view) {
      throw new Error(`视图不存在: ${viewId}`);
    }
    const entry = this._registry.get(view.pluginId);
    if (!entry) {
      throw new Error(`插件未加载: ${view.pluginId}`);
    }
    if (entry.state !== 'activated') {
      throw new Error(`插件未激活: ${view.pluginId}`);
    }
    const html = await view.render(context || {}, entry.plugin.context);
    return { pluginId: view.pluginId, viewId, title: view.title, type: view.type, html };
  }

  /**
   * 执行插件命令（命令执行 Runtime）
   * @param {string} commandId — 命令 ID（如 'demo-hello.hello'）
   * @param {Array} [args] — 传给 handler 的参数数组
   * @returns {Promise<{ pluginId: string, commandId: string, result: any }>}
   */
  async executeCommand(commandId, args = []) {
    if (!this.extensionRegistry) {
      throw new Error('extensionRegistry 未注入，无法执行命令');
    }
    const cmd = await this._findOrTrigger(
      (x) => this.extensionRegistry.getCommand(x),
      'onCommand',
      commandId,
    );
    if (!cmd) {
      throw new Error(`命令不存在: ${commandId}`);
    }
    const entry = this._registry.get(cmd.pluginId);
    if (!entry) {
      throw new Error(`插件未加载: ${cmd.pluginId}`);
    }
    if (entry.state !== 'activated') {
      throw new Error(`插件未激活: ${cmd.pluginId}`);
    }
    const result = await cmd.handler(args, entry.plugin.context);
    return { pluginId: cmd.pluginId, commandId, result };
  }
}

module.exports = { PluginManager };
