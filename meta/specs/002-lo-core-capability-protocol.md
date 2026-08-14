# 002 · lo Core Capability Protocol

> 状态：v0.1 · 草案
> 范围：lo Core 对外能力边界
> 上游基准：001 Execution Context Protocol(已确定)
> 所属系列：lo Core 对外能力协议

---

## 1. 定位

本协议定义 **lo Core 对外暴露给 lo-client-sdk / lo-agent / Agent Plugin / 第三方客户端的能力边界**。
它回答三个问题：

1. lo Core 有哪些**正式协议能力**（Operation / Event 语义）
2. 哪些现有 HTTP 接口是**兼容层**（保留给存量消费者，长期收敛）
3. lo-client-sdk 如何映射这些能力

**前提（来自 001，不再展开）**：

- Execution Context 是所有外部行为进入 Core 的统一参数
- Operation 是状态变化事实记录
- Event 是成功 Operation 后的事实广播
- 所有状态变化最终应进入 OperationEngine

## 2. 盘点方法

本协议基于 lo 仓库真实代码盘点（serve.cjs 路由表 / repository 公开方法 / operation 注册表 /
event 注册表 / lo-client-sdk 封装），非凭空设计。

## 3. 现状盘点

### 3.1 HTTP 路由全景（serve.cjs，共 104 个路由）

按域分组（均来自代码实测）：

| 域 | 现有端点 |
|---|---|
| Auth | `POST /api/auth/challenge` · `login` · `reload` |
| Health | `GET /api/health` · `stats` · `tags` |
| Notes(Resource) | `GET /api/notes` · `GET /api/notes/:rid` · `POST /api/notes` · `PUT /api/notes/:rid` · `DELETE /api/notes/:rid` · `POST /api/notes/upload` |
| Search | `GET /api/search` |
| Schemas | `GET/POST /api/schemas` · `GET/PUT/DELETE /api/schemas/:id` · `POST /api/schemas/:id/attach|detach` |
| Views | `GET/POST /api/views` · `GET/PUT/DELETE /api/views/:id` · `POST /api/views/:id/run` · `GET /api/views/:id/export` · `POST /api/views/import` |
| Sync | `POST /api/sync` · `push` · `pull` |
| Workflows | `GET/POST /api/workflows` · `GET/PUT/DELETE /api/workflows/:id` · `POST /api/workflows/:id/attach|resume|can` · `GET /api/workflow/instances` · `GET /api/workflows/history` |
| Automations | `GET/POST /api/automations` · `GET/PUT/DELETE /api/automations/:id` · `POST /api/automations/:id/run` · `GET /api/automations/history` · `enable/disable` |
| Evolution | `GET /api/evolution/status|observe|health|detect|plan|history` · `POST execute|rollback` |
| Admin | `GET /api/admin/stats` · `resources` CRUD · `graph` · `graph/path` · `suggestions` · `containers` · `relations`(list/delete) · `audit` · `import` · `commit` · `status` · `types` · `tags` · `categories` |
| Plugins | 插件自注册端点（`/api/plugins/<id>/…`，动态挂载） |

### 3.2 鉴权模型（serve.cjs 实测）

| 路径前缀 | 认证 | 说明 |
|---|---|---|
| `/api/auth/*` | 无需认证 | SSH 挑战-应答流程自身 |
| `/api/admin/*` | 可选共享密钥 | 设 `LO_ADMIN_TOKEN` 后要求 `Authorization: Bearer <token>`；未设则无认证（仅本地 127.0.0.1） |
| 插件端点 | 豁免 SSH | 仅限已实际挂载的插件端点，策略由插件自身控制 |
| 其余 | SSH 会话 | `validateSession(token)` 校验 |

**写锁**：所有 `POST/PUT/DELETE`(非 auth)经 `withWriteLock` 串行化。

### 3.3 Operation 能力（repository 公开方法，代码实测）

