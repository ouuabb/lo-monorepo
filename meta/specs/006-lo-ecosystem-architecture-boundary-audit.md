# 006 · lo Ecosystem Architecture Boundary Audit

> 状态：v0.1 · 边界审计（已确认）
> 范围：整个 lo 生态的分层与边界（六个仓库）
> 上游基准：001–005（已确定）
> 方法：以各仓库真实代码为准，不做设计、不提前决定 Agent Runtime / sandbox / 内置模块化

---

## 1. 六个仓库定位细化（已确认）

| # | 仓库 | 定位 | 关键说明 |
|---|---|---|---|
| 1 | `lo`（log） | **lo Core** | 世界模型 + 核心能力（Resource/Relation/Operation/Workflow），提供 HTTP 协议出口 |
| 2 | `lo-plugins` | **Core Plugin 仓库/分发仓库** | 存放插件源码、manifest、构建产物（tar.gz + index.json）。**本身不是运行环境**——运行仍发生在 lo Core 插件系统内 |
| 3 | `lo-plugins-sdk` | **Core Plugin 开发 SDK** | 定义 Core Plugin 与 Core 的契约，插件经它接入 Core PluginManager |
| 4 | `lo-agent` | **独立智能客户端** | Core 的一个客户端消费者，经 `@lo/client` 访问 Core |
| 5 | `lo-agent-plugins-sdk` | **客户端插件开发 SDK** | 服务对象是 lo-agent 插件开发者。**不等同于 `@lo/client`** |
| 6 | `lo-client-sdk` | **Core Client SDK** | 面向所有 Core 外部消费者；当前消费者是 lo-agent，未来可有 CLI / 其他客户端 / 自动化程序 |

**关键区分（必须保持）**：

- **`lo-client-sdk` = 通信能力层**：访问世界模型的协议客户端。
- **`lo-agent-plugins-sdk` = 客户端扩展契约层**：定义客户端插件怎么写。
- **两者不要合并**——一个是"如何访问 Core"，一个是"如何扩展 lo-agent"。

---

## 1b. 六个仓库

| # | 仓库 | npm 名 / 定位 | 运行位置 | 角色 |
|---|---|---|---|---|
| 1 | `lo`（log） | **lo Core** | 服务进程 | 世界模型 + 能力中心 |
| 2 | `lo-plugins` | Core Plugin 仓库 | —（分发 tar.gz） | 插件源码/分发 |
| 3 | `lo-plugins-sdk` | `@lo/plugins-sdk` | Core 进程内 require | Core 插件契约 |
| 4 | `lo-agent` | **lo-agent** | Electron 桌面端 | 智能客户端 |
| 5 | `lo-agent-plugins-sdk` | `@lo/agent-plugins-sdk` | lo-agent 内 | 客户端插件契约 |
| 6 | `lo-client-sdk` | `@lo/client` | 任意外部进程 | Core 协议客户端 |

```
                 lo Core (世界模型 / Resource / Relation / Operation / Workflow)
                    ▲
                    │ HTTP
             lo-client-sdk (@lo/client)
                    ▲
        ┌───────────┼────────────┐
        │                        │
   lo-agent              其他客户端(未来)
        │
        │
lo-agent-plugins-sdk
        │
        ▼
   Agent Plugin

lo Core
   │ 进程内 require
   ▼
lo-plugins-sdk
   │
   ▼
   Core Plugin
```

---

## 2. 各层职责（真实代码依据）

### 2.1 lo Core（`lo`）
- 世界模型唯一持有者：`repository.cjs` / `resourceService.cjs` / `relationService.cjs` /
  `schemaRegistry` / `viewRegistry` / workflow。
- 状态变化入口：`operationEngine.cjs`（`OperationEngine`）+ `operations/` 目录注册操作。
- 事件：`eventRegistry.cjs` / `eventBus.cjs`。
- 插件运行时：`pluginManager.cjs` 扫描 `{repo}/.repo/plugins/` 并 `require`（进程内）。
- HTTP 出口：`commands/serve.cjs`（104 路由）。

