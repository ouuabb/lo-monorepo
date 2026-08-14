# 实现方式（架构）

> 文档基线：[`.baseline`](.baseline)。本文解释「代码怎么工作」，事实以代码为准。
> 进程模型：Electron 主进程 + preload + 渲染进程，`sandbox:true` + `contextIsolation:true`。

## 1. 进程与目录

```
src/
  main/            # 主进程（Node/Electron，CJS）
    index.cjs      # 入口：创建窗口、初始化 LoCoreService + 插件系统、注册 IPC
    lo-core.cjs    # LoCoreService：封装 @lo/client，方法返回 { ok, ... } / { ok:false, error, message }
    ipc.cjs        # lo-core:* 白名单通道（App ↔ Core）
    config-store.cjs # userData/lo-agent.json 配置持久化
    plugin/        # 客户端插件宿主
      plugin-manager.cjs     # 生命周期 + dependsOn 拓扑 + activationEvents 懒激活 + worldId 分配
      plugin-loader.cjs      # 扫描/加载/校验（validateManifest → require main → createPlugin）
      lo-adapter.cjs         # ctx.lo 实现（权限 facade → @lo/client）
      extension-registry.cjs # 扩展点注册表（commands/views/panels/editors/services）
      plugin-installer.cjs   # 安装（fetch index.json → 下载 → sha256 → 解压）
      plugin-store.cjs       # 插件配置 + 私有设置持久化
      plugin-ipc.cjs         # agent-plugins:* 白名单通道
      activation-order.cjs   # dependsOn 拓扑排序（Kahn）
  preload/index.cjs  # contextBridge 白名单 + pluginUi（isolated world 桥）
  renderer/          # React 19 + Vite
    src/App.jsx      # 主界面 + 插件面板（命令/视图/面板/编辑器/管理/服务）
    src/plugin/      # pluginUi.js + PluginUiMount.jsx（mountEl 挂载辅助）
    src/docs/        # 应用内用户文档查看器
```

## 2. 主进程 ↔ Core（LoCoreService）

`src/main/lo-core.cjs` 封装 `@lo/client`，方法返回可序列化结果（`_toError` 统一转
`{ ok:false, error:'api'|'http'|'unknown', ... }`）：

| 方法 | 底层 client 调用 |
|---|---|
| `configure` | `new LoClient(config)`；持久化 host/port/protocol/timeout |
| `login` | `client.login(params)`（SSH 挑战-应答；privateKeyPath 持久化） |
| `getStatus` | `client.health.stats()` |
| `listNotes` / `getNote` | `client.notes.list/get` |
| `updateNote` | `client.operations.execute('resource.update', { rid, updates })`（写路径收敛到 Operation 语义） |
| `getRelations` / `listOperations` / `undoOperation` | `client.relations.list` / `operations.list/undo` |
| `subscribeEvents` / `unsubscribeEvents` | `client.events.subscribe`（单例 SSE 订阅，登出关闭） |
| `logout` | 清 token + 移除持久化 privateKeyPath |

## 3. IPC 白名单（renderer → main）

- `src/main/ipc.cjs`：`lo-core:*`（App 能力）；`src/main/plugin/plugin-ipc.cjs`：
  `agent-plugins:*`（插件能力）；窗口控制 `window:*` 在 `src/main/index.cjs` 注册。
- 完整通道目录见 [`reference/ipc-channels.md`](reference/ipc-channels.md)（自动生成）。
- renderer 侧映射：
  - `window.loAgent.loCore.*` → `lo-core:*` invoke
  - `window.loAgent.plugins.*` → `agent-plugins:*` invoke（命令/视图/面板/编辑器/服务/管理/安装）
  - `window.pluginUi.*` → isolated world 桥（mount/render/dispose，非 IPC 通道）
  - 主进程 → 渲染进程推送：`lo-core:event`（SSE 事件）、`window:maximized-change`
- 每个通道 `ipcMain.handle` 绑定主进程**具体方法**，不透传任意调用/实例（见 boundary.md §1）。

## 4. 插件宿主

### 加载与激活
- `PluginLoader`（`plugin-loader.cjs`）：扫描 `{userData}/plugins/<id>/`，读 `plugin.json`
  → `validateManifest`（SDK）→ `require(main)`（CJS，NODE_PATH 指向 lo-agent node_modules）
  → `createPlugin`。声明 `ui` 时校验文件存在且不越界。
