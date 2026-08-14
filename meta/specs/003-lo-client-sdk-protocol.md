# 003 · lo-client-sdk Protocol

> 状态：v0.1 · 草案
> 范围：`@lo/client` 的职责边界与协议映射
> 上游基准：001 Execution Context Protocol（已确定）· 002 Capability Protocol（已确定）
> 所属系列：lo Core 对外能力协议

---

## 1. 定位

`@lo/client` 是 **lo Core 协议客户端**：它消费 `log serve` 的 HTTP 协议，为
lo-agent / Agent Plugin / 第三方脚本提供类型化调用面。

**职责边界（已确定约束）**：

- **不拥有业务模型**：不保存 Resource/Relation 状态，不建立自己的数据真相。
- **不复制 Core 能力**：只做"协议 → 方法"的映射，不重实现查询/校验逻辑。
- **语义化方法可以存在**：如 `resources.create` 可保留，但内部映射到
  `operations.execute`（见 002 §6.2）。
- **零运行时依赖**：纯 Node 原生 http/https，无第三方库。
- **纯 CJS**：`.cjs`，附带 `types/index.d.ts` 类型声明。

## 2. 现有实现盘点（代码实测）

`@lo/client` 现状（src/ 结构）：

```
src/
  index.cjs   # 出口：LoClient / AuthClient / LoApiError / LoHttpError / signWithSshKeygen / SDK_VERSION
  client.cjs  # LoClient：请求管线 + 命名空间
  http.cjs    # 底层请求（超时/重定向/JSON/错误转换）+ LoHttpError/LoApiError
  auth.cjs    # SSH 挑战-应答认证（signWithSshKeygen + AuthClient）
```

### 2.1 请求管线（client.cjs / http.cjs）

- `request(method, path, query, options)`：拼接 `baseUrl + path + buildQuery`，注入 token。
- **token 注入规则**（client.cjs:77-89）：
  1. `/api/admin/*` → 若设 admin token 用 `Bearer <adminToken>`，优先于 SSH token
  2. 否则若 `auth.authenticated` → `Bearer <auth.token>`
  3. 否则若 `_token` → `Bearer <_token>`
  4. `options.skipAuth` 跳过注入（`/api/auth/*` 用）
- **查询构造** `buildQuery`：跳过 undefined/null，数组展开为多个，URL 编码。
- **transport 注入**：构造时可注入 `transport(ctx)` 用于测试/代理（HTTP 协议可整体替换）。
- **超时**：默认 15s，可配；**重定向**：最多 5 次跟随。

### 2.2 错误模型（http.cjs，已有 · 不重新设计）

| 类型 | 含义 | 属性 |
|---|---|---|
| `LoHttpError` | 连接层/超时/重定向超限 | `code`（`ERR_REQUEST` / `timeout` / `too_many_redirects`）、`cause` |
| `LoApiError` | 服务端业务错误（≥400 且带 `{ error }`） | `status`、`body`、`code` |

转换规则（http.cjs:120-133）：非 2xx 且响应体含 `error` 字段 → `LoApiError`；否则按状态码。

### 2.3 认证（auth.cjs，已有 · 不重新设计）

SSH 挑战-应答：

```
POST /api/auth/challenge → { nonce, namespace, registeredKeys }
ssh-keygen -Y sign -f <key> -n lo-cli <nonce>   （签名函数可注入）
POST /api/auth/login { nonce, fingerprint, signature } → { token }
```

- 登录后 `auth.token` 自动附加到请求头。
- `signWithSshKeygen` 可替换为自定义 `signer`（libSSH 等）。
- 支持从 `privateKeyPath` 自动推导 `.pub` 指纹。

### 2.4 现有命名空间（client.cjs 实测）

`notes / search / schemas / views / workflows / automations / evolution / sync / admin / health`

**缺失**：`operations`、`events`、Relation 写。

## 3. 职责边界（正式定义）

| 属于 SDK | 不属于 SDK |
|---|---|
| HTTP 协议 → 方法映射 | 业务校验（type 合法性、metadata schema） |
| context 透传（不伪造，见 §6） | 世界模型持有（Resource/Relation 真相） |
| 错误归类（LoApiError/LoHttpError） | 数据缓存/持久化 |
| token/认证管理 | 重实现 Core 查询逻辑 |
| 事件订阅（SSE 包装） | 权限决策（permission 由 Core 决定） |

