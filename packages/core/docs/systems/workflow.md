## Workflow 过程模型系统

### 一、定位

Workflow 是 lo 核心的**过程模型系统**，与 Resource、Schema、View 一样是独立的一等系统。**状态机是其核心执行模型，但不是全部**——Workflow 描述的是"某类对象、事件或过程在现实中的变化规律"，除状态流转外还承载事件输出、条件声明，为未来 Automation / Agent 提供运行规则。

它描述的是：

> 某类对象、事件或过程在现实中的变化规律。

Workflow **不属于** Resource，不是 Resource 的字段扩展，也不是简单的状态字段管理。
Resource 是 Workflow 的主要参与对象，但不是唯一参与对象。
Workflow **不属于** Schema——Schema 定义对象"是什么"，Workflow 定义对象"如何变化"，两者解耦。

### 二、核心对象模型

```
Workflow Definition (规则)
        |
        v
Workflow Instance  (参与过程)
        |
        v
Resource           (参与对象)
```

**Workflow Definition** 描述一个通用流程，不绑定具体资源。
例如 `BookReadingWorkflow` 描述"一本书如何从未读到完成"。

**Workflow Instance** 是某个 Resource 参与该流程的具体过程，追踪当前状态。

**关键原则：状态属于 Workflow Instance，不属于 Resource 本身。**

```
错误:  resource.metadata.status = "done"     ← 直接修改状态（禁止）
正确:  workflow.transition(resource, "done")  ← 唯一合法入口
```

### 三、Workflow Definition

```json
{
  "id": "task",
  "name": "任务流程",
  "description": "任务从待办到完成的状态流转",
  "version": 1,
  "applicableSchemas": [],
  "states": [
    { "id": "todo", "name": "待办" },
    { "id": "doing", "name": "处理中" },
    { "id": "done", "name": "完成" }
  ],
  "transitions": [
    { "id": "start",  "from": "todo",  "to": "doing", "name": "开始处理" },
    { "id": "finish", "from": "doing", "to": "done",  "name": "完成" },
    { "id": "reopen", "from": "done",  "to": "todo",  "name": "重新打开" }
  ]
}
```

| 组件 | 说明 |
|------|------|
| `version` | 定义版本。实例创建时记录该版本（`workflow_version`）。**结构变化（states/transitions）必须升版**，升版时冻结一份定义快照（类似 Git tag），历史实例始终可用对应版本的冻结定义解释 |
| `applicableSchemas` | **可选**作用域限制（白名单）：空数组 = 不限制（无需建立 Schema 世界，任何 Resource 可加入）；非空 = 只允许绑定了指定 Schema 的 Resource 加入。语义是"可以作用于"，**不是"属于"**——Workflow 与 Schema 解耦 |
| `states` | 阶段列表。State：`{ id, name?, description?, metadata? }`，状态只描述位置，不修改 Resource |
| `transitions` | 允许的变化。Transition：`{ id?, from, to, name?, rules[], events[], actions?, metadata? }` |
| `rules` | 转换规则，**只负责判断，不负责执行**（Condition）。全部通过才允许转换 |
| `events` | 转换完成时对外发出的**业务事件**类型（如 `BookReadingFinished`），作为与外部系统（Automation / Agent）连接的接口 |
| `actions` | **预留声明**。动作执行归属 Automation，Workflow 只声明不执行（Condition 属于 Workflow，Action 属于 Automation） |

多个 Resource 可复用同一个 Workflow；一个 Resource 可同时参与多个不同 Workflow。
一个 Workflow 可适用于多个 Schema（如 TaskWorkflow 适用于 Task / Issue / Bug），通过 `applicableSchemas` 声明。

### 三·五、定义版本与快照（Workflow Definition Versioning）

定义可以演进（类似 Git），每个版本冻结一份定义快照，供历史实例解释：

```
Workflow 'task'
  v1  { states: [todo, doing, done],                transitions: [todo→doing, doing→done, done→todo] }
  v2  { states: [todo, doing, review, done],        transitions: [..., doing→review, review→done]     }
```

- 创建定义 → 冻结 `v1` 快照
- 结构变化（states/transitions/applicableSchemas 变更）→ 显式升版 `--version N`，冻结 `vN` 快照；**同一版本重复保存会更新该版本的快照内容，历史更高版本不受影响**（`workflow_definition_versions` 以 `(workflow_id, version)` 为主键）
- **实例的 `workflow_version` 在每次 transition 时更新为当时的定义版本**：v1 创建、定义升到 v2 后该实例一旦发生转换，其记录的版本会变为 2。因此冻结快照主要服务于"转换历史可回溯"（每条转换日志配合当时的定义版本解释），而不是"实例永久钉在创建版本"
- 查询：`repo.getWorkflowVersion(id, version)` / `repo.listWorkflowVersions(id)`；CLI `lo workflow versions <id> [--version N]`

### 四、Workflow Instance

状态属于实例而非 Resource：

```
Workflow:  BookReadingWorkflow        states: unread → reading → finished

实例A: 战争与和平 → currentState: reading
实例B: 三国演义   → currentState: finished
```

**同对多实例（历史真实性）：** 同一 `(workflow_id, resource_rid)` 对可存在多条历史实例，但**同一时刻仅一条 active**。

- `attach`：已有 active 实例 → 复用；存在 detached/completed 历史 → **创建新实例**（如一本书两次阅读 = 两条实例，不覆盖第一次）
- `detach`：结束当前实例（标记 detached，历史保留）
- `resume`：**恢复**已 detached 实例为 active（保留当前状态与历史）——恢复用 resume，重新参与用 attach

**实例生命周期（status）：**

| status | 含义 |
|--------|------|
| `active` | 参与中（可转换） |
| `detached` | 解除参与关系（`detach` 标记，**历史保留**，可用 `resume` 恢复） |
| `completed` | 到达终态（目标状态无任何出边）自动标记 |
| `cancelled` | 流程取消（预留，可由上层显式设置） |

**版本记录：** 实例创建时记录当时的 `workflow_version`；每次 `transition` 会把实例的 `workflow_version` 刷新为当前定义版本（`workflowEngine.cjs` 在更新实例时写入 `workflow.version`）。因此定义升版后，未再转换的旧实例保留创建版本，已转换的实例记录为转换时刻的定义版本。每条转换日志可配合当时版本的冻结快照解释其合法性。

### 五、Transition 校验流程

```
用户 / Agent / Automation
        |
        ↓
请求 Workflow Transition (instanceId | resource + workflow, targetState)
        |
        ↓
Workflow 校验:
  - 解析实例（instanceId 优先；也可按 resource + workflow 便捷查找）
  - 实例存在且 status=active
  - 目标状态存在
  - from → to 转换合法（在 transitions 中定义）
  - 规则通过（rules 全部为真，Condition）
  - 权限检查（预留 hook，本轮默认放行，记录 actor）
        |
        ↓
允许
        |
        ↓
生成事件（通用完成事件 + transition 内嵌自定义事件 + 到达终态时完成事件）
        |
        ↓
更新 Workflow Instance（含 status：到达终态 → completed）
```

### 六、事件

状态变化产生事件（供 Automation / Agent / View / 外部插件消费）。事件是 Workflow 与外部系统连接的接口。

**事件分两类，不混合：**

**① 系统事件（引擎产生，类型固定，前缀 `Workflow`）：**

```
WorkflowInstanceCreated       Resource 加入 Workflow（创建新实例）
WorkflowTransitionCompleted   状态转换完成
WorkflowInstanceCompleted     实例到达终态完成
WorkflowInstanceDetached      Resource 解除参与关系（历史保留）
WorkflowInstanceResumed       Resource 恢复已 detached 的实例
```

**② 业务事件（用户定义，transition 声明）：**

```
{ "from": "reading", "to": "finished", "events": ["BookReadingFinished"] }
```

- 业务事件类型由 Workflow Definition 的 `transition.events` 声明，如 `BookReadingFinished` / `ProjectReleased`
- 转换完成时由引擎动态 emit，payload 与完成事件一致并附加 `workflowName`
- **业务事件不得使用系统事件保留名**（`Workflow*` 前缀为系统保留），定义校验会拒绝冲突
- Automation 监听业务事件触发动作，Agent 订阅系统事件（如 `WorkflowInstanceCompleted`）制定下一步策略

`WorkflowTransitionCompleted` payload：

```json
{
  "workflowId": "task",
  "resourceRid": "res_xxx",
  "instanceId": "wfinst_xxx",
  "from": "todo",
  "to": "doing",
  "actor": "cli",
  "version": 1,
  "transitionId": "start",
  "timestamp": 1700000000000
}
```

### 七、模块结构

