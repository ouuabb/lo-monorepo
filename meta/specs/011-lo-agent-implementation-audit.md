# 011 · lo-agent Implementation Audit

> 状态：v0.1 · 实现审计
> 范围：lo-agent 当前实现与 lo Core 协议的关系
> 方法：以真实代码为准，不设计 Agent Runtime / Agent Plugin Runtime
> 基准：006（生态边界，已确认）· 010（Core 对外协议，已就绪）· 005（早期 lo-agent 审计）

---

## 1. 背景

010 Phase1/Phase2 完成后，lo Core 已具备完整对外协议：

- `GET/POST /api/operations`（Operation 语义）
- `GET /api/events` + SSE `/api/events/stream`
- `GET/POST /api/relations` 等
- `@lo/client` 已提供 `operations/events/relations` 三个新 namespace

本审计确认 **lo-agent 当前实现**与这套协议的差距，以及需要迁移的部分。

---

## 2. lo-agent 与 @lo/client 的关系（代码实测）

### 2.1 当前结构

```
renderer (App.jsx)
  → window.loAgent.loCore.*
  → preload contextBridge
  → ipcRenderer.invoke('lo-core:*')
  → ipc.cjs 白名单 handler
  → LoCoreService (lo-core.cjs，持有 LoClient)
  → @lo/client
  → HTTP → lo Core
```

### 2.2 @lo/client 实际使用面（lo-core.cjs 实测）

| LoCoreService 方法 | @lo/client 调用 | 对应 HTTP |
|---|---|---|
| `configure` | `new LoClient({host,port,protocol})` | — |
| `login` | `client.login({privateKeyPath})` | SSH 挑战-应答 |
| `getStatus` | `client.health.stats()` | `GET /api/stats` |
| `listNotes` | `client.notes.list(query)` | `GET /api/notes` |
| `getNote` | `client.notes.get(rid)` | `GET /api/notes/:rid` |
| `updateNote` | `client.notes.update(rid, body)` | `PUT /api/notes/:rid` |
| `logout` | `client.logout()` | 本地清 token |

**结论**：lo-agent 仅使用 `@lo/client` 的 `health` + `notes` 命名空间。
**未使用**：`operations` / `events` / `relations`（010 新增的能力）。

---

## 3. 重复能力审计

### 3.1 lo-agent 自身实现 vs Core 能力

| lo-agent 实现 | 位置 | 是否与 Core 重复 | 结论 |
|---|---|---|---|
| 资源列表展示 | `App.jsx handleRefresh` → `listNotes` | 否（读 Core） | 保持 |
| 资源内容读取 | `App.jsx openResource` → `getNote` | 否（读 Core） | 保持 |
| 资源保存 | `App.jsx saveActiveTab` → `updateNote` | **部分重复**（见下） | 需迁移 |
| 编辑器脏标记/标签页 | `App.jsx tabs/isDirty` | 否（纯 UI 状态） | 保持 |
| 内置帮助文档 | `docs/DocViewer + content/*.md` | 否（本地静态文档） | 保持 |
| 登录/状态 | `login/getStatus` | 否（读 Core） | 保持 |

### 3.2 关键重复点：写操作

**当前写路径（实测）**：
```
App.jsx saveActiveTab
  → updateNote(rid, {content})
  → client.notes.update(rid, body)
  → PUT /api/notes/:rid
  → repo.updateResource → operationEngine.execute("resource.update")
  → Operation Record + resource.updated Event
```

**Core 协议语义（010）**：
```
客户端 → client.operations.execute("resource.update", {rid, updates})
       → POST /api/operations
       → OperationEngine（同样记录 + emit）
```

**判定**：
- 两条路径**最终都进 OperationEngine**（因为 `PUT /api/notes/:rid` 内部走 repo.updateResource → operationEngine）。
- 但 lo-agent 用的是 **notes 兼容层（CRUD 形态）**，而非 **Operation 语义**。
- 这不是"重复的数据真相"，而是"协议形态未收敛"——符合 002 §5 定义的兼容层长期收敛方向。

---

## 4. 需要迁移到 Core Protocol 的部分

### 4.1 必须迁移（写操作 → Operation 语义）

| 当前 | 目标 | 理由 |
|---|---|---|
| `updateNote` → `client.notes.update` | `client.operations.execute("resource.update", {rid, updates})` | 统一走 Operation 语义，获得 context/actor 追踪 |

