# 001 · Execution Context Protocol

> 状态：v0.1 · 草案（待拍板 4 个决策点）
> 范围：lo Core 统一调用协议
> 所属系列：lo Core 对外能力协议

---

## 1. 定位

Execution Context 是 **所有外部行为进入 lo Core 的统一入口参数**。它不是 Operation 的附属字段，
而是一次调用生命周期内贯穿全链的标准对象。

```
External Caller
     │  (HTTP / CLI / Agent / Plugin / Automation)
     ▼
Execution Context    ← 本次调用的"谁、从哪、为何、允许吗"
     ▼
Capability Layer     ← Operation API / repo 方法
     ▼
OperationEngine      ← 状态变化事实记录
     ▼
World Model          ← Resource / Relation / Workflow / Schema / View
     ▼
Event Stream         ← 事实变化后的广播
```

**设计约束（最重要的一条）**：所有能力调用必须以 context 为标准参数，禁止各模块自行拼装
`{actor, pluginId, automationId}`。

```js
operationEngine.execute(type, params, context)   // 统一形态
```

## 2. 生命周期

Context 是一次**外部调用**的伴随对象：

```
进入边界(创建) → 沿调用链传递 → 随 Operation 落快照 → 调用返回(销毁)
```

- **创建点**：外部调用首次进入 Core 的边界。HTTP 在路由鉴权后创建，CLI 在命令解析后创建，
  Agent/Plugin/Automation 在运行时桥接处创建。
- **存活期**：仅本次调用链。不跨调用持久存在，不存为长期实体。
- **快照**：每次 Operation 执行时，把当时的 context 序列化为 snapshot 存入 OperationRecord，
  用于审计/追溯。
- **销毁**：调用链结束后丢弃，对象不可复用。

> 为什么不做成长期实体：Context 表达的是"一次调用的瞬时事实"，长期存储反而是
> OperationRecord 的职责。二者不混。

## 3. 字段定义

### 3.1 `actor` —— 谁（最终行为主体）

表示**行为责任的最终归属**。沿调用链通常不变。

```json
{
  "actor": {
    "type": "user | agent | plugin | automation | system",
    "id": "user_xxx | agt_xxx | plg_xxx | auto_xxx | cli"
  }
}
```

| type | id 语义 | 示例 |
|---|---|---|
| `user` | 用户身份 | `user_alice` |
| `agent` | Agent 身份（agent 自主执行时） | `agt_research` |
| `plugin` | 插件身份（插件直接调用时） | `plg_star-map` |
| `automation` | 自动化任务身份 | `auto_daily-report` |
| `system` | 系统内部 / CLI | `cli` |

> 嵌套调用时 actor 取**链根的行为主体**，见 §6。

### 3.2 `source` —— 哪个系统入口（调用入口）

表示**行为从哪个入口进入 Core**。同一 actor 可从不同入口调用。

```json
{
  "source": {
    "type": "http | cli | agent | plugin | automation",
    "id": "http://…:8765 | lo-cli | agt_xxx | plg_xxx | auto_xxx",
    "detail": "POST /api/operations | lo graph link"
  }
}
```

`detail` 记录具体端点/命令，便于定位入口。

### 3.3 `trace` —— 这次行为链路

表示调用链与父链关系，用于追溯、undo 链、分布式追踪。

```json
{
  "trace": {
    "requestId": "req_9f3a…",
    "parentId": null,
    "chain": [
      { "kind": "agent",  "id": "agt_research" },
      { "kind": "action", "id": "auto_…/step_2" },
      { "kind": "plugin", "id": "plg_star-map" }
    ]
  }
}
```

| 字段 | 含义 |
|---|---|
| `requestId` | 本次最外层调用的唯一 ID（在入口生成） |
| `parentId` | 父 Operation 或父调用的 ID（嵌套时）；最外层为 `null` |
| `chain` | 自顶向下的调用链，每级标注 kind+id |

### 3.4 `permission` —— 是否允许

表示**本次调用的授权结果**，由入口的鉴权层填充。

```json
{
  "permission": {
    "decision": "allow | deny | require_approval",
    "subject": "user_alice",
    "operations": ["relation.create", "resource.update"],
    "note": "denied by role:readonly"
  }
}
```

| 值 | 含义 |
|---|---|
| `allow` | 直接执行 |
| `deny` | 拒绝（OperationEngine 前置拦截） |
| `require_approval` | 转 Suggestion 管线（复用现有 HIGH_RISK 机制） |

> `permission.operations` 是本次调用被允许的 Operation 白名单；OperationEngine 在执行前校验，
> 不属于白名单则拒绝。`permission` 是**输入校验信息**，不是 Operation 自己计算的结果。

### 3.5 `metadata` —— 扩展信息

任意的、不破坏结构的附加信息（客户端透传、调试标签等）。

```json
{
  "metadata": {
    "uiSession": "sess_…",
    "reason": "用户点击星图节点",
    "custom": {}
  }
}
```

## 4. 注入规则

每个入口有**唯一**的 context 创建责任，且**必须**在能力调用前填充 `actor` + `source`：

