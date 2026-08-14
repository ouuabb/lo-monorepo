# 012 · lo-agent Plugin Runtime Architecture

> 状态：v0.1 · 技术设计（不进入实现）
> 范围：lo-agent 作为插件宿主的 Runtime 架构
> 上游基准：006（生态边界）· 010（Core 协议）· 011（lo-agent 审计）· lo-agent-plugins-sdk 现状
> 参考：VS Code Extension Host 架构思想，结合 lo-agent 本地应用特点

---

## 0. 前提与命名

- 插件运行时命名沿用 006 已冻结的 **`@lo/agent-plugins-sdk`**（用户指令中的 `@lo/plugin-sdk` 视为同一物）。
- 本设计**基于已有 SDK**（AgentPlugin / AgentPluginContext / AgentEventEmitter / validateManifest / Logger 已存在），非从零设计。
- 约束：插件不能修改 lo Core；不能绕过 `@lo/client` 直接操作 Core；不把插件逻辑写入 lo-agent 主应用；不设计 Agent Runtime / Agent Plugin Runtime（先做通用 Plugin Runtime）。

---

## 1. Plugin Manifest 设计

基于现有 `validateManifest.cjs`（`id/name/version/main` 必填）扩展：

```json
{
  "id": "star-map",
  "name": "星图",
  "version": "0.1.0",
  "main": "src/index.cjs",

  "description": "星图可视化",
  "author": "lo",
  "engines": {
    "agent": ">=0.1.0",
    "core": ">=0.1.0"
  },

  "activationEvents": [
    "onView:star-map",
    "onCommand:star-map.open"
  ],

  "contributes": {
    "commands": [
      { "id": "star-map.open", "title": "打开星图" }
    ],
    "views": [
      { "id": "star-map.panel", "title": "星图面板", "type": "panel" }
    ],
    "panels": [],
    "editors": [],
    "services": []
  },

  "permissions": {
    "lo": ["notes.read", "relations.read", "operations.write"],
    "storage": true,
    "network": { "allow": ["https://api.starmap.example"] }
  },

  "config": {
    "maxNodes": { "type": "number", "default": 1000, "description": "最大节点数" }
  }
}
```

### 1.1 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | kebab-case 唯一标识 |
| `name` / `version` / `main` | ✅ | 基础元数据（SDK 已校验） |
| `engines` | 否 | 声明兼容的 agent/core 版本 |
| `activationEvents` | 否 | 延迟激活触发点（仿 VS Code `onXxx`） |
| `contributes` | 否 | 声明式扩展点注册（见 §7） |
| `permissions` | 否 | 权限声明（见 §8） |
| `config` | 否 | 配置 schema（key → type/default/description） |

---

## 2. 插件生命周期

基于现有 SDK 生命周期，明确宿主驱动语义：

```
installed → disabled → enabled → activated → running
                          ↕
                       disabled
     → uninstalled
```

### 2.1 状态转移（宿主 PluginManager 驱动）

| 状态 | 触发 | 动作 |
|---|---|---|
| `installed` | 安装完成 | 文件就位，未加载 |
| `enabled` | 用户启用 / 启动加载 | `PluginManager.enable()` → `plugin.enable()` |
| `activated` | 首次满足 activationEvents | `plugin.activate(ctx)` |
| `running` | activate 完成 | 插件正常工作 |
| `disabled` | 用户禁用 / 错误 | `plugin.disable()` + `plugin.deactivate()` |
| `uninstalled` | 卸载 | 清理文件 + 配置 + 存储 |

### 2.2 生命周期管理 API（宿主侧）

```
PluginManager.install(dir)      → 安装插件目录
PluginManager.enable(id)        → 启用（可能触发 activate）
PluginManager.activate(id)      → 激活（若未激活）
PluginManager.deactivate(id)    → 停用激活
PluginManager.disable(id)       → 禁用
PluginManager.uninstall(id)     → 卸载（删除文件+配置）
PluginManager.get(id) / list()  → 查询
```

---

## 3. PluginManager / PluginLoader / PluginRegistry 架构

参考 lo Core PluginManager 结构 + lo-agent 单进程特点：

