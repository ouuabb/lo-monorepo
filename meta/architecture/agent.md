# lo-agent 架构（apps/agent）

> 核对基线：见 `meta/setup/.baseline`。以当前代码为准；`@lo/client`、`@lo/agent-plugins-sdk`
> 为 `workspace:*` 依赖。

lo-agent 是 lo（lo Core）知识库的 **Electron 桌面端 + 客户端插件宿主**：经主进程
`LoCoreService` + `@lo/client` 连接 lo Core（HTTP/SSH），加载 `{userData}/plugins/` 下
客户端插件（命令/视图/面板/编辑器/服务 + mountEl UI）。

## 进程与目录

```
apps/agent/
├── src/main/            # 主进程（Node/Electron，CJS）
│   ├── index.cjs        # 入口：窗口 + 初始化 LoCoreService/插件系统 + 注册 IPC
│   ├── lo-core.cjs      # LoCoreService（封装 @lo/client，返回 { ok, ... } / { ok:false, error, message }）
│   ├── ipc.cjs          # lo-core:* 白名单通道
│   ├── config-store.cjs # userData/lo-agent.json 配置持久化
│   └── plugin/          # 客户端插件宿主
├── src/preload/index.cjs  # contextBridge 白名单 + pluginUi（isolated world 桥）
└── src/renderer/          # React 19 + Vite（App.jsx、plugin/pluginUi.js + PluginUiMount.jsx）
```

## 主进程 ↔ Core（LoCoreService）

`src/main/lo-core.cjs` 封装 `@lo/client`，方法返回可序列化结果（`_toError` 统一转
`{ ok:false, error:'api'|'http'|'unknown', ... }`）：

| 方法 | 底层 client 调用 |
|---|---|
| `configure` | `new LoClient(config)`；持久化 host/port/protocol/timeout |
| `login` | `client.login(params)`（SSH 挑战-应答） |
| `getStatus` | `client.health.stats()` |
| `listNotes` / `getNote` | `client.notes.list/get` |
| `updateNote` | `client.operations.execute('resource.update', { rid, updates })`（Operation 语义） |
| `getRelations` / `listOperations` / `undoOperation` | `client.relations.list` / `operations.list/undo` |
| `subscribeEvents` / `unsubscribeEvents` | `client.events.subscribe`（单例 SSE） |
| `logout` | 清 token + 移除持久化 privateKeyPath |

## IPC 白名单（renderer → main）

- `lo-core:*`（App 能力，`src/main/ipc.cjs`）+ `agent-plugins:*`（插件能力，
  `src/main/plugin/plugin-ipc.cjs`）+ `window:*`（窗口控制，`src/main/index.cjs`）。
- 通道逐一绑定主进程**具体方法**，不透传任意调用/实例。完整通道目录由
  `meta/scripts/docs-gen.cjs` 生成（`meta/api/ipc-channels.md`）。
- renderer 侧映射：`window.loAgent.loCore.*`、`window.loAgent.plugins.*`、
  `window.pluginUi.*`（isolated world 桥）。

## 插件宿主（src/main/plugin/）

- **PluginManager**（`plugin-manager.cjs`）：生命周期编排、dependsOn 拓扑激活、
  activationEvents 懒激活、worldId 分配（`getUiWorldId`）。
- **PluginLoader**（`plugin-loader.cjs`）：扫描/加载/校验（validateManifest → require main →
  createPlugin）。
- **LoAdapter**（`lo-adapter.cjs`）：`ctx.lo` 实现（权限 facade → @lo/client）。
- **ExtensionRegistry**（`extension-registry.cjs`）：commands/views/panels/editors/services
  注册、get、list，停用清理。
- **PluginInstaller**（`plugin-installer.cjs`）：fetch index.json → 下载 tar.gz → sha256 →
  解压 → 校验 manifest。
- **PluginStore**（`plugin-store.cjs`）：`plugin-config.json` + `plugin-settings/<id>.json`（沙箱）。
- **PluginIpc**（`plugin-ipc.cjs`）：`agent-plugins:*` 白名单通道。
- **ActivationOrder**（`activation-order.cjs`）：依赖拓扑排序（Kahn）。

### 插件能力

- **扩展点**：`ctx.extensions.registerCommands/View/Panel/Editor/Service` + `getService/listServices`。
- **服务**：`registerService` → 注册表；其他插件 `getService`（同步语义，提供者须已激活）。
- **mountEl UI**：`manifest.ui` 自包含 ESM，渲染进程 isolated world 执行；
  `ctx.lo → agent-plugins:ctx → 主进程 context.lo facade`（G2 安全模型，见
  `meta/design/adr-001-mountel-g2.md`）。

## 渲染进程（React）

- `src/renderer/src/main.jsx` → `App.jsx`；访问能力仅经 `window.loAgent`（preload）。
- 插件面板：命令 / 视图 / 面板 / 编辑器 / 插件管理（含服务清单）/ 安装。
- 应用内文档：`src/renderer/src/docs/`（DocViewer + content/*.md，用户向）。

## 边界

- 安全基线：`contextIsolation:true`、`nodeIntegration:false`、`sandbox:true`。
- IPC 白名单铁律见 `meta/AGENTS.md` §1.5b/§12.2；mountEl/G2 见 §12.3 与 `meta/design/adr-001-mountel-g2.md`。
- 依赖：`@lo/client`、`@lo/agent-plugins-sdk` 为 `workspace:*`。