**影响面**：
- `lo-core.cjs`：`updateNote` 内部改为 `client.operations.execute(...)`
- `ipc.cjs` / `preload` / `App.jsx`：**无需改**（接口签名不变，`updateNote(rid, body)` 保持）

### 4.2 建议迁移（读操作 → 语义 namespace）

| 当前 | 目标 | 理由 | 优先级 |
|---|---|---|---|
| `listNotes` → `client.notes.list` | `client.resources`（若新增）或保持 notes | 读操作无 Operation 需求 | 低 |
| `getNote` → `client.notes.get` | 保持 | 读操作已稳定 | 低 |

> 说明：`resources` namespace 在 003 中定义为"读 + 语义写"，但当前 `@lo/client` 尚未拆分；
> 读操作走 notes 兼容层即可，无需迁移。

### 4.3 无需迁移

- **登录/状态/登出**：无变化
- **内置文档**：本地静态，与 Core 无关
- **标签页/脏标记**：纯 UI 状态，无数据真相

---

## 5. 能力缺口（lo-agent 尚未利用的 Core 协议）

010 之后 Core 已提供，但 lo-agent 未消费：

| Core 能力 | lo-agent 现状 | 潜在用途 |
|---|---|---|
| `operations.execute` | 未使用 | 语义化写操作（见 §4.1） |
| `events.subscribe`(SSE) | 未使用 | 资源变化实时刷新（替代手动刷新） |
| `events.history` | 未使用 | 审计/操作历史展示 |
| `relations.*` | 未使用 | 未来插件/图谱（当前无 UI） |

> 这些是**能力增量**，不是缺陷。SSE 订阅能提升 UX（免手动刷新），但属增强，非 Phase 必需。

---

## 6. 最小迁移计划

### 目标
在不改 lo-agent UI/接口的前提下，将**写路径**收敛到 Operation 语义。

### 步骤 1：lo-core.cjs 写操作迁移

**文件**：`src/main/lo-core.cjs`
**改动**：
```js
async updateNote(rid, body) {
  try {
    this._ensureClient();
    // 从 notes 兼容层迁移到 Operation 语义
    const { operationId, result } = await this.client.operations.execute(
      'resource.update',
      { rid, updates: body },
      {}, // options: actor 等，后续宿主填充
    );
    return { ok: true, operationId, data: result };
  } catch (e) {
    return this._toError(e);
  }
}
```

**验证**：
- 保存后 Operation 记录产生（`resource.update` status=success）
- `resource.updated` 事件产生（Phase 2 已验证）
- UI 保存流程不变（`updateNote(rid, body)` 签名不变）

### 步骤 2（可选）：SSE 实时刷新

**文件**：`lo-core.cjs` + `ipc.cjs` + `preload` + `App.jsx`
**改动**：
- lo-core.cjs 新增 `subscribeEvents(types, cb)` → `client.events.subscribe`
- ipc 增加 `lo-core:events-subscribe` / `lo-core:events-unsubscribe` 通道
- preload 暴露 `onEvent(types, cb)`
- App.jsx 在 `handleRefresh` 后订阅 `resource.updated`，收到后刷新列表

**验证**：
- 外部改动（如 CLI `lo edit`）后 lo-agent 列表自动刷新
- 不破坏现有手动刷新

> 步骤 2 是增强，可延后；步骤 1 是 Phase 2 收敛的必然结果。

---

## 7. 结论

1. **lo-agent 是"薄客户端"**：只读 Core、无本地数据真相（符合 006）。
2. **无重复数据层**：唯一的"重复"是写操作协议形态（notes CRUD vs Operation 语义），
   但两条路径最终都进 OperationEngine，**无数据不一致**。
3. **最小迁移 = 1 处**：`updateNote` 从 `client.notes.update` 改为
   `client.operations.execute("resource.update")`——接口不变、UI 不变、风险低。
4. **能力增量**（非必需）：SSE 订阅、relations/events 消费，供后续 UI/插件使用。

## 8. 后续（记录，不设计）

- 步骤 1（updateNote 迁移）可立即实施，属低风险收敛。
- 步骤 2（SSE）等 lo-agent 需要实时性时实施。
- Agent Runtime / Agent Plugin Runtime 接入不在本审计范围（006 已冻结）。