**硬性规则**：

- SDK 方法签名 **1:1 映射 HTTP 协议**，协议 1:1 映射 Core 能力。
- SDK **不拼接** context 的 `actor/source/permission`——这些由宿主注入（见 §6）。

## 4. 命名空间设计（目标态）

基于 002 §6.1，结合现有实现收敛：

```
LoClient
├── operations : 写操作正式入口（新增）
│     execute(type, params, context) → POST /api/operations
│     list(query)                    → GET /api/operations
│     get(operationId)               → GET /api/operations/:id
│     undo(operationId)              → POST /api/operations/:id/undo
│     beginTransaction(...)          → POST /api/operations/transaction
│     executeInTransaction(txId, type, params, context)
│     commit(txId) / rollback(txId)
│
├── events     : 事件订阅（新增）
│     subscribe(types[], handler)    → SSE（自动重连）
│     history(query)                 → GET /api/events
│
├── resources  : 读 + 语义化写（收敛自 notes）
│     list / get / search            → GET（读，正式）
│     create / update / remove       → 语义别名，内部转 operations.execute
│
├── relations  : 关系查询 + 语义化写（新增写能力）
│     query(rid, query)              → GET /api/relations
│     create(from, to, type, meta)   → 语义别名 → operations.execute("relation.create")
│     remove(id)                     → 语义别名 → operations.execute("relation.remove")
│
├── schemas / views / workflows / automations
│     —— 读操作走 Queries API；写操作走 operations 语义别名（现状已存在，收敛）
│
├── search     : search(q)           （读，正式）
├── sync       : sync / push / pull  （已有，兼容）
├── health     : ping / stats / tags （已有，兼容）
├── admin      : 保留（兼容层，供管理工具，非 lo-agent 主路径）
└── auth       : challenge / login / logout（已有）
```

### 4.1 namespace 命名约定

- 读操作 → 直接方法（`list` / `get` / `search` / `query`）。
- 写操作 → 语义化别名，内部统一走 `operations.execute`。
- 操作类型 → `operations.execute("resource.create", ...)` 的 `type` 字符串，
  与 Core `operations/` 目录注册的 `handler.type` 完全一致（见 002 §3.3）。

## 5. API 与 HTTP 协议映射

| SDK 方法 | HTTP | 类别 |
|---|---|---|
| `resources.list(query)` | `GET /api/notes` | 读 · 正式 |
| `resources.get(rid)` | `GET /api/notes/:rid` | 读 · 正式 |
| `resources.search(q)` | `GET /api/search` | 读 · 正式 |
| `operations.execute(type, params, context)` | `POST /api/operations` | 写 · 正式 |
| `operations.undo(id)` | `POST /api/operations/:id/undo` | 写 · 正式 |
| `relations.query(rid, query)` | `GET /api/relations` | 读 · 正式（待上移出 admin） |
| `relations.create(...)` | → `operations.execute("relation.create")` | 写 · 语义别名 |
| `events.subscribe(types, handler)` | `GET /api/events/stream` | 订阅 · 正式 |
| `schemas.list(query)` | `GET /api/schemas` | 读 · 正式 |
| `views.run(id, body)` | `POST /api/views/:id/run` | 读/执行 · 见 002 §8-2 |
| `workflows.attach(...)` 等 | 现有端点 | 兼容（收敛） |
| `admin.*` | `/api/admin/*` | 兼容层 |

## 6. context 注入方式

基于 001 §4（入口层填充、客户端不伪造）：

- SDK 的 `operations.execute(type, params, context)` **接收** context，但**不构造**它。
- context 由 **lo-agent 宿主**在调用时填充：宿主从自身运行状态（当前用户、调用的 agent/
  plugin/automation 身份）构建 `{ actor, source, trace, permission, metadata }`。
- SDK 只负责把 context 序列化进请求体透传给 Core。
- 权限决策（permission）由 **Core 服务端**根据 token/鉴权层判定，SDK 不自行判断。
- 未注入 context 时，SDK 允许传空（由 Core 侧填充默认 system actor），但正式用法要求宿主提供。

## 7. Operation 调用方式