| 模块 | 职责 |
|------|------|
| `workflow.cjs` | Workflow 定义模型（states/transitions 校验、version、applicableSchemas、系统事件保留名校验、序列化）|
| `workflowInstance.cjs` | Workflow 实例模型（workflowVersion、生命周期 status）|
| `workflowEngine.cjs` | 过程模型引擎：attach / resume / detach / transition / canTransition，事件输出 |
| `workflowRegistry.cjs` | 定义注册表（create / update / remove(软删) / hardRemove(物理删) / load / 版本快照）|
| `workflowStore.cjs` | 定义、版本快照、实例、转换日志持久化 |
| `ruleEngine.cjs` | 转换规则求值（Condition：支持 resource metadata 引用、比较、逻辑运算）|

### 七·五、内部服务 API（面向 Automation / Agent）

Workflow 是事件产生者、状态变化的唯一合法入口，未来成为服务被 Automation / Agent 调用。引擎提供**服务命名**的公开接口，CLI 保持人类友好命名：

| 服务 API（引擎） | 语义 | CLI 友好别名 |
|------------------|------|--------------|
| `createDefinition(def)` | 创建定义 | `lo workflow create` |
| `createInstance(rid, wfid, opts)` | 创建实例 | `lo workflow attach` |
| `executeTransition(opts)` | 状态转换 | `lo workflow transition` |
| `resume(instanceId, opts)` | 恢复 detached 实例 | `lo workflow resume` |
| `emitEvent(type, payload)` | 对外事件输出（事件产生者接口） | — |

示例：Agent 判断"这篇文章已掌握"，调用 `Workflow.executeTransition({ resourceRid: article.rid, workflowId: LearningWorkflow.id, targetState: 'mastered' })`；Workflow 校验并转换成功 → 产生 `KnowledgeMastered` 业务事件 → Automation 监听后生成复习任务。Workflow 不直接修改 Resource，只产生事件，边界清晰。

> 引擎服务方法统一以 `opts` 对象传参：`createInstance(rid, wfid, opts)` / `executeTransition(opts)` / `resume(instanceId, opts)`。`executeTransition` 需要 `{ resourceRid, workflowId, targetState, actor?, metadata? }`（也可直接传 `{ instanceId, targetState }`）。

### 八、删除策略

Workflow 定义状态为 `active` / `inactive` / `deprecated`：

- `active` — 正常可用（可加入实例、可转换）
- `inactive` — 停用（`lo workflow update <id> --status inactive`），**不可**加入新实例、禁止转换，定义与历史保留
- `deprecated` — 软删除标记（见下）

Workflow 是**知识资产**，删除默认软删除：

- `repo.deleteWorkflow(id)` → `status = deprecated`，**保留**定义与全部实例/历史（实例不可再转换/加入）
- `repo.purgeWorkflow(id)` → 物理删除（定义 + 实例/日志级联删除），仅显式清理时使用
- CLI：`lo workflow rm <id>` 默认软删；`lo workflow rm <id> --purge` 彻底删除

### 九、Repository API

```js
repo.createWorkflow(def)              // 创建定义（冻结 v1 快照）
repo.updateWorkflow(id, patch)        // 更新定义（结构变化时显式升版，冻结新快照）
repo.deleteWorkflow(id)               // 软删除 → deprecated（保留历史）
repo.purgeWorkflow(id)                // 物理删除（级联实例/日志）
repo.listWorkflows()                  // 列出定义
repo.getWorkflow(id)                  // 获取定义
repo.getWorkflowVersion(id, version)  // 获取指定版本的冻结定义快照
repo.listWorkflowVersions(id)         // 列出版本快照

repo.attachWorkflow(rid, wfid, opts)  // Resource 加入（复用 active；历史开新实例；校验 applicableSchemas）
repo.detachWorkflow(instanceId)       // 解除参与关系（软删 → detached）
repo.resumeWorkflow(instanceId)       // 恢复 detached 实例为 active
repo.transitionWorkflow(opts)         // 状态转换（唯一合法入口，面向 Instance）
repo.canTransitionWorkflow(opts)      // 预检
repo.listWorkflowInstances(filter)    // 实例列表（可按 status 过滤）
repo.getWorkflowInstance(id)          // 实例详情
repo.getWorkflowHistory(filter)       // 转换历史
```

内置示例工作流：`task`（todo → doing → done，可重新打开）。

---

**相关文档：**

- [事件总线](event.md) — Workflow 状态变化事件的基础
- [View](core/view.md) — 未来 View 可自动读取 Workflow 状态生成看板列
- [Schema](core/schema.md) — Schema 是 Workflow 的参与条件（applicableSchemas 可选作用域），两者解耦
