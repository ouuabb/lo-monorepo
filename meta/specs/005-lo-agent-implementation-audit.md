# 005 · lo-agent Implementation Audit

> 状态：v0.1 · 审计报告
> 范围：基于现有 lo-agent / lo-agent-sdk 代码的实现审计
> 上游基准：001–004（已确定）
> 方法：以代码为准，判定当前实现与 001/002/003 边界的符合程度

---

## 0. 审计对象与范围

- 仓库：`lo-agent`（工作区 `C:\Users\admin\Downloads\lo\lo-agent`）
- 代码范围：`src/main/*` · `src/preload/*` · `src/renderer/src/*`
- 不含：`lo-agent-plugins-sdk`（新仓库，另审）

---

## 1. 当前模块划分

```
lo-agent/src/
  main/
    index.cjs          # 主进程入口：窗口管理 + initLoCore + 窗口控制 IPC
    lo-core.cjs        # LoCoreService：封装 @lo/client（configure/login/status/listNotes/getNote/updateNote/logout）
    config-store.cjs   # 配置持久化到 userData/lo-agent.json
    ipc.cjs            # 白名单 IPC 通道注册（lo-core:*）
  preload/
    index.cjs          # contextBridge 暴露 window.loAgent（loCore + windowControls）
  renderer/
    src/
      main.jsx         # React 入口
      App.jsx          # 主组件（工作台/文档/编辑器/登录/缩放/标签页）
      App.css
      docs/DocViewer.jsx  # 内置文档查看
      docs/nav.mjs        # 文档导航数据
      editor/NoteEditor.jsx # Monaco 编辑器（纯受控组件）
```

---

## 2. 当前调用链

### 2.1 渲染 → 主进程 → Core（实测）

```
App.jsx (window.loAgent.loCore.*)
  → preload contextBridge
  → ipcRenderer.invoke('lo-core:*')
  → ipc.cjs 白名单 handler
  → LoCoreService.method
  → @lo/client (LoClient)
  → HTTP → log serve
```

**认证链路**：
```
App.jsx login({ privateKeyPath })
  → LoCoreService.login
  → client.login → auth.login（SSH 挑战-应答）
  → token 存入 AuthClient，自动附加到后续请求
```

**编辑保存链路**（实测）：
```
App.jsx saveActiveTab()
  → api.updateNote(rid, { content, ... })
  → LoCoreService.updateNote → client.notes.update
  → PUT /api/notes/:rid
```
NoteEditor 是纯受控组件（`value/onChange`），**不直接调用 loCore**——保存逻辑在 App.jsx。

### 2.2 无本地数据存储（实测）

- 渲染层：`grep` 无 `localStorage/sessionStorage/indexedDB` 使用。
- 主进程：仅 `config-store.cjs` 持久化**连接配置**（userData/lo-agent.json），
  **不存储任何 Resource/Relation 数据**。
- 结论：**lo-agent 不拥有世界模型数据，符合 001/002 约束**。

### 2.3 无插件机制（实测）

- `App.jsx` / `main/*`：grep 无 `plugin`、`AgentRuntime` 引用。
- `lo-agent/src` 无插件加载/管理代码。
- `lo-agent-plugins-sdk` 是独立新仓库，**尚未接入 lo-agent**。
- 结论：**当前无插件 runtime**（004 §0 中 plugin sandbox 属未来演进，正确）。

---

## 3. 当前 SDK 使用方式

### 3.1 `@lo/client` 使用面（lo-core.cjs 实测）

| LoCoreService 方法 | 调用的 SDK 能力 | 对应 HTTP |
|---|---|---|
| `configure` | `new LoClient({host,port,protocol,timeout})` | — |
| `login` | `client.login({privateKeyPath})` | SSH 挑战-应答 |
| `getStatus` | `client.health.stats()` | `GET /api/stats` |
| `listNotes` | `client.notes.list(query)` | `GET /api/notes` |
| `getNote` | `client.notes.get(rid)` | `GET /api/notes/:rid` |
| `updateNote` | `client.notes.update(rid, body)` | `PUT /api/notes/:rid` |
| `logout` | `client.logout()` | 本地清 token |

**使用形态**：
- SDK **只在主进程实例化**（LoCoreService 持有 `this.client`），渲染层经 IPC——符合 004 §7。
- 全部走 `notes`/`health` 命名空间——**符合"以现有 @lo/client 为准，不发明新层"**。
- **尚未使用** `operations` / `events` / `relations`（这些是未来演进，正确未用）。

### 3.2 context 现状

- LoCoreService 调用 `client.notes.update` 时**不携带 Execution Context**（003 §6 的
  context 透传尚未实现）。
- 原因：当前 HTTP 面（notes CRUD）本身不接收 context；`operations.execute` 才需要。
- 判定：**符合现状**——context 是 Operation 语义的事，notes 兼容层无此需求。

---

## 4. 与 001/002/003 协议的符合程度

| 协议要求 | 当前实现 | 符合度 |
|---|---|---|
| 001：Execution Context 为统一入口 | 未引入（当前走 notes 兼容层） | 符合现状（Operation 未上 HTTP） |
| 001：所有状态变化进 OperationEngine | 服务端负责；agent 端不绕过 | 符合（agent 经 HTTP，Core 侧保证） |
| 002：写操作收敛到 Operation | 当前 agent 用 notes.update（兼容层） | **偏差（预期）**——见 §5 |
| 002：Core 唯一世界模型持有者 | agent 无本地数据 | ✅ 符合 |
| 003：SDK 只在主进程、经 IPC | lo-core.cjs 持有 client | ✅ 符合 |
| 003：SDK 不伪造 context | 当前无 context 透传 | 符合（未启用该能力） |
| 003：语义方法保留、内部映射 Operation | 当前直接调 notes（非映射） | 部分——语义 API 存在，但尚未映射 Operation |
| 003：错误模型 LoApiError/LoHttpError | `_toError` 已映射 api/http/unknown | ✅ 符合 |

---

## 5. 存在的架构偏差（基于代码判断）

### 5.1 写操作走 notes 兼容层（偏差，但属预期收敛项）

- **现状**：`updateNote` → `client.notes.update` → `PUT /api/notes/:rid`（002 §5 兼容层）。
- **长期**：应收敛到 `operations.execute("resource.update")`（002 §4.1，未来演进）。
- **当前不改**：因为 `/api/operations` 尚未存在（003 §5 的 operations 是目标态）。

### 5.2 无事件订阅（能力缺失，非偏差）

- agent 无 SSE/事件订阅（`/api/events/stream` 不存在于 Core）。
- 不影响当前（当前是"手动刷新"模式），是未来 Event 通道落地后的增强。

### 5.3 无插件 runtime（能力缺失，非偏差）

- lo-agent 当前**没有任何插件机制**；`lo-agent-plugins-sdk` 是独立仓库、未接入。
- 004 §0 已将其标注为未来演进方向，正确。

### 5.4 Agent Runtime 不存在

- 当前无 agent 执行代码（`agent` 仅出现在 lo Core 侧，agentEngine.cjs 等）。
- lo-agent 内无 Agent Runtime（004 §4 是目标态）。

---

## 6. 结论：哪些保持，哪些需改

### 保持（现状正确，不动）

| 项 | 理由 |
|---|---|
| 主进程持有 `@lo/client`、渲染层经 IPC | 符合 003 §7、004 §7 |
| 白名单 IPC（ipc.cjs） | 符合安全基线 |
| `config-store` 只存连接配置、不存数据 | 符合 002 世界模型约束 |
| `_toError` 错误映射 | 符合 003 §9 |
| Monaco 纯受控组件、保存逻辑在 App | 边界清晰，无需改 |
| 无本地数据存储 | 符合 Core 唯一世界模型 |

### 需改（未来演进，非当前缺陷）

| 项 | 触发条件 |
|---|---|
| 写操作 `notes.update` → `operations.execute` | 等 `/api/operations` 在 Core 落地 |
| 事件订阅 | 等 Core 提供 `/api/events/stream` |
| 插件 runtime | 接入 `lo-agent-plugins-sdk` 时设计 |
| Agent Runtime | 定义场景后引入 |
| Execution Context 透传 | 随 operations 一起引入 |

---

## 7. 关键判断

1. **当前 lo-agent 是"最小可用客户端"**：连接 → 读列表 → 读/改单条 → 保存，
   全部经 `@lo/client` + HTTP，无本地数据、无插件、无 Agent Runtime。
2. **不存在需要回退的架构偏差**：唯一"偏差"（写走 notes 兼容层）是**预期的收敛项**，
   依赖 Core 侧 `/api/operations` 落地。
3. **插件系统的定位**（回应用户核心问题）：
   - **Core Plugin System**：扩展 Core 能力（进程内，`@lo/plugins-sdk`）。
   - **Agent Plugin System**：扩展客户端交互（lo-agent 内，`lo-agent-plugins-sdk`）。
   - **共享**：Resource/Relation/Operation/Event 的**模型与协议**（概念层）。
   - **不共享**：运行环境、能力注入方式（Core 用 ResourceService，Agent 用 `@lo/client`）。
   - 两者**不重复、位于不同层**，已符合 004 §6 定义。

---

## 8. 后续动作建议

1. 保持当前 lo-agent 架构，**不急于引入插件/Agent Runtime**。
2. 插件系统接入的前提：`lo-agent-plugins-sdk` 明确"宿主注入 `@lo/client` + context"，
   且 Core 侧先落地 `/api/operations`（否则插件只能读不能统一写）。
3. 优先级建议：**Core 的 Operations API > Event 通道 > Agent 插件接入**——
   因为插件依赖的能力面（写操作、事件）尚未在 Core HTTP 层就绪。
