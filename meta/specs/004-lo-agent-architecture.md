# 004 · lo-agent Architecture

> 状态：v0.1 · 草案
> 范围：lo-agent 的定位与边界（不设计具体 UI）
> 上游基准：001 Execution Context Protocol · 002 Capability Protocol · 003 lo-client-sdk Protocol（均已确定）
> 所属系列：lo Core 对外能力协议

## 0. 前提修正（v0.1）

本协议不是从零设计 lo-agent，而是**基于已存在的 lo-agent / lo-agent-sdk 代码进行架构归纳**。
以下概念属于**未来演进方向，不是当前架构事实**，后续以现有代码为准，不默认新增：

- `/api/operations`、SSE event 通道
- plugin sandbox / 插件运行时
- 内置模块插件化
- Agent Runtime 独立运行时

> 这些内容的当前实现状态见 `005-lo-agent-implementation-audit.md`。

---

## 1. 定位

lo-agent 是 **lo 的桌面交互终端**：一个独立的 Electron 桌面应用，通过 `@lo/client`
消费 lo Core 的能力，为用户提供阅读、编辑、知识管理、以及客户端扩展（插件）的宿主。

**核心定位（已确定约束）**：

- **lo-agent 不是 lo Core 的一部分，也不是它的插件**——是独立消费者。
- **lo-agent 不拥有世界模型**：Resource/Relation/Schema/View/Workflow/Container 的
  真相全部在 lo Core。
- **lo-agent 的价值 = 交互层 + 客户端扩展宿主**，不是数据层。

```
lo Core（唯一世界模型 + 能力中心）
   ▲            ▲
   │ HTTP       │ HTTP
@lo/client   @lo/client
   ▲            ▲
   ├────────────┤
   │   lo-agent  │
   │  Electron UI │
   │  Agent Runtime │
   │  Plugin Runtime │
   └────────────┘
```

## 2. lo-agent 与 lo Core 的关系

| 维度 | lo Core | lo-agent |
|---|---|---|
| 世界模型 | 唯一持有者（Resource/Relation/…） | 无 |
| 状态变化 | OperationEngine 统一记录 | 经 `@lo/client` 调用，不落库 |
| 事件 | 产生事实广播 | 订阅并响应 |
| 插件 | Core 进程内扩展（能力型） | 客户端扩展（交互型） |
| 生命周期 | `log serve` 常驻服务 | 独立桌面进程 |

**连接方式**：

- lo-agent 主进程持有 `LoClient` 实例（`lo-core.cjs` 已封装），经 SSH 登录后携带 token。
- 所有读写经 `@lo/client` → HTTP → lo Core。
- lo-agent **不直连数据库、不 require lo Core 内部模块**。

## 3. Electron 层职责

Electron 进程模型与职责划分：

| 进程 | 职责 | 边界 |
|---|---|---|
| **主进程**（main） | 窗口管理、生命周期、`LoClient` 持有、IPC 注册、插件加载（若 Node 能力插件） | 不承载业务渲染 |
| **preload** | contextBridge 暴露受控 API | 只暴露白名单，不透传 Node |
| **渲染进程**（renderer） | React UI、Monaco 编辑器、插件 UI 承载 | 不直接触碰 Node/Core |

**IPC 原则（现状 ipc.cjs 已遵循，保持）**：

- 白名单通道（`lo-core:*`），不透传任意调用。
- 渲染进程经 preload 的 `window.loAgent` 访问能力。
- 未来扩展：`lo-core:operation` / `lo-core:events`（SSE 转发）/ `agent-plugins:*`。

## 4. Agent Runtime 位置

Agent Runtime 是 **lo-agent 内承接"智能体行为"的运行时**，位于主进程或独立
Node 子进程（由 Node 能力需求决定）。

- **Agent 也是 lo Core 的能力消费者**（001 基准），经 `@lo/client` 调 Operation。
- Agent 的每次调用构造 Execution Context：`actor=user 或 agent`、`source=agent`。
- Agent 不持有自己的 Resource/Relation 数据层（002 约束 3）。

## 5. Editor（Monaco）的定位

Monaco 是 **lo-agent 渲染层内的编辑器组件**，定位：