```
src/renderer/plugin/           # 渲染进程（插件宿主，见 §9）
  PluginManager.cjs            # 生命周期编排 + 配置/存储协调
  PluginLoader.cjs             # 扫描/加载插件目录，require 入口
  PluginRegistry.cjs           # id → Plugin 实例注册表
  ExtensionRegistry.cjs        # contributes 扩展点收集
  PluginContextFactory.cjs     # 构造 AgentPluginContext（注入能力）
```

### 3.1 PluginLoader

- 扫描 `{userData}/plugins/`（或用户目录）下每个插件目录
- 读 `plugin.json` → 校验 manifest（复用 `validateManifest`）
- `require(main)` → 实例化 → 校验 `manifest()/activate()`（复用 `createPlugin`）

### 3.2 PluginRegistry

- `Map<id, { plugin, manifest, state }>`
- 提供 `get/list/has`

### 3.3 PluginManager

- 编排生命周期状态机（§2）
- 协调：加载 → 注册 → 激活 → 配置 → 存储
- 错误隔离：单插件激活失败不阻塞其他（仿 lo Core `_safelyCleanupPlugin`）

### 3.4 ExtensionRegistry

- 收集各插件 `contributes` 的扩展点（commands/views/panels/...）
- 供 lo-agent UI 层消费（如：向菜单注册命令、向面板区注册 view）

---

## 4. PluginContext API 设计

基于现有 `AgentPluginContext` 扩展，对齐 010 后 Core 协议：

```js
class AgentPluginContext {
  pluginId           // string
  logger             // Logger（带插件前缀）
  events             // AgentEventEmitter（<pluginId>.* 命名空间）
  config(key?, def?) // 插件配置
  settings           // 持久化设置读写 { get, set }

  // lo 能力门面（对齐 010 协议语义）
  lo = {
    operations: { execute(type, params, options), list, undo, ... },
    relations:  { list(rid), get(id), create, update, remove },
    events:     { subscribe(types, handler), history(query) },
    resources:  { list, get, search },      // 读面
    schemas:    { list, get, ... },
    views:      { list, get, ... },
    health:     { ping, stats }
  }

  // 扩展点注册（供插件注册 UI/命令）
  extensions = {
    registerCommands(defs),
    registerView(def),
    registerPanel(def),
    registerService(def)
  }
}
```

### 4.1 与现有 SDK 的差异（需对齐 010）

| 现有 SDK `ctx.lo` | 目标 |
|---|---|
| `notes/search/schemas/views/admin/...` | 收敛为 `operations/relations/events/resources`（协议语义） |
| `onEvent` noop | 替换为 `events.subscribe`（真实 SSE） |

> 注：SDK 上下文改造属实现阶段工作，本设计仅定义目标接口形态。

### 4.2 能力注入边界

- `ctx.lo.operations` / `relations` / `events` / `resources` = `@lo/client` 命名空间的**透传**（宿主注入）
- **不暴露**：`LoClient` 原始实例、HTTP 传输层、Core 内部对象
- 插件只能经 `ctx.lo` 访问 Core，禁止直接 require `@lo/client`

---

## 5. Plugin SDK 独立仓库设计

仓库：`lo-agent-plugins-sdk`（`@lo/agent-plugins-sdk`，已存在）

```
src/
  index.cjs              # 统一出口
  AgentPlugin.cjs         # 基类（已有）
  AgentPluginContext.cjs  # 上下文（需对齐 010，见 §4.1）
  AgentEventEmitter.cjs   # 事件总线（已有）
  Logger.cjs              # 日志（已有）
  validateManifest.cjs    # manifest 校验（已有，扩展 §1 字段）
  loadPlugin.cjs          # createPlugin（已有）
types/
  index.d.ts              # 类型声明
test/                     # 单测
docs/                     # SDK 文档
```

- **peerDependencies**: `@lo/client >=0.1.0`（宿主注入，可选）
- **零运行时依赖**
- 职责：定义插件契约，不包含插件运行时逻辑（运行时在 lo-agent 主应用内）

---

## 6. 插件与 lo-agent / @lo/client / lo Core 的调用边界

```
┌─ lo-agent 主应用 ─────────────────────────────────┐
│                                                    │
│  UI 层（React）                                    │
│    ▲  ExtensionRegistry 消费扩展点                 │
│    │                                               │
│  PluginManager ◄── 加载 ── PluginLoader            │
│    │                                               │
│    ▼ 构造 ctx                                     │
│  AgentPluginContext ── 注入 ── @lo/client 实例     │
│    ▲                                               │
│    │ 插件代码（node_modules/plugins/<id>）          │
└────┼───────────────────────────────────────────────┘
     ▼
  @lo/client ── HTTP ──► lo Core（唯一世界模型）
```

