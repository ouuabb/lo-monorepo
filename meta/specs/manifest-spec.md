# Manifest Specification — lo-agent 插件 Manifest 规范

> 状态：v0.1 · 正式规范（独立文档，不依赖实现）
> 上游基准：012 §1（插件运行时架构草案）·013 §6.3（Manifest 独立规范判定）
> 对应实现：`@lo/agent-plugins-sdk` 的 `manifestSchema` / `validateManifest` / `loadPlugin`
> 契约声明：本文件是插件 ↔ 宿主（lo-agent）的稳定契约；与实现冲突时以真实代码为准并回报。

---

## 0. 概述

`plugin.json`（**manifest**）是每个 lo-agent 客户端插件的入口契约文件。宿主在安装 /
加载 / 激活插件时读取并校验它。

- manifest 是**纯数据**：不包含 handler、render、api 等运行时函数（运行时能力经
  `ctx.extensions` 注册，见 §4.4）。
- 插件必须提供 `plugin.json`，位于插件目录根下；`main` 指向的入口 require
  `@lo/agent-plugins-sdk`。
- 校验入口：`validateManifest(manifest)`（SDK 导出）；机器可读 schema：
  `manifestSchema`（SDK 导出）。

## 1. 必填字段

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | string | 插件唯一 ID。kebab-case：`^[a-z][a-z0-9-]*$`（小写字母/数字/中划线） |
| `name` | string | 插件显示名 |
| `version` | string | 语义化版本：`^\d+\.\d+\.\d+$` |
| `main` | string | 插件入口文件（相对插件目录，如 `index.cjs` / `src/index.cjs`） |

缺任一必填字段即校验不通过。

## 2. 可选元信息

| 字段 | 类型 | 说明 |
|---|---|---|
| `description` | string | 插件说明 |
| `author` | string | 作者 |
| `agentVersion` | string | 兼容的 lo-agent 版本约束 |
| `engines` | object | 环境约束 |
| `engines.agent` | string | lo-agent 版本约束（如 `>=0.1.0`） |
| `engines.core` | string | lo Core 版本约束（如 `>=0.1.0`） |

### 2.1 渲染端入口（ui）

```json
"ui": "ui/index.mjs"
```

| 规则 | 说明 |
|---|---|
| 类型 | string，相对插件目录的渲染端入口文件 |
| 形态 | **单文件自包含 ESM（.mjs）**，不 import 任何包；宿主在渲染进程 isolated world 中加载 |
| 契约 | 模块导出 `{ views?, panels?, editors? }`，`id → { render(mountEl, ctx) }`（见 §9） |
| 无 `ui` 插件 | 走 HTML 快照渲染（`ctx.extensions.registerView` 的 render 返回 HTML 字符串） |
| 有 `ui` 插件 | 走 mountEl 渲染：`render(mountEl, ctx)` 在渲染进程挂载真实 DOM |

`ui` 是**渲染端 UI** 声明，与主进程入口 `main` 相互独立：插件逻辑仍跑在主进程
（`main` + `ctx.lo`），`ui` 仅提供交互界面。

## 3. 依赖（dependsOn）

```json
"dependsOn": ["demo-hello"]
```

| 规则 | 说明 |
|---|---|
| 类型 | string 数组，元素为其他插件的 `id`（kebab-case） |
| 语义 | 依赖提供者必须在消费者之前激活（宿主按依赖拓扑排序） |
| 禁止 | 依赖自身（校验报错）；元素非 kebab-case（校验报错） |
| 忽略 | 依赖不存在的插件（排序层忽略，不报错） |

消费者对 `ctx.extensions.getService(id)` 返回值仍需判空：提供者可能未激活 / 被停用。

## 3.1 延迟激活（activationEvents）

```json
"activationEvents": ["onCommand:demo-hello.hello", "onView:demo-hello.status"]
```

| 规则 | 说明 |
|---|---|
| 类型 | string 数组，元素为触发点 |
| 触发点 | `onStartup` / `*`（启动激活）、`onCommand:<id>` / `onView:<id>` / `onPanel:<id>` / `onEditor:<id>`（按需延迟激活） |
| 语义 | 无 `activationEvents` 或含 `onStartup`/`*` → 启动时激活；仅含 `onCommand`/`onView`/`onPanel`/`onEditor` → **延迟激活**：宿主在首次执行对应命令 / 渲染对应视图时才激活 |
| 禁止 | 非法触发点（如 `onService:<id>`）校验报错 |