| 入口 | 创建者 | actor 来源 | source 来源 |
|---|---|---|---|
| HTTP | 路由鉴权层 | token 解析出的用户身份 | `http` + 端点 |
| CLI | 命令 handler 启动 | 本地用户 / `--actor` 参数 | `cli` + 命令名 |
| Agent | Agent Runtime | agent 自身或触发用户 | `agent` + agentId |
| Plugin | Plugin Runtime | 插件 ID | `plugin` + pluginId |
| Automation | ActionExecutor | 触发者（用户/agent）或 automation | `automation` + automationId |

**硬性规则**：

- `actor` 和 `source` 在入口层**必须**由 Core 侧填充，**不允许外部调用者伪造**（HTTP 场景由 token
  决定，不读请求体）。
- 能力层（Operation API / repo 方法）不得自行构造 context，只能透传。

## 5. 嵌套调用规则

Agent / Automation / Plugin / Operation 的嵌套场景，需要**同时保留"最终主体"和"直接调用者"**：

```
Agent(agt_research)
  → Automation(auto_daily)
    → Plugin Action(plg_star-map)
      → Operation(relation.create)
```

**规则**：

- **actor = 链根的行为主体**：上例中如果 Agent 由用户触发，`actor = user_alice`；如果 Agent 自主
  执行，`actor = agt_research`。actor 由最外层入口决定后**沿链不变**。
- **直接调用者 = 链尾**：Operation 执行时，`trace.chain` 的最后一跳是直接调用者（`plg_star-map`）。
- **parentId = 直接父调用**：Operation 记录 `parentId` 指向触发它的上一层（可能是父 Operation、
  action、plugin 调用）。
- **chain 每次调用追一跳**：内层调用继承外层 context，并在 `trace.chain` 末尾追加自己。

这样查询"这个关系谁创建的"：看 `actor`（责任主体）+ `trace.chain`（完整链路）+ `parentId`（直接上级）。

## 6. 与 OperationRecord 的关系

**Context 不属于 Operation，Operation 只保存 context 快照。**

OperationRecord 在现有 `container_operations` 基础上增加一列（或替代现有 `actor` 列）：

```json
{
  "operation_id": "op_abc",
  "type": "relation.create",
  "params": { "fromRid": "res_1", "toRid": "res_2", "type": "reference" },
  "before": {},
  "after": { "id": 7 },
  "status": "success",
  "parent_operation_id": null,
  "context_snapshot": {
    "actor":     { "type": "user", "id": "user_alice" },
    "source":    { "type": "plugin", "id": "plg_star-map", "detail": "http POST /api/operations" },
    "trace":     { "requestId": "req_…", "parentId": null, "chain": [] },
    "permission": { "decision": "allow", "operations": ["relation.create"] },
    "metadata": {}
  },
  "created": 1750000000000
}
```

- Operation **不关心** context 里"是不是插件调的"——它只记录 `type + params + before/after +
  status + context_snapshot`。
- 追溯"谁/从哪/为什么"从 `context_snapshot` 读，而不是从 operation 类型推断。

## 7. 与 Event 的关系

**Event 是 Operation 的事实广播，由 OperationEngine 统一发出，不在 service 层分散 emit。**

```
OperationEngine.execute()
   → 写 OperationRecord(success)
   → 依 operation type 映射事件名
   → EventEmitter.emit(事件, { operationId, context_snapshot, payload })
   → resource.created / relation.created / workflow.completed …
```

**硬性规则**：

- 只有经 OperationEngine 成功的事实变化才会产生事件（消除当前"事件发生但无 Operation 记录"
  的双源头问题）。
- 每个事件携带 `operationId` + `context_snapshot`，消费方可回溯到 Operation 和调用者。
- 事件映射：`resource.create → resource.created`、`relation.create → relation.created` 等，
  由 Operation type 到事件名的固定映射表定义。
- 纯读操作（无状态变化）不产生事件。

## 8. Agent / Plugin / Automation 使用方式

三者都是**协议消费者**，不自己成为写入口：

```
Plugin:
  lo-client-sdk
    → 携带 context 调 Operation API
    → OperationEngine → Core
Automation:
  ActionExecutor
    → 从 automation 定义构造 context
    → OperationEngine → Core
Agent:
  Agent Runtime
    → 构造 context(actor=触发用户或 agent)
    → OperationEngine → Core
```

- 三者与 CLI/HTTP 是**同一套协议**，只是 context 的注入来源不同（见 §4）。
- 三者改变世界状态都落为 Operation，由 OperationRecord + Event 统一追踪。
- 禁止插件/agent/automation 绕过 OperationEngine 直接改 service（当前 plugin action 直调
  handler 的路径需收敛）。

---

## 9. 待拍板决策点

1. **`actor` 在自动化自主执行时的取值**：automation 由用户触发 → `actor=user`；纯定时任务 →
   `actor=automation`？还是始终保留"最后人工"？
2. **`permission.operations` 白名单粒度**：按 operation type（粗）还是按资源级条件（细）？
3. **Operation 映射事件的表**：是否就按 `operation type → 事件名` 的 1:1 固定表，还是允许操作内
   自由选择是否发事件？
4. **现有 `emitEvent` 手动调用**是否全部迁移到 OperationEngine 统一发（涉及不少存量代码路径）？