### 6.1 边界规则（硬性）

| 层 | 允许 | 禁止 |
|---|---|---|
| 插件 → Core | 经 `ctx.lo`（= @lo/client） | 直接 require `@lo/client` / 直接 HTTP |
| 插件 → lo-agent | 经 `ctx.extensions` / `ctx.events` / `ctx.config` | require lo-agent 内部文件 |
| 插件 ↔ 插件 | 经事件总线 / 共享 service | 直接 require 彼此文件 |
| 插件 → 文件系统 | 仅自己的插件目录 + `permissions.storage` | 任意路径访问 |

---

## 7. Extension Point 设计

插件通过 `contributes` 声明 + `ctx.extensions.register*` 动态注册：

### 7.1 命令（commands）
```js
ctx.extensions.registerCommands([
  { id: 'star-map.open', title: '打开星图', handler: () => {...} }
]);
```
→ 注册到 lo-agent 命令面板 / 菜单。

### 7.2 视图（views）
```js
ctx.extensions.registerView({
  id: 'star-map.panel',
  title: '星图',
  type: 'panel',        // panel | sidebar | editor
  render: (mountEl) => {...}   // 渲染回调
});
```
→ lo-agent 在对应区域挂载插件渲染的 DOM。

### 7.3 面板（panels）
- 类似 views，用于侧边栏/底部面板区域。

### 7.4 编辑器（editors）
- 自定义编辑器类型：插件可为特定资源类型提供编辑 UI（如 EPUB 阅读器）。

### 7.5 服务（services）
- 插件暴露可被其他插件调用的服务接口（经注册表发现，不直接 require）。

### 7.6 事件（events）
- 插件订阅/发布事件（`<pluginId>.*` 命名空间 + Core 领域事件经 `ctx.lo.events` 桥接）。

---

## 8. Plugin 权限模型

基于 manifest `permissions` + 运行时注入的受限能力：

```js
permissions: {
  lo: ["notes.read", "relations.read", "operations.write"],  // 允许的 @lo/client 能力
  storage: true,        // 是否可访问自己的存储目录
  network: { allow: [...] },  // 允许的外联域名
  shell: false          // 是否可执行外部命令（默认 false）
}
```

### 8.1 实现机制

- **能力代理**：`ctx.lo` 门面按 `permissions.lo` 白名单暴露命名空间方法（未授权方法抛错）。
- **存储沙箱**：`ctx.settings` 读写被限制在插件私有目录。
- **网络控制**：renderer 默认无 Node 网络能力（sandbox:true），网络请求必须经受限代理或禁用。
- **shell**：默认禁用；需显式授权（Phase 未来）。

### 8.2 权限模型原则

- 最小权限：插件默认只能读，写操作（operations.write）需显式声明。
- 与 Core 的 001 Execution Context 结合：插件经 `ctx.lo.operations.execute` 时，宿主填充 `actor=plugin:<id>`。

---

## 9. 插件 UI 扩展机制

### 9.1 进程模型（关键决策）

插件 UI 运行在**渲染进程**，且执行在 **Electron isolated world**（同 frame、共享 DOM、
与 App 主 world JS 隔离）：

```
渲染进程（sandbox: true + contextIsolation: true）
  ├─ 主 world：lo-agent UI（React）+ 插件挂载层（PluginMountLayer）
  ├─ isolated world（Host 分配 worldId）：插件 ui 模块（ESM 单文件）
  │     render(mountEl, ctx) 挂载真实 DOM（共享 document）
  └─ preload 受控桥（pluginUi）：mount / render / dispose 经
        webFrame.executeJavaScriptInIsolatedWorld 执行
```

- **不引入** WebView/iframe/自定义协议；插件 UI 直接挂载到 App 文档的 mount 节点。
- **访问隔离（G2）**：插件 ui 运行在独立 isolated world，**不可访问**
  `window.loAgent.loCore` / `window.loAgent` / App 内部对象；`ctx` 是唯一能力入口，
  权限由主进程插件 `ctx.lo` facade（Phase B）最终裁决。
