# 007 · lo Core Implementation Audit

> 状态：v0.1 · 实现审计
> 范围：lo Core（`lo` 仓库）当前实现状态
> 方法：以代码为准，区分"已稳定"与"内部实现"，不做未来设计
> 基准：001–006（已确定）

---

## 1. Resource 模型：唯一数据真相？

**结论：是，Resource 是统一数据真相，且已是一等模型。**

依据（`migrations/001_initial_schema.cjs`）：

- `resources` 表（line 11）：`rid / name / layer / type / path / hash / metadata /
  encrypted / created / updated / deleted / container_schema`。
- 唯一索引：`idx_resources_path_active`（同 path 仅一条活跃 layer-0）。
- `resource_tags` / `resource_capabilities` / `resource_schemas` 均外键关联 `resources.rid`。

**判定**：

| 维度 | 状态 |
|---|---|
| Resource 为唯一真相 | ✅ resources 表是唯一落库点 |
| type 语义 | ✅ `resource.type` + `typeRegistry`（插件可扩展 type） |
| metadata | ✅ JSON 字段，经 `validateMetadata` 校验 |
| 软删除 | ✅ `deleted` 字段 |
| 文件映射 | ✅ `path` + `hash`，`idx_resources_path_active` 保证一致性 |

**已稳定**：Resource 核心模型（rid/type/path/metadata/软删/索引）。

## 2. Relation：是否完全进入统一模型？

**结论：是，Relation 是统一模型，但能力完整度需注意。**

依据：

- `relations` 表（line 60）：`id / from_rid / to_rid / type / created / metadata /
  updated / deleted`，`UNIQUE(from_rid, to_rid, type)` + 软删。
- `relationService.cjs`：软删、metadata、按 id 精确操作、Hook 埋点
  （`beforeRelationCreate` 等）。
- `relation.create/update/remove` 均经 OperationEngine（repository.cjs:1616/1640）。

**判定**：

| 维度 | 状态 |
|---|---|
| 统一模型 | ✅ relations 表 + relationService |
| Operation 化 | ✅ `relation.create/update/remove` 均经 operationEngine |
| Hook 埋点 | ✅ before/afterRelation* |
| HTTP 写能力 | ❌ 无（admin 仅 list/delete，见 002） |

**结论**：Relation 模型已统一且 Operation 化，**但 HTTP 写面缺失**（外部消费者无法创建关系）。

## 3. OperationEngine 当前覆盖范围

**结论：覆盖广，但存在非 Operation 直写路径。**

依据（operations/ 目录自动加载 + repository 调用）：

**已 Operation 化**：
- `resource.create / update / delete / move`（repository.cjs:614/1495/1534/1569）
- `relation.create / update / remove`（1616/1672/1640）
- `schema.create / update / delete`（1696/1706/1717）
- `view.create / update / delete`（1727/1737/1748）
- `automation.create / update / remove`（3428/3443/3452）
- `member.*`（container 成员 12 种）
- `workflowTransition`

**OperationEngine 能力**（operationEngine.cjs 实测）：
- `execute`：pending → success/failed，before/after 快照
- `undo`：生成 `undo.<type>` 反向链，支持 redo
- `getHistory` / `getMemberHistory` / 系统历史
- 事务：`transactionEngine`（begin/execute/commit/rollback）

**未 Operation 化（直写或绕过）**：
- 部分 service 方法直接改库（需逐一确认，但存在）
- `importFile/importDirectory`：批量导入是否走 operationEngine 待确认
- 插件 action 直调 handler（plugin.cjs:20，见 008）
- workflow transition 之外的工作流内部状态变化

**判定**：OperationEngine 是**统一事实入口的主体**，但**存在少量绕过路径**（导入、插件 action）。

## 4. Event 系统当前状态

**结论：EventBus + 事件表 + 事件注册表已存在，但与 Operation 未绑定。**

依据：

- `events` 表（line 384）：`id / type / source / payload / metadata / created_at`。
- `eventBus.cjs`：`emit(event)` + before/after middleware。
- `eventRegistry.cjs`：内置事件定义（resource.*/relation.*/sync.*/plugin.*/…）。
- **关键问题**：事件由 **repo 层手动 `emitEvent`**（repository.cjs:641 `resource.created`），
  而非 OperationEngine 统一派生。

**判定**：

| 维度 | 状态 |
|---|---|
| 事件存储 | ✅ events 表 + EventStore |
| 事件注册表 | ✅ eventRegistry（builtins） |
| 事件/Operation 绑定 | ❌ 无（手动 emit，见 001 §7 待收敛） |
| HTTP 事件出口 | ❌ 无 SSE/WS |

**结论**：Event 基础设施（存储/注册表/总线）稳定，但**与 Operation 的绑定关系未建立**，
且无对外订阅通道。

## 5. Core PluginManager 当前实现

**结论：功能完整，覆盖加载/安装/卸载/启用/禁用/配置/更新。**

依据（pluginManager.cjs 实测，997 行）：

- **初始化**：`initialize()` 扫描 `{repo}/.repo/plugins/`，拓扑排序、循环检测、错误隔离。
- **生命周期**：`_activatePlugin`（register → initialize → enable）+ `unloadPlugin` +
  `reloadPlugin` + `enable/disablePlugin`。
- **安装**：`installPlugin`（插件仓库 index.json → 下载 tar.gz → 校验 checksum → 解压 →
  装依赖 → 激活）。
- **更新**：`updatePlugin`（版本比较、备份、回滚）。
- **配置**：`get/setPluginConfig`（DB 持久化 + manifest schema 校验）。
- **扩展点**：`_registerMetadataFields`、`_registerTypeExtensions`。
- **错误隔离**：激活失败 `_safelyCleanupPlugin` 回滚。

**判定**：

| 维度 | 状态 |
|---|---|
| 加载/安装/卸载 | ✅ 完整 |
| 生命周期管理 | ✅ 完整 |
| 插件配置 | ✅ 完整 |
| 错误隔离 | ✅ 完整 |
| 扩展点注册 | ✅ metadata/type 扩展 |

**结论**：PluginManager 是成熟实现，非原型。详见 008。

## 6. HTTP API 是否满足外部消费者需求

**结论：部分满足。核心读写可用，但存在关键缺口。**

依据（serve.cjs 104 路由 vs repository 200+ 方法）：

**已暴露（稳定面）**：
- Resource 读：`GET /api/notes`、`/api/notes/:rid`
- Resource 写：`POST/PUT/DELETE /api/notes...`（兼容层）
- Search / Schemas / Views / Workflows / Automations / Sync / Evolution
- Admin：resources/graph/relations/import/commit/audit/...

**未暴露（内部实现）**：
- Operation 语义：无 `/api/operations`
- Event 订阅：无 SSE
- Relation 写：无
- 安全/权限（checkPermission 等）：未上 HTTP
- Agent/Collaboration/Knowledge 分析：部分或未上 HTTP
- 容器成员操作（member.*）：无直接端点

**判定**：

| 能力 | 稳定面 | 内部面 |
|---|---|---|
| Resource CRUD | ✅ | — |
| Search | ✅ | — |
| Relation | ❌（仅读 admin） | ✅ |
| Operation | ❌ | ✅（engine 已就绪） |
| Event | ❌ | ✅（store/bus 已就绪） |
| Schema/View/Workflow/Automation | ✅ | — |
| Security/Permission | ❌ | ✅ |
| Agent/Collaboration/Knowledge | 部分 | ✅ |

## 7. 稳定 vs 内部 总结

### 已稳定（可依赖）

- Resource 模型（rid/type/path/metadata/软删/索引）
- Relation 模型（软删/metadata/hook）
- OperationEngine（execute/undo/history/transaction）
- EventBus + EventStore + EventRegistry
- PluginManager（全生命周期）
- Resource/Search/Schema/View/Workflow/Automation 的 HTTP 面

### 内部实现（未对外）

- Operation 语义（HTTP）
- Event 订阅（HTTP）
- Relation 写（HTTP）
- Security/Permission 系统
- Container member 操作
- Agent / Collaboration / Knowledge 分析能力

### 待收敛（001 定义）

- 事件与 Operation 绑定（当前手动 emit）
- 写操作统一经 OperationEngine（存在少量绕过路径）
- HTTP 面提升到 Operation 语义（002 §4）

## 8. 结论

1. **世界模型（Resource/Relation/Schema/View/Workflow）已稳定**，且大部分已 Operation 化。
2. **OperationEngine 是成熟实现**，覆盖广、含 undo/事务，是 Core 最核心的资产。
3. **Event 基础设施就绪**，但缺 Operation 绑定与对外通道。
4. **PluginManager 成熟**，支持完整生命周期与错误隔离。
5. **HTTP 面是主要短板**：Operation 语义、Event 订阅、Relation 写均未暴露，
   且部分内部能力（权限/容器/agent）完全未上 HTTP。
6. **工程缺口**：主要集中在**对外协议层**（HTTP），而非**核心能力层**。
   Core 的内部世界模型与操作引擎已经为对外协议做好准备。

---

## 9. 后续（记录，不设计）

- 若推进：优先在 HTTP 层暴露 Operation 语义与 Event 订阅（002 §4.1/4.2）。
- 权限/容器/agent 等内部能力是否上 HTTP，由需求驱动，当前不做假设。