- 只负责文本编辑交互，**不拥有资源真相**。
- 资源内容经 `@lo/client` 读取/保存（现状 `NoteEditor.jsx` 已接 `getNote/updateNote`）。
- 保存动作收敛到 Operation 语义（经 `operations.execute("resource.update")`）。
- 编辑器本身不是插件，但可作为插件 UI 的承载宿主之一（如 PDF 阅读器嵌入编辑区）。

## 6. Plugin Runtime 是否复用 Core 插件体系

**不复用**（明确决定）：

| 维度 | lo Core 插件 | lo-agent 插件 |
|---|---|---|
| 运行位置 | Core 进程内 | lo-agent 内 |
| 能力来源 | 进程内 ResourceService/RelationService | `@lo/client`（HTTP） |
| 作用域 | 扩展 Core 能力 | 扩展客户端交互 |
| SDK | `@lo/plugins-sdk` | `@lo/agent-plugins-sdk`（已建仓） |
| 共享 | 世界模型 / Operation 协议 / Event 协议（概念层） | 同左 |

**共享内容**：Resource/Relation/Schema/View 的**模型与协议**（不是运行环境）。

lo-agent 插件示例（见前序讨论）：
- **View Extension**：星图、3D 书架、PDF 阅读器——读 Core 数据渲染。
- **Provider Extension**：接入外部数据源，转成 Resource/Relation 写入 Core。
- **Interaction / Automation Extension**：交互与触发入口。

所有插件经 `@lo/client` + Operation 写 Core，不建立本地数据真相。

## 7. lo-client-sdk 在 agent 内部的位置

```
┌─ 渲染进程 ─────────────────────────────┐
│  React UI / Monaco / 插件 UI           │
│        ▲         ▲                     │
│        │ preload │                     │
│  window.loAgent（contextBridge）        │
└────────┼─────────┼─────────────────────┘
         │ IPC     │ IPC
┌────────▼─────────▼─────────────────────┐
│  主进程                                 │
│  ┌──────────────────────────────┐      │
│  │  LoCoreService                │      │
│  │   └── LoClient（@lo/client）──┼──▶ Core│
│  │  Agent Runtime                │      │
│  │  Plugin Runtime（agent）       │      │
│  └──────────────────────────────┘      │
└────────────────────────────────────────┘
```

- **`@lo/client` 只在主进程实例化**（`lo-core.cjs` 已如此），渲染进程经 IPC 访问。
- 插件（Node 能力型）在主进程运行时，可直接持有/共享 `LoClient` 实例或经 IPC 代理。
- 插件（渲染型）经 `window.loAgent` 的受控通道访问。

## 8. 内置模块与插件模块的边界

| | 内置模块 | 插件模块 |
|---|---|---|
| 例子 | 文档视图、资源浏览、Monaco 编辑器、设置 | 星图、3D 书架、PDF 阅读器 |
| 维护方 | lo-agent 仓库 | 插件仓库（`lo-agent-plugins`） |
| 加载时机 | 编译期/内置 | 运行时动态加载 |
| 权限 | 完全受信 | 需沙箱/白名单约束 |
| 世界模型 | 都无——都经 `@lo/client` 访问 Core | 同左 |

**边界规则**：

- 内置模块是**受信的 lo-agent 代码**，可访问 agent 完整能力面。
- 插件模块是**半受信第三方代码**，只经受控通道（白名单 API）访问 Core。
- 两者**都不建立数据真相**，都经 `@lo/client` + Operation。
- 内置模块优先用相同 API 形态（内部按插件式组织是可选的演进，非强制）。

## 9. 状态与配置

- **认证/连接状态**：`lo-core.cjs` 维护（token、host/port/protocol）。
- **用户偏好**：`config-store.cjs` 持久化（现状）。
- **插件状态**：插件的启停/配置由 agent 管理，但**插件产生的数据**全部在 Core。

## 10. 待确认点

1. **Agent Runtime 进程模型**：主进程内 vs 独立 Node 子进程（影响隔离与 Node 能力）。
2. **插件加载位置**：Node 能力型插件跑主进程，渲染型跑渲染进程，还是统一沙箱。
3. **SSE 事件在 agent 的归属**：主进程订阅后经 IPC 转发渲染进程/插件，还是直接到渲染进程。
4. **内置模块是否插件化组织**：长期是否把文档/资源浏览改为内置插件。
