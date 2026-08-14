# 010 · Phase 1：Core 对外协议层收敛计划

> 状态：v0.1 · 实施计划
> 目标：把 `Core 内部能力 → 部分 HTTP → @lo/client` 推进为
> `Core 能力 → 稳定 HTTP Protocol → @lo/client → 各类外部消费者`
> 范围：lo / lo-client-sdk / lo-agent 三仓库联动
> 约束：不设计 Agent Runtime / Agent Plugin Runtime / Sandbox；不重新设计 Core Plugin
> System / Resource / Relation / Operation / Event 模型；@lo/client 保持独立定位。

---

## 0. 总原则

1. **复用现有实现**：OperationEngine / EventBus / EventStore / relationService 已成熟，
   本计划只在它们之上加"对外层"（HTTP route + SDK namespace）。
2. **不新增内部模型**：只加薄路由与薄封装。
3. **@lo/client 独立**：不加入任何 lo-agent 专属逻辑。

---

## 1. Operation API

### 1.1 现状（代码实测）

| 层 | 已有 | 缺 |
|---|---|---|
| Core 内部 | OperationEngine（execute/undo/getHistory/getSystemHistory/getOperation/getOperationsByTransaction）；operations/ 注册 30+ 类型；repository.beginTransaction/executeInTransaction/commitTransaction/rollbackTransaction | **repository 无统一 executeOperation 入口**（execute 只在各业务方法内部调用） |
| HTTP | 无 `/api/operations*` | 全部缺失 |
| @lo/client | 无 operations namespace | 全部缺失 |
| lo-agent | — | — |

### 1.2 方案

**步骤 A：lo Core 加 repository 薄方法 + HTTP route**

新增 repository 方法（`src/repo/repository.cjs`，放在 Operation/Transaction 区）：

```js
// 统一执行操作（context 透传 actor 等，见 001）
async executeOperation(type, params, options = {}) {
  return this.operationEngine.execute(type, params, options);
}
```

> 说明：这是对现有 `operationEngine.execute` 的直接透传，不重设计。`options` 传入
> `{ actor, parentOperationId, transactionId }`（OperationEngine 已支持，见 007 §3）。

新增 serve route（`src/commands/serve.cjs`，参照现有 `route()` 写法）：

| 端点 | 方法 | handler 调 repo |
|---|---|---|
| `/api/operations` | POST | `executeOperation(type, params, {actor})` |
| `/api/operations` | GET | `getSystemHistory({limit, type})` |
| `/api/operations/:id` | GET | `operationEngine.getOperation(id)` |
| `/api/operations/:id/undo` | POST | `undoContainerOperation(id)` |
| `/api/operations/transaction` | POST | `beginTransaction(containerRid, type, desc)` |
| `/api/operations/transaction/:id/execute` | POST | `executeInTransaction(txId, type, params)` |
| `/api/operations/transaction/:id/commit` | POST | `commitTransaction(txId)` |
| `/api/operations/transaction/:id/rollback` | POST | `rollbackTransaction(txId)` |

参数化路由需在 `matchRoute` 补充正则（参照现有 automations/containers 的写法，
serve.cjs:2796-2805）。

**步骤 B：@lo/client 加 operations namespace**

`src/client.cjs` 新增 `createOperationsApi(client)` + 构造器挂载 `this.operations`：

```js
operations: {
  execute(type, params, context)   → POST /api/operations
  list(query)                      → GET /api/operations
  get(id)                          → GET /api/operations/:id
  undo(id)                         → POST /api/operations/:id/undo
  beginTransaction(containerRid, type, desc) → POST /api/operations/transaction
  executeInTransaction(txId, type, params)   → POST /api/operations/transaction/:id/execute
  commit(txId)                     → POST /api/operations/transaction/:id/commit
  rollback(txId)                   → POST /api/operations/transaction/:id/rollback
}
```

补 `types/index.d.ts` 的 OperationsApi 类型。

**步骤 C（可选，后续）：lo-agent 语义化别名**

lo-agent 的 `lo-core.cjs` 新增 `executeOperation(type, params)` 透传——本 Phase 1 可暂缓，
因为 lo-agent 当前用 notes 兼容层已够（见 005）。