- `PluginManager.activateAll`（`plugin-manager.cjs`）：`resolveActivationOrder`（dependsOn 拓扑）
  → 跳过懒激活插件（activationEvents 仅含 onCommand/onView/onPanel/onEditor）；`activate(id)`
  内 `_ensureDepsActivated` 强制先激活硬依赖。
- 懒激活：`executeCommand/renderView/renderPanel/renderEditor` 能力缺失时
  `_activateForTrigger(prefix, id)` 按触发点激活后重试（`_findOrTrigger`）。

### ctx 注入（`_createContext`）
```
AgentPluginContext({
  loImpl: createLoImpl(loCore),          // lo-adapter.cjs → @lo/client
  extensionsImpl: { registerCommands/View/Panel/Editor/Service, getService, listServices },
  permissions: resolvePermissions(manifest.permissions),  // 最小权限
  configValues, settings, logger
})
```
`ctx.lo` 由 SDK `createLoFacade(loImpl, { permissions })` 包裹——权限过滤在**主进程**。

### 扩展点（extension-registry.cjs）
- `_commands` / `_views` / `_panels` / `_editors` / `_services`：注册、get、list；
  停用/禁用按 pluginId 清理。
- 渲染：视图/面板/编辑器支持两种模式——HTML 快照（主进程 render → 渲染进程承载）与
  mountEl UI（isolated world）。

### 插件服务（插件间通信）
`registerService` → 注册表；其他插件 `getService(id)` / `listServices()` 消费；
`getService` 为同步语义，提供者须已激活；提供者停用即清理。

### 安装 / 存储
- `PluginInstaller`（`plugin-installer.cjs`）：fetch index.json（http(s) 或本地路径）→ 下载
  tar.gz → 校验 sha256 → 解压 → 校验 manifest。
- `PluginStore`（`plugin-store.cjs`）：`plugin-config.json` + `plugin-settings/<id>.json`（沙箱）。

## 5. mountEl UI（isolated world）

- 插件 `manifest.ui`（自包含 ESM）在渲染进程 **isolated world** 执行（worldId 由
  `PluginManager.getUiWorldId` 分配，1000+，禁用/销毁释放）。
- preload `pluginUi` 桥：`mount`（`exposeInIsolatedWorld` 注入 `__loPluginBootstrap`/
  `__loPluginCtx` + `executeJavaScriptInIsolatedWorld` 引导 import(blob:)）、`render`/`dispose`
  （world 内执行，dispose 不跨 world 持函数引用，Blob URL import 后 revoke）。
- ctx 能力经 `agent-plugins:ctx` 代理到主进程插件既有 `context.lo`（同一 facade 裁决）。
- 渲染层 `src/renderer/src/plugin/pluginUi.js` + `PluginUiMount.jsx`：`hasUi` 判分支
  （声明 ui → mountEl；否则 HTML 快照回退），`openMount`/`closeMount` 管理挂载生命周期。

## 6. 渲染进程（React）

- 入口 `src/renderer/src/main.jsx` → `App.jsx`；访问能力仅经 `window.loAgent`（preload）。
- 插件面板：命令 / 视图 / 面板 / 编辑器 / 插件管理（含服务清单）/ 安装。
- 应用内文档：`src/renderer/src/docs/`（DocViewer + content/*.md，用户向，与本仓库 docs 独立）。

## 7. 测试与 CI

- Jest（`test/**/*.test.cjs`），`npm test` 含 `--experimental-vm-modules`（勿裸跑 npx jest）。
- CI：`.github/workflows/ci.yml`（ubuntu + windows × Node 20/22，yarn frozen-lockfile，
  检出同级 lo-client-sdk + lo-agent-plugins-sdk）。

## 8. 与生态的关系

- 契约：插件侧 SDK = `@lo/agent-plugins-sdk`（manifest-spec §9 mountEl、§3.1 activationEvents）。
- 插件源码/分发：`lo-agent-plugins` 仓库（本仓库 `plugins-demo/` 为其同步副本，供测试）。
- 客户端 SDK：`@lo/client`（lo-client-sdk），只经它访问 Core。