- **边界**：G2 只保证 JS 执行上下文隔离，不保证 DOM 内容隔离（插件 UI 与 App 共享
  document）；插件 UI 拒绝远程 `import()`。
- `ctx.lo → agent-plugins:ctx → 主进程插件 context.lo（facade 裁决）→ @lo/client → lo Core`，
  链路与主进程插件一致，不新增能力/权限体系。
- worldId 由 Host 统一分配管理（plugin → worldId 生命周期映射，禁用/卸载释放）；
  插件不得自行指定。

### 9.2 渲染生命周期

```
activate → 收集 contributes.views
  → renderer 打开扩展点：get-ui-module（读 manifest.ui 源码 + worldId）
  → preload pluginUi.mount(worldId)：exposeInIsolatedWorld 注入 __loPluginCtx
      + executeJavaScriptInIsolatedWorld 引导（import(blob:) 加载 ESM 模块）
  → pluginUi.render：world 内执行 render(mountEl, ctx)，返回的 dispose 存于 world 内部
  → 插件卸载/关闭：pluginUi.dispose 在同一 world 内执行 dispose（不跨 world 持函数引用）
```

渲染模式：声明 `manifest.ui` 的插件走 mountEl UI；未声明的插件保留 **HTML 快照**
（主进程 `render(context, ctx) → string` → 渲染进程承载）作为兼容路径。

---

## 10. 插件存储与配置管理

### 10.1 存储位置

```
{userData}/
  plugins/                    # 已安装插件目录
    <plugin-id>/
      plugin.json
      src/
      ...
  plugin-config.json          # 各插件配置（key-value）
  plugin-settings/<plugin-id>/  # 插件私有存储（沙箱）
```

### 10.2 配置管理

- `manifest.config` 声明 schema
- `PluginManager.getConfig(id)` / `setConfig(id, key, value)`
- 持久化到 `plugin-config.json`
- 注入 `ctx.config`（合并默认值 + 用户配置）

### 10.3 设置存储

- `ctx.settings.get/set` → 读写插件私有目录
- 沙箱化：仅允许插件自己的目录

---

## 11. 插件仓库（registry）与发布机制预留

### 11.1 仓库形态（预留，参考 lo-plugins）

```
lo-agent-plugins/          # 独立插件仓库
  packages/<id>/
    plugin.json
    src/
  dist/
    <id>-<version>.tar.gz
    index.json             # 分发清单 { id, name, version, downloadUrl, checksum }
```

### 11.2 安装流程（预留）

```
PluginManager.install(id)
  → fetch index.json（registryUrl）
  → 下载 tar.gz → 校验 checksum
  → 解压到 {userData}/plugins/<id>/
  → 校验 plugin.json → 加载
```

### 11.3 发布机制

- 独立 CI 打包 tar.gz + index.json（复用 lo-plugins build 脚本模式）
- registryUrl 可配置（http(s)/本地路径）

---

## 12. 架构总结

```
lo-agent（宿主）
  ├─ PluginManager ── 生命周期 + 配置/存储
  ├─ PluginLoader ── 扫描/加载/校验
  ├─ PluginRegistry ── 实例注册表
  ├─ ExtensionRegistry ── 扩展点收集（commands/views/panels/editors/services）
  ├─ PluginContextFactory ── 构造 ctx（注入 @lo/client 门面 + 权限 + 配置）
  └─ UI 挂载层 ── 按 extends 渲染插件 UI

插件（@lo/agent-plugins-sdk）
  ├─ AgentPlugin 基类
  ├─ AgentPluginContext（ctx.lo / extensions / events / config / settings）
  └─ 经 ctx.lo ── @lo/client ── HTTP ── lo Core
```

---

## 13. 实施顺序（记录，不执行）

1. **SDK 对齐**：`AgentPluginContext.lo` 收敛到 operations/relations/events/resources（010 协议）
2. **宿主骨架**：PluginManager/Loader/Registry + ExtensionRegistry
3. **生命周期**：install/enable/activate/deactivate/disable/uninstall
4. **UI 挂载**：views/panels 渲染机制
5. **权限**：ctx.lo 白名单代理 + 存储沙箱
6. **配置/存储**：plugin-config + plugin-settings
7. **仓库**：lo-agent-plugins 独立仓库 + 安装流程