### 1.3 可直接暴露的 operation vs 需整理

| 类别 | operation | 直接暴露？ |
|---|---|---|
| 直接 | `resource.*` / `relation.*` / `schema.*` / `view.*` / `automation.*` | ✅（handler.execute 已就绪，params 即 handler 入参） |
| 直接 | `member.*`（12 种） | ✅ |
| 直接 | `workflowTransition` | ✅ |
| 注意 | `resource.create` 的 params 是 `{type, path, metadata, name, capabilities}` | 与 `POST /api/notes` 的 body 不同，客户端需用 operation 语义传参 |
| 待确认 | `member.*` 是否需 containerRid 校验 | handler 已处理 |

### 1.4 验证

```bash
# Core 单测（lo 仓库）
npm test --testPathPattern=operation
# 手工验证
curl -X POST localhost:8765/api/operations -H 'Authorization: Bearer <token>' \
  -d '{"type":"relation.create","params":{"fromRid":"res_1","toRid":"res_2","type":"reference"}}'
# SDK 测试（lo-client-sdk）
npm test --testPathPattern=operations
```

---

## 2. Event API

### 2.1 现状（代码实测）

| 层 | 已有 | 缺 |
|---|---|---|
| Core 内部 | EventBus（emit + middleware）、EventStore（save/query/get/count/typeStats/replay）、EventRegistry（builtins） | 事件由 repo 手动 emit、**与 Operation 未绑定**（001 §7） |
| HTTP | 无 SSE / 无 `/api/events` | 全部缺失 |
| @lo/client | 无 events namespace | 全部缺失 |
| lo-agent | — | — |

### 2.2 方案

**步骤 A：Core 加 HTTP Event Stream**

在 serve.cjs 新增 SSE 端点。SSE 不能走现有 `jsonOk`，需自定义响应：

```js
// GET /api/events/stream?subscribe=resource.created,relation.created
route("GET", "/api/events/stream", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const filters = (url.searchParams.get("subscribe") || "").split(",").filter(Boolean);
  const listener = (event) => {
    // event: { type, payload, source, metadata }
    if (filters.length && !filters.includes(event.type)) return;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  repo.onEvent("*", listener);   // 需确认 EventBus 是否支持通配或逐个注册
  req.on("close", () => repo.removeEventListener(listener));
});
```

> 需要确认 EventBus 的订阅 API（`bus.on(type, handler)` 是否支持通配符 `*`）。
> 若不支持，改为订阅全部已注册类型或维护订阅集合。