| 能力 | repo 方法 |
|---|---|
| 执行操作 | 经 `operationEngine.execute(type, params, options)`（各 service 内部调用） |
| 操作历史 | `getContainerHistory(containerRid)` · `getMemberHistory(...)` · `getSystemHistory`(经 engine) |
| 撤销 | `undoContainerOperation(operationId)` → `operationEngine.undo()` |
| 事务 | `beginTransaction(...)` · `executeInTransaction(transactionId, type, params, options)` |

已注册 Operation 类型（operations/ 目录自动加载，`handler.type`）：

- `resource.create / update / delete / move`
- `relation.create / update / remove`
- `schema.create / update / delete`
- `view.create / update / delete`
- `workflowTransition`
- `automation.create / update / remove`
- `member.add / remove / update / move / copy / rename / delete / restore / promote / demote / ignore / unignore`

### 3.4 Event 能力（eventRegistry 实测）

- 内置事件：`resource.*` · `relation.*` · `knowledge.*` · `ai.suggestion.*` · `sync.*` ·
  `plugin.*` · `automation.*` · `Workflow*` · `federation.*`
- 现状：事件由业务 service 手动 `emitEvent`（与 Operation 脱节，见 001 §7 待收敛）
- **无任何 HTTP 事件出口**（无 SSE / WebSocket / `/api/events`）

### 3.5 lo-client-sdk 现状

`@lo/client` 已封装命名空间：`notes / search / schemas / views / workflows / automations /
evolution / sync / admin / health` + `auth`。

**缺失**：

- `operations` 命名空间（无）
- `events` 命名空间（无）
- Relation 写操作（admin 只有 list/delete，无 create）

---

## 4. 正式协议能力（目标态）

按 001 的架构基准，lo Core 对外**正式协议**应为以下能力面：

```
lo-client-sdk / lo-agent / Agent Plugin / 第三方
        │
        ├── Operations API   ── 一切写操作的正式入口
        ├── Events API       ── 事实广播的订阅入口
        ├── Queries API      ── 读（Resource / Relation / Search / Schema / View）
        ├── Workflow API     ── 工作流（已有，属兼容层收敛目标）
        └── Automation API   ── 自动化管理（已有，属兼容层收敛目标）
```

### 4.1 Operations API（正式 · 新增）

统一写入口，直接映射 `OperationEngine.execute(type, params, context)`：

| 方法 | 端点 | 映射 repo 能力 |
|---|---|---|
| 执行操作 | `POST /api/operations` | `operationEngine.execute` |
| 操作历史 | `GET /api/operations` | `getContainerHistory` / `getSystemHistory` |
| 单条操作 | `GET /api/operations/:id` | 查询单条 record |
| 撤销 | `POST /api/operations/:id/undo` | `undoContainerOperation` |
| 事务开始 | `POST /api/operations/transaction` | `beginTransaction` |
| 事务内执行 | `POST /api/operations/transaction/:id/execute` | `executeInTransaction` |
| 事务提交/回滚 | `POST /api/operations/transaction/:id/commit|rollback` | transactionEngine |

请求体形态（基于 001 §6 OperationRecord）：

```json
{
  "type": "relation.create",
  "params": { "fromRid": "res_1", "toRid": "res_2", "type": "reference" },
  "context": { "actor": {}, "source": {}, "trace": {}, "permission": {}, "metadata": {} }
}
```

### 4.2 Events API（正式 · 新增）

成功 Operation 后的事实广播。基于 001 §7：

| 方法 | 端点 | 说明 |
|---|---|---|
| 订阅事件流 | `GET /api/events/stream?subscribe=resource.created,relation.created` | SSE |
| 事件历史 | `GET /api/events` | 查询（可选） |

SSE 帧形态：

```text
event: relation.created
data: {"operationId":"op_abc","type":"relation.create","context_snapshot":{...},"payload":{...}}
```

### 4.3 Queries API（正式 · 已有/整理）

读操作不改变世界状态，不需要 Operation，但仍是正式协议：