### 2.2 lo-plugins（Core Plugin 仓库）
- `packages/` 下每个插件子目录含 `plugin.json`（manifest）+ `src/`。
- `scripts/build.cjs` 打包 tar.gz + `index.json` 分发清单。
- 插件加载形态：Core `require` 插件入口（`pluginLoader.cjs`），进程内运行。

### 2.3 lo-plugins-sdk（`@lo/plugins-sdk`）
- 契约：`Plugin` 基类、`ResourceProvider`、`PluginContext`、`ResourceBuilder`、
  `RelationBuilder`、`EventApi`、`Logger`。
- 由 Core 的 PluginManager 在加载时注入真实 PluginContext（进程内能力）。
- **不依赖 lo Core 内部实现**，只定义契约。

### 2.4 lo-agent
- Electron 应用（main / preload / renderer）。
- 经 `@lo/client` 访问 Core（`lo-core.cjs` 持有 LoClient 实例）。
- **当前无本地数据、无插件 runtime、无 Agent Runtime**（见 005 审计）。
- 价值 = 交互层 + 客户端扩展宿主（未来）。

### 2.5 lo-agent-plugins-sdk（`@lo/agent-plugins-sdk`）
- 契约：`AgentPlugin` 基类、`AgentPluginContext`、`AgentEventEmitter`、
  `validateManifest`、`createPlugin`、`Logger`。
- 由 lo-agent 宿主注入 `@lo/client` + context。
- **尚未接入 lo-agent**（独立新仓库）。

### 2.6 lo-client-sdk（`@lo/client`）
- 纯 CJS、零依赖 HTTP 客户端，封装 `log serve` 协议。
- **不属于 lo-agent 专用**——是"lo Core 的客户端"，服务所有外部消费者。
- 定位：协议客户端，不拥有业务模型（见 003）。

---

## 3. 关键澄清：lo-client-sdk ≠ lo-agent-sdk

之前讨论中容易混淆的两者是**不同层**：

| | `lo-client-sdk` | `lo-agent-sdk`（即 agent 插件 SDK） |
|---|---|---|
| 全名 | `@lo/client` | `@lo/agent-plugins-sdk` |
| 服务对象 | **lo Core 的所有客户端**（agent、脚本、其他客户端） | **lo-agent 插件作者** |
| 能力 | 访问世界模型（读/写/查询） | 定义客户端插件的运行契约 |
| 依赖关系 | 独立，不依赖任何 plugin sdk | 依赖 `@lo/client` 作为通信底座 |
| 放置仓库 | `lo-client-sdk` | `lo-agent-plugins-sdk` |

**正确关系**：
- `@lo/client` 是"访问世界模型的能力通道"。
- `@lo/agent-plugins-sdk` 是"客户端插件的开发契约"，它**内部使用** `@lo/client`
  让插件访问 Core，但职责是定义插件怎么写。

---

## 4. 两套插件系统为什么不重复

### 4.1 定位差异

| | Core Plugin（lo-plugins + lo-plugins-sdk） | Agent Plugin（lo-agent-plugins-sdk） |
|---|---|---|
| 运行位置 | lo Core 进程内 | lo-agent 内 |
| 扩展对象 | **Core 能力** | **客户端交互** |
| 能力来源 | 进程内 ResourceService / RelationService | `@lo/client`（HTTP） |
| 生命周期 | Core PluginManager 驱动 | lo-agent 宿主驱动（未来） |
| 分发 | lo-plugins 仓库 tar.gz | lo-agent-plugins 仓库（未来） |
| 加载 | `pluginLoader.cjs` require | agent 宿主加载（未来） |

### 4.2 为什么不是重复

- **作用域不同**：Core Plugin 扩展"世界模型能力"（新的 resourceType、relation 语义、
  import/render 到 Core）；Agent Plugin 扩展"用户交互能力"（星图视图、阅读器 UI）。
- **运行环境不同**：Core Plugin 需要 Core 进程内对象（repository、resourceService）；
  Agent Plugin 只能经 HTTP。
- **不共享运行环境**，只是**共享模型/协议概念**（见 §6）。

```
Core Plugin:  扩展世界模型能力
Agent Plugin: 扩展用户交互能力
Client SDK:   访问世界模型能力（@lo/client）
Plugin SDK:   定义插件运行契约（各自的）
```

---

## 5. 数据流与能力流

### 5.1 数据流

```
外部数据(星图API/EPUB文件/Chrome划词)
   ↓
Core Plugin (ResourceProvider.discover → ResourceCandidate)
   ↓
lo Core (Resource / Relation 落库)
   ↓
lo-client-sdk (@lo/client 查询)
   ↓
lo-agent (展示 / 编辑)
   ↓
Agent Plugin (星图渲染 / 阅读器 UI)
```

### 5.2 能力流

```
Core Plugin:
  扩展世界模型能力（新 resourceType、relation 语义、import/render）

Agent Plugin:
  扩展用户交互能力（视图、阅读器、交互入口）

Client SDK (@lo/client):
  访问世界模型能力（读/写/查询/事件订阅）

Plugin SDK:
  定义插件运行契约（各自的基类/上下文/生命周期）
```

---

## 6. 共享与隔离

### 6.1 可以共享（概念/协议层）

| 共享项 | 说明 |
|---|---|
| Resource 模型 | Resource 的结构/语义概念，两套插件都操作它 |
| Relation 模型 | Relation 结构/语义概念 |
| Operation 协议 | 状态变化的事实记录语义（`type + params + context`） |
| Event 协议 | 事实广播语义（Domain/System 事件区分） |

**关键**：共享的是**协议与模型定义**，不是代码库。两套 SDK 各自实现契约，
但都指向 lo Core 的同一套概念。

### 6.2 必须隔离

| 隔离项 | Core Plugin | Agent Plugin |
|---|---|---|
| Runtime | Core 进程内 | lo-agent 内 |
| 生命周期 | PluginManager（Core） | 宿主运行时（agent，未来） |
| 权限模型 | Core 进程内权限 | 经 HTTP 的受控通道 |
| API 注入方式 | 进程内 ResourceService/RelationService | `@lo/client` + context |
| 宿主能力 | Core 能力面 | 客户端交互能力面 |

---

## 7. 结论

1. **lo 生态是"一个 Core + 多种消费者"**：lo Core 是唯一世界模型持有者；
   `@lo/client` 是所有外部消费者的统一访问通道；lo-agent 是其中一个客户端。
2. **两套插件系统是"不同层上的扩展"**，不是重复：
   - Core Plugin = 扩展 Core（进程内）
   - Agent Plugin = 扩展客户端交互（lo-agent 内）
   - 共享模型/协议概念，隔离运行环境/生命周期/权限/注入。
3. **lo-client-sdk 是 Core 的客户端，不是 agent 专用**——它是 lo-agent 当前消费者，
   未来也可服务其他客户端。
4. **边界已清晰**，后续可基于此决定（但**现在不设计**）：
   - lo-agent 插件运行时如何设计
   - plugin sandbox 是否需要
   - 内置模块是否插件化
   - Agent Runtime 是否需要独立进程

---

## 8. 当前优先级与边界确认（已确认）

### 8.1 当前优先级（不提前设计）

| 优先级 | 事项 |
|---|---|
| 1 | lo Core 能力稳定 |
| 2 | lo-client-sdk 协议稳定 |
| 3 | lo-agent 基础客户端完善 |
| 4 | Core Plugin 生态完善 |
| 5 | Agent Plugin Runtime 后续根据实际需求设计 |

### 8.2 不提前设计（属于 lo-agent 后续演进）

以下项**不属当前边界确认阶段**，不做设计：

- Agent Runtime
- Agent Plugin Runtime
- Sandbox
- 内置模块插件化
- Agent 多进程模型

### 8.3 已确认结论

1. **lo Core 是唯一世界模型持有者**。
2. **`@lo/client` 是所有外部消费者访问 Core 的统一协议客户端**。
3. **Core Plugin 和 Agent Plugin 是两个不同层面的插件系统**。
4. **两套插件共享 Resource / Relation / Operation / Event 等概念协议，但不共享运行环境**。

> 后续继续以真实代码审计为准，不提前设计不存在的能力。