同时新增事件历史端点：

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/events` | GET | `repo.getEventHistory(query)`（EventStore.query 已有） |
| `/api/events/stream` | GET | SSE 实时订阅 |

**步骤 B：事件与 Operation 绑定（可选，本阶段可延后）**

001 §7 定义的"OperationEngine 统一 emit"是**收敛项**，工作量大、涉及存量代码。
本 Phase 1 的 Event API 先做**透传现有事件**（repo.emitEvent 已有的事件），
保持现状事实源，暂不迁移。将"Operation 绑定"标记为 **Phase 2** 待办。

**步骤 C：@lo/client 加 events namespace**

```js
events: {
  subscribe(types, handler)  // SSE 包装：fetch + ReadableStream 解析，自动重连
  history(query)             // GET /api/events
}
```

> 零运行时依赖约束：SSE 客户端用 Node 原生 `http.request` + 流解析（不引第三方 SSE 库）。

### 2.3 验证

```bash
# 手动：开一个订阅终端
curl -N localhost:8765/api/events/stream?subscribe=resource.created
# 另一终端触发创建
curl -X POST localhost:8765/api/notes -d '{"title":"x"}'
# 订阅端应收到 event: resource.created
```

---

## 3. Relation API

### 3.1 现状（代码实测）

| 层 | 已有 | 缺 |
|---|---|---|
| Core 内部 | relationService（create/remove/update/getById/list 软删 metadata）+ repo.createRelation/removeRelation/updateRelation/getRelation/listRelations/getRelations（均经 operationEngine） | — |
| HTTP | `GET /api/admin/relations`（admin）· `DELETE /api/admin/relations/:id`（admin） | 无普通 `GET /api/relations`；无 create/update；查询在 admin 下 |
| @lo/client | `admin.relations.list` / `admin.deleteRelation` | 无 `relations` namespace |
| lo-agent | — | — |

### 3.2 方案

**步骤 A：Core 加普通 Relation 端点（非 admin）**

| 端点 | 方法 | handler |
|---|---|---|
| `/api/relations` | GET | `repo.listRelations(filter)` |
| `/api/relations/:id` | GET | `repo.getRelation(id)` |
| `/api/relations` | POST | `repo.createRelation(from, to, type, metadata)` |
| `/api/relations/:id` | PUT | `repo.updateRelation(id, updates)` |
| `/api/relations/:id` | DELETE | `repo.removeRelation(id)` |

> 这些端点走 SSH 会话认证（非 admin），因为是普通业务能力而非管理能力。
> 鉴权层会自动处理（serve.cjs 中非 `/api/admin/*` 走 SSH 校验）。

**步骤 B：@lo/client 加 relations namespace**

```js
relations: {
  list(query)      → GET /api/relations
  get(id)          → GET /api/relations/:id
  create(from,to,type,metadata) → POST /api/relations
  update(id, updates) → PUT /api/relations/:id
  remove(id)       → DELETE /api/relations/:id
}
```

补 types/index.d.ts。

### 3.3 验证

```bash
curl -X POST localhost:8765/api/relations -H 'Authorization: Bearer <token>' \
  -d '{"from":"res_1","to":"res_2","type":"reference"}'
curl localhost:8765/api/relations
```

---

## 4. 两个小问题

| 问题 | 决定 | 依据 |
|---|---|---|
| `notes.upload` | **暂缓**，仅当 lo-agent 需文件导入时补。Phase 1 不引入，避免扩大范围。 | 009 §7 |
| `auth/reload` | **不进公共 API**。属管理能力，保持 SDK 不暴露。 | 009 §7 |

---

## 5. 实施顺序与验证（汇总）

| 顺序 | 能力 | Core 修改 | SDK 修改 | 验证 |
|---|---|---|---|---|
| 1 | Relation | serve.cjs 加 5 端点 | client.cjs 加 relations namespace + types | SDK 单测 + curl |
| 2 | Operation | repository.executeOperation + serve.cjs 8 端点 | client.cjs 加 operations namespace + types | SDK 单测 + curl（relation.create） |
| 3 | Event | serve.cjs SSE + /api/events | client.cjs 加 events namespace + types | 双终端 SSE 验证 |

> 顺序理由：Relation 最薄、风险最低，先打通"写操作经 Operation 链路"的端到端；
> Operation 其次（依赖 executeOperation 暴露）；Event 最后（SSE 实现相对独立，且需确认
> EventBus 通配订阅）。

## 6. 修改文件清单

**lo（`log` 仓库）**
- `src/repo/repository.cjs`：+`executeOperation`
- `src/commands/serve.cjs`：+Relation/Operation/Event 路由 + matchRoute 正则

**lo-client-sdk**
- `src/client.cjs`：+`operations`/`relations`/`events` namespace
- `types/index.d.ts`：+对应类型
- `test/client.test.cjs`：+三组用例

**lo-agent**
- Phase 1 无强制改动（可选：lo-core.cjs 加 `executeOperation`/`relations` 透传，待 lo-agent
  下一阶段实际消费时再加，避免空接口）

## 7. 明确的边界

- 本计划**不引入** Agent Runtime / Agent Plugin Runtime / Sandbox。
- `@lo/client` 保持独立，新增 namespace 是纯协议映射。
- Event 的 Operation 绑定归 Phase 2，本阶段只做事件透传通道。
- 不触碰 Core Plugin System / Resource / Relation / Operation / Event 内部模型。

## 8. 本计划之外的后续（记录）

- Phase 2：事件与 Operation 绑定（OperationEngine 统一 emit）
- Phase 3：lo-agent 消费 operations/events/relations（UI 与状态同步）
- 之后：lo-agent-plugins-sdk 宿主接入（Agent Plugin Runtime）