| 能力 | 端点 | 状态 |
|---|---|---|
| Resource 列表/单条 | `GET /api/notes` · `/api/notes/:rid` | 已有 · 正式 |
| Search | `GET /api/search` | 已有 · 正式 |
| Relation 查询 | `GET /api/admin/relations`(需 admin) | 已有 · **待提升为普通查询** |
| Schema | `GET /api/schemas` · `/api/schemas/:id` | 已有 · 正式 |
| View 查询/运行 | `GET /api/views` · `/api/views/:id/run` | 已有 · 正式 |
| Graph | `GET /api/admin/graph` · `graph/path` | 已有 · 待提升 |

### 4.4 Workflow / Automation（已有 · 兼容层收敛目标）

现状已是完整 CRUD + 执行。长期应保证**它们内部的一切状态变化也经 OperationEngine**
（部分已如此，见 001 §8 待收敛），HTTP 形态可保持不变（视为正式协议的既定子集）。

---

## 5. 兼容层（存量接口）

以下现有端点**保留给存量消费者**，但不是推荐的新接入面：

| 端点 | 定位 | 长期收敛方向 |
|---|---|---|
| `POST /api/notes` · `PUT /api/notes/:rid` · `DELETE /api/notes/:rid` | CRUD 写 | 收敛到 `POST /api/operations` |
| `POST /api/admin/resources` | admin 写 | 收敛到 Operations API |
| `POST /api/admin/import` | 批量导入 | 收敛到事务性 Operations |
| `POST /api/admin/relations/:id`(仅 DELETE) | 关系写 | 收敛到 `relation.remove` Operation |
| `POST /api/views/:id/run` 等写端点 | 状态变化 | 收敛到对应 Operation |

**兼容层原则**：存量消费者不断；新消费者一律走正式协议。兼容层最终可由
"Operations API 的服务端适配"实现（内部已走 OperationEngine，只是协议形态不同）。

---

## 6. lo-client-sdk 映射

### 6.1 目标命名空间

```
LoClient
├── operations : execute(type, params, context) / list() / get(id) /
│                undo(id) / beginTransaction() / executeInTransaction() / commit() / rollback()
├── events     : subscribe(types, handler)  → SSE(自动重连) / history(query)
├── resources  : list / get / search(现 notes+search)
├── relations  : query / create / remove   ← 新增写能力
├── schemas    : list / get / create / update / remove   (现状已有)
├── views      : ...                                     (现状已有)
├── workflows  : ...                                     (现状已有, 兼容)
├── automations: ...                                     (现状已有, 兼容)
├── health     : ping / stats / tags                     (现状已有)
└── auth       : challenge / login / logout              (现状已有)
```

### 6.2 映射规则

- **写操作**：一律走 `client.operations.*`（携带 context），不再提供独立 `notes.create` 等写方法
  （存量 `notes.create` 保留为兼容别名，内部转发到 operations）。
- **读操作**：保持 `client.resources.* / relations.query / search / schemas / views`。
- **事件**：`client.events.subscribe` 封装 SSE，自动重连 + 事件 → 回调。
- **context 注入**：`client.operations.execute` 的 `context` 由 **lo-agent 宿主填充**
  （actor/source/trace/permission），客户端**不伪造**（见 001 §4 硬性规则）。

---

## 7. 兼容层与正式协议的边界判定

| 判定条件 | 归类 |
|---|---|
| 改变世界状态且无状态变化语义 | 一律收 Operations API |
| 读取世界状态 | Queries API（正式） |
| 订阅事实变化 | Events API（正式） |
| 已有 CRUD 端点 | 兼容层（保留，长期收敛） |

## 8. 待确认点

1. **Relation 查询是否上移出 admin**：`GET /api/relations` 作为普通查询端点（当前在 admin 下）。
2. **View 执行是否算 Operation**：`view.run` 有副作用但非持久变化，是否需经 Operation。
3. **兼容层存续期**：notes CRUD 兼容层保留多久，是否标记 deprecated。
4. **SSE 鉴权**：`/api/events/stream` 走 SSH 会话还是 admin token。