- 延迟激活的插件在激活前，其命令/视图等扩展点未注册；宿主在能力调用缺失时按触发点激活后重试。
- `manifest.dependsOn` 声明的硬依赖会在依赖方激活时强制先激活（即使被依赖方声明了延迟激活）。
- 服务（services）不参与延迟激活触发：服务提供方应保持启动激活或依赖 `dependsOn` 强制。

## 4. contributes —— 扩展点声明

`contributes` 是**纯数据声明**，供宿主发现/展示；实际 handler / render / api 在激活期
经 `ctx.extensions` 动态注册（`registerCommands` / `registerView` / `registerPanel` /
`registerEditor` / `registerService`）。

允许类型（`manifestSchema.contributesTypes`）：

| 类型 | 声明条目 | 运行时注册 | 说明 |
|---|---|---|---|
| `commands` | `{ id, title? }` | `ctx.extensions.registerCommands([...])` | 命令面板 / 菜单 |
| `views` | `{ id, title?, type? }` | `ctx.extensions.registerView([...])` | 视图面板（type: panel/sidebar/editor） |
| `panels` | `{ id, title? }` | `ctx.extensions.registerPanel(...)` | 侧边栏/底部面板 |
| `editors` | `{ id, title?, resourceType? }` | `ctx.extensions.registerEditor(...)` | 自定义编辑器 |
| `services` | `{ id, title? }` | `ctx.extensions.registerService([...])` | 插件间服务（消费方经 `getService`） |

包含未知类型（如 `"foo": []`）即校验报错。

### 4.1 服务消费契约

- 提供者：`ctx.extensions.registerService([{ id, title?, version?, api }])`；
  `api` 为普通对象，其方法被其他插件当接口调用。
- 消费者：`ctx.extensions.getService(id)` 返回 `api`（服务不存在 / 提供者未激活返回
  `null`）；`ctx.extensions.listServices()` 返回元信息（**不含 `api`**）。
- 提供者停用 / 禁用时服务从注册表清理，消费者随后 `getService` 得 `null`。

## 5. permissions —— 权限声明（最小权限）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `permissions.lo` | string 数组 | 只读能力集 | 允许的 Core 能力白名单（`ctx.lo` 按此过滤，未授权调用抛错） |
| `permissions.storage` | boolean | `false` | 是否可访问插件私有存储目录 |
| `permissions.network` | boolean | `false` | 是否可发起网络请求 |
| `permissions.shell` | boolean | `false` | 是否可执行外部命令 |

`permissions.lo` 允许值（`manifestSchema.permissionsLoValues`）：

```
operations.read   operations.write
relations.read    relations.write
events.read
resources.read    resources.write
health.read
```

规则：

- 未声明 permissions → 默认只读（四个 `.read` + `events.read` + `health.read`），
  无存储 / 网络 / shell。
- 写操作（`operations.write` / `relations.write` / `resources.write` 等）必须显式声明。
- 未知能力名（如 `"foo.write"`）即校验报错。
- 权限在激活期由宿主经 `resolvePermissions(manifest.permissions)` 解析并注入 `ctx.lo`。

## 6. config —— 配置 schema