```js
const { LoClient } = require('@lo/client');
const client = new LoClient({ host: '127.0.0.1', port: 8765 });
await client.login({ privateKeyPath: '~/.ssh/id_ed25519' });

// 语义化写法（推荐）——内部映射到 operations.execute
await client.resources.create({ type: 'note', title: '星图', content: '...' });

// 等价于——
await client.operations.execute(
  'resource.create',
  { type: 'note', metadata: { title: '星图' }, content: '...' },
  context, // 由宿主注入
);
```

- `operations.execute` 返回 `{ operationId, result }`（对应 OperationRecord）。
- 写操作的**返回**是 Operation 结果，不是裸资源——撤销/审计以 `operationId` 为准。
- 事务：`beginTransaction → executeInTransaction ×N → commit` 对应 Core transactionEngine。

## 8. Event 订阅方式

```js
const unsub = await client.events.subscribe(
  ['resource.created', 'relation.created'],
  (event) => {
    // event = { type, operationId, context_snapshot, payload }
  },
);
```

- 底层为 SSE（`GET /api/events/stream`）。
- **自动重连**：断线重连 + 事件序号去重（若 Core 支持）。
- **取消订阅**：返回 `unsubscribe()`。
- 与 Operation 绑定：事件携带 `operationId` + `context_snapshot`（见 001 §7）。
- 事件区分（003 约束 2）：
  - **Domain Event**：Operation 派生（`resource.created` 等），携带 `operationId`。
  - **系统生命周期事件**：`plugin.loaded` / `sync.progress` 等，非 Operation 派生，不携带
    `operationId`。SDK 统一透传，调用方按 `event.kind` 区分。

## 9. 错误模型

沿用现有模型（不重新设计，见 §2.2），补充 Operation 语义：

| 场景 | 抛错类型 | 备注 |
|---|---|---|
| 连接失败/超时 | `LoHttpError` | 现有 |
| 业务拒绝（≥400） | `LoApiError` | 现有，`body.code` 可携带 Operation 错误码 |
| Operation 执行失败 | `LoApiError` | `body.operationId` 可定位失败记录（pending→failed） |
| 权限拒绝 | `LoApiError` | `status 403`，`body.code` 如 `permission_denied` |
| 撤销失败（非 success 状态） | `LoApiError` | Core 返回不可撤销原因 |

**建议**：`LoApiError` 增加可选 `operationId` 字段（在已有 status/body/code 之上），
不破坏现有调用方。

## 10. Core / SDK 版本兼容策略

- `@lo/client` 的 `SDK_VERSION` 用于诊断，不用于强绑定。
- **协议优先**：SDK 依赖的是 HTTP 协议的路径与方法形状，而非 Core 内部实现。
- **能力协商**：建议 Core 暴露 `GET /api/health` 或专用 `GET /api/capabilities`，返回
  支持的 Operation 类型与 Event 类型清单（对应 `operations/` 与 `eventRegistry` 列表）。
  SDK 启动时可查询并降级（如 Core 不支持 `events` 则 `subscribe` 抛明确错误）。
- **兼容层保留**：SDK 保留 `notes.*` / `admin.*` 兼容方法，但标记为 legacy；新代码用
  `resources/operations`。
- **语义版本**：`@lo/client` 遵循 semver；新增命名空间为 minor，破坏性签名为 major。

## 11. 已定决策（v0.1 拍板）

| # | 决策点 | 决定 |
|---|---|---|
| 1 | `operations.execute` 返回形态 | **`{ operationId, result }`**。lo 核心价值含追踪/撤销/审计，`operationId` 必须成为一等返回值。 |
| 2 | `resources.create` 等语义方法 | **保留**。SDK 面向开发者，不应要求所有调用者理解底层 Operation 类型；语义 API 是开发体验层，Operation 是协议事实层。 |
| 3 | `LoApiError.operationId` | **支持新增**。Operation 失败仍属可追踪事实，错误应能定位对应 OperationRecord。 |
| 4 | `/api/capabilities` | **建议保留**。lo-agent 等长期运行客户端需知道 Core 支持哪些能力，不应靠猜版本判断。 |
| 5 | SSE sequence | **记录为 Event 协议要求**。Event Protocol 中单独定义 sequence、断线恢复、`last-event-id`。 |

> 注：以上五项在编写 004+ 文档时视为已确定，不重复讨论。