```json
"config": {
  "greeting": {
    "type": "string",
    "default": "Hello from demo plugin",
    "description": "插件问候语"
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `config` | object | 插件配置 schema |
| `config.<key>` | object | 单条配置 |
| `config.<key>.type` | `string`/`number`/`boolean` | 值类型 |
| `config.<key>.default` | 任意 | 默认值 |
| `config.<key>.description` | string | 说明 |

- 激活期注入 `ctx.config`（manifest 默认值 + `plugin-config.json` 用户配置合并）。

## 7. 完整示例

### 7.1 提供者插件（demo-hello）

```json
{
  "id": "demo-hello",
  "name": "Demo Hello",
  "version": "0.1.0",
  "description": "最小 Demo 插件：加载后调用 Host 能力获取仓库状态，并声明扩展点",
  "author": "lo",
  "main": "index.cjs",
  "permissions": {
    "lo": ["health.read", "operations.write"],
    "storage": false,
    "network": false,
    "shell": false
  },
  "config": {
    "greeting": {
      "type": "string",
      "default": "Hello from demo plugin",
      "description": "插件问候语"
    }
  },
  "contributes": {
    "commands": [{ "id": "demo-hello.hello", "title": "Demo: Hello" }],
    "views": [{ "id": "demo-hello.status", "title": "Demo: 状态", "type": "panel" }],
    "panels": [{ "id": "demo-hello.side", "title": "Demo: 侧栏" }],
    "services": [{ "id": "demo-hello.status-service", "title": "Demo: 状态服务" }]
  }
}
```

### 7.2 消费者插件（demo-consumer）

```json
{
  "id": "demo-consumer",
  "name": "Demo Consumer",
  "version": "0.1.0",
  "description": "服务消费方验证：经 ctx.extensions.getService 消费 demo-hello 的状态服务",
  "author": "lo",
  "main": "index.cjs",
  "dependsOn": ["demo-hello"],
  "permissions": {
    "lo": [],
    "storage": false,
    "network": false,
    "shell": false
  },
  "contributes": {
    "commands": [{ "id": "demo-consumer.consume", "title": "Demo: 消费状态服务" }]
  }
}
```

## 8. 校验与工具入口

| 入口 | 属于 | 说明 |
|---|---|---|
| `validateManifest(manifest)` | SDK | 完整校验（必填字段 + 各字段规则），返回 `{ ok, manifest?, errors? }` |
| `manifestSchema` | SDK | manifest 规范的机器可读描述（字段/类型/允许值，与校验器同源） |
| `createPlugin(ModuleClass)` | SDK | 实例化并校验插件类 |

SDK 版本兼容：`engineVersion` / `@lo/client` peer 依赖由宿主注入，manifest 本身口径见
本文件。

## 9. 渲染端入口（mountEl UI）

声明 `ui` 的插件在**渲染进程**提供交互 UI。渲染模型有两种，按是否声明 `ui` 选择：

| 模式 | 触发 | 渲染位置 | 能力 |
|---|---|---|---|
| HTML 快照 | 未声明 `ui` | 主进程 `render(context, ctx) → HTML 字符串` → 渲染进程承载 | 静态快照 |
| **mountEl** | 声明 `ui` | 渲染进程 `render(mountEl, ctx) → 真实 DOM` | 交互式 UI |

### 9.1 ui 模块契约

`ui` 指向**单文件自包含 ESM**，导出：

```js
export const views = {
  'demo-hello.status': {
    render: async (mountEl, ctx) => {
      const btn = document.createElement('button');
      btn.textContent = '获取状态';
      btn.addEventListener('click', async () => {
        const stats = await ctx.lo.health.stats();
        mountEl.append('资源: ' + stats.totalResources);
      });
      mountEl.appendChild(btn);
      return () => { mountEl.replaceChildren(); }; // 可选：清理函数
    },
  },
};
export const panels = {};
export const editors = {};
```

- 导出 `{ views?, panels?, editors? }`，`id` 与 `contributes` / 运行时注册的扩展点一致。
- `render(mountEl, ctx)`：`mountEl` 为宿主导入的 DOM 容器（共享 document），可返回
  清理函数（或 `{ dispose }`，支持 async）；宿主在关闭/停用时于同一 isolated world
  内调用，**不跨 world 持有函数引用**。
- `ctx` 为插件作用域能力入口：`{ pluginId, lo, config, executeCommand, notify }`；
  `ctx.lo` 与主进程插件契约一致（见 §4/§5），能力经 `agent-plugins:ctx` 通道代理到
  主进程插件的 `PluginContext.lo` facade（Phase B 权限裁决）。
- **安全模型（G2）**：ui 模块在 Electron **isolated world**（宿主分配 worldId）中执行，
  与 App 主 world 隔离——插件 UI **不可访问** `window.loAgent.loCore`、`window.loAgent`
  及任何 App/Host 内部对象；`ctx` 是唯一能力入口；主进程 facade 是权限最终裁决。
- **边界**：G2 只保证 **JS 执行上下文隔离**，不保证 DOM 内容隔离——插件 UI 与 App 共享
  同一 document，可读取页面 DOM。插件**不得**依赖远程模块（isolated world 拒绝远程
  `import()`）。
- **模块约束**：单文件、自包含、不 import 包；宿主以 `import(blob:)` 在 isolated world
  加载。