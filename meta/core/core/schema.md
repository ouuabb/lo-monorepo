# Schema 系统实现文档

> 本文档描述 lo Schema 系统的**当前实现**（数据层 + CLI + HTTP API + 查询能力）。
> 总体设计参见外部《lo Schema 系统设计文档》。

---

## 一、定位

Schema 是 lo 核心的**独立语义系统**：为 Resource 的 metadata 提供结构化语义模型，使系统能理解 metadata 的含义。它不属于任何 ResourceType，是一个平行于资源类型体系的独立管理层。

```
Resource   — 负责身份（持有 metadata 与 Schema 引用）
Metadata   — 负责数据（值）
Schema     — 负责解释 Metadata（模型 / 约束 / 语义）
```

三者关系：

```
             Schema
               │
               │  解释 / 约束 / 语义
               ▼
Resource ─────────────
   │
   └── Metadata（数据）
```

Schema **不拥有** Metadata——Schema 描述 Metadata，Resource 持有 Metadata 并引用 Schema。等价于 `Class 描述 Object`，而不是 `Resource → Schema → Metadata` 的链式拥有关系。

Schema 不替代 Resource、不创建新实体类型，只做描述。

---

## 二、数据模型

Schema 相关数据存储在两张独立表中（`src/repo/migrations/001_initial_schema.cjs`，开发期直接写最终结构，不走迁移）。

### schemas — Schema 定义

```sql
CREATE TABLE schemas (
  id            TEXT PRIMARY KEY,            -- 唯一标识，如 'followup'
  name          TEXT NOT NULL UNIQUE,        -- 显示名，如 'FollowUp'
  version       INTEGER NOT NULL DEFAULT 1,  -- 版本号，结构变更自动 +1
  fields        TEXT NOT NULL DEFAULT '[]',  -- JSON 字段定义
  relations     TEXT NOT NULL DEFAULT '[]',  -- JSON 关系定义
        status        TEXT NOT NULL DEFAULT 'active', -- active / deprecated
        metadata      TEXT DEFAULT '{}',           -- 附加元数据
        behaviors     TEXT DEFAULT '{}',           -- 行为语义声明（JSON 对象）
        created       INTEGER NOT NULL,
  updated       INTEGER NOT NULL
);
```

> Schema 不属于任何 ResourceType（独立语义系统），无 resource_type 归属字段。

### resource_schemas — Resource → Schema 引用

```sql
CREATE TABLE resource_schemas (
  resource_rid   TEXT PRIMARY KEY,           -- 一个资源同时只挂一个 Schema
  schema_id      TEXT NOT NULL,
  schema_version INTEGER NOT NULL,           -- 创建时使用的版本（历史数据不失效）
  attached_at    INTEGER NOT NULL,
  FOREIGN KEY (resource_rid) REFERENCES resources(rid) ON DELETE CASCADE,
  FOREIGN KEY (schema_id) REFERENCES schemas(id) ON DELETE CASCADE
);
```

### fields 结构（JSON）

```json
[
  { "name": "customer", "type": "relation", "target": "Person", "required": true },
  { "name": "status",   "type": "enum",     "values": ["waiting", "processing", "done"] },
  { "name": "deadline", "type": "date" },
  { "name": "priority", "type": "number",   "min": 1, "max": 5 },
  { "name": "note",     "type": "text",     "maxLength": 200 }
]
```

| 字段属性 | 说明 |
|---|---|
| name | 字段名，非空 |
| type | text / number / boolean / date / datetime / enum / json / relation |
| required | 是否必填 |
| values | enum 字段的合法取值（必填）|
| min / max | number 范围 |
| maxLength | text 最大长度 |
| target | relation 字段的目标 Schema（必填，强校验必须存在）|
| label | 展示名（字符串）|
| description | 语义说明（字符串）|
| display | 展示方式（对象）|

### relation target 强校验

relation 字段的 `target` 与 `relations` 条目中的 `target`，在创建 / 更新 Schema 时**强校验**：目标 Schema 必须已存在（按 id 或 name 解析），否则拒绝写入：

```
SchemaRegistry: relation target "Ghost" 不存在，请先创建对应 Schema
```

> 未来插件生态若出现 Schema 相互依赖（如插件 A 依赖插件 B 提供的 Person Schema），可能需要 `dependencies` 声明或 unresolved relation 机制。当前阶段不实现，保持强校验。

### behaviors — 语义声明

Schema 可携带 `behaviors` 对象，**声明**字段的角色语义（不执行任何行为）。已知语义键：

| 键 | 类型 | 含义 |
|---|---|---|
| `stateField` | string | 状态字段（描述资源自身状态语义；Workflow 的实例状态属于 Workflow 实例，两者解耦）|
| `titleField` | string | 标题字段（展示用）|
| `archiveField` | string | 归档标记字段 |
| `sortableFields` | string[] | 可排序字段列表 |

```json
{
  "behaviors": {
    "stateField": "status",
    "titleField": "customer",
    "sortableFields": ["deadline", "priority"]
  }
}
```

校验规则：
- 引用的字段名必须存在于 `fields` 中，否则拒绝写入（`behaviors.stateField 引用的字段 "x" 不存在`）
- 允许任意其他键（语义声明是开放扩展点），但 `stateField` / `titleField` / `archiveField` 必须是字段名字符串、`sortableFields` 必须是字段名数组
- `behaviors` 变化同样触发自动升版（version + 1）

---

## 三、SchemaRegistry API

`src/repo/schemaRegistry.cjs` 是自包含的注册表服务，仅依赖 `Database`。

| 方法 | 说明 |
|---|---|
| `createSchema(input)` | 创建 Schema，校验 fields 结构 + relation target + behaviors |
| `getSchema(id)` | 按 id 查询 |
| `getSchemaByName(name)` | 按 name 查询 |
| `listSchemas({ status })` | 列表，可按状态过滤 |
| `updateSchema(id, patch)` | 更新；fields/relations/behaviors 变化时自动 version + 1 |
| `deleteSchema(id)` | 删除，引用级联清除 |
| `attachSchema(resourceRid, schemaId)` | 资源引用 Schema（记录当前版本），幂等覆盖 |
| `getResourceSchema(resourceRid)` | 查询资源关联的 Schema 及 attach 版本 |
| `detachSchema(resourceRid)` | 解除引用 |
| `listResourcesBySchema(schemaId)` | 列出引用某 Schema 的未删除资源 |
| `getResourceSchemaPublic(resourceRid)` | 资源 Schema 的公开视图（结构 + 关联版本，不含内部元数据）|
| `validateValues(schema, values, { strictKeys })` | 按字段规则校验值集合 |

### validateValues 语义

- `strictKeys: true`（默认）：schema 未定义的 key 报错
- `strictKeys: false`：忽略未定义 key —— 配合"Metadata 保持开放"原则，允许 lo 内置字段（title、wordCount 等）与用户自由字段共存

---

## 四、与资源创建流程的集成

`resourceService.create` 支持可选 `schema` 参数（id 或 name），完整流程：

```
resourceService.create({ type, path, metadata, schema: 'followup' })
  │
  ├─ 1. 解析 Schema（getSchema || getSchemaByName）
  │      └─ 不存在 → 抛错
  │
  ├─ 2. assertMetadata(metadata, { extraKeys: schema 字段名 })
  │      └─ schema 声明的字段绕过内置白名单（schema 优先于内置字段定义）
  │
  ├─ 3. schemaRegistry.validateValues(schema, metadata, { strictKeys: false })
  │      └─ 字段类型 / enum 取值 / 必填校验，失败 → 抛错不落库
  │
  ├─ 4. 事务内 INSERT resources
  │      └─ 同事务内 attachSchema(rid, schema.id)  →  原子性
  │
  └─ 返回 resource.schema = { id, name, version }
```

`getByRid` / `getByName` / `getByNameLayer` 通过 `_loadSchema` 在读取时补全 `resource.schema`（含 attach 版本），供 View/Workflow/AI 消费。

### 更新路径校验

`resourceService.update` 同样强制 Schema 约束：若资源已绑定 Schema，更新 metadata 时先按 Schema 规则校验（`extraKeys` 放行 schema 字段），失败即抛错且回滚。

```
resourceService.update(rid, { metadata: { status: 'invalid' } })
  └─ 资源已绑定 FollowUp → validateValues 校验失败 → 抛错 + ROLLBACK
```

### 资源列表按 Schema 过滤

`resourceService.getAll({ schema })` 通过 `EXISTS (... resource_schemas ...)` 子查询过滤出绑定指定 Schema 的资源：

```
resourceService.getAll({ schema: 'followup' })   → 仅返回绑定 followup 的资源
```

---

## 五、管理入口

### CLI — `lo schema`

独立命令组，包含 8 个子命令：`create` / `list` / `show` / `update` / `rm` / `attach` / `detach` / `validate`。
详见 [schema 命令参考](../commands/schema.md)。

### HTTP API — `/api/schemas`

基于 `lo serve` 提供 Schema 的 CRUD 与 attach/detach，以及资源列表按 schema 过滤。
详见 [HTTP API 参考](../reference/api.md)。

---

## 六、接线方式

`src/repo/repository.cjs` 的 `init()` 与 `open()`：

```js
this.schemaRegistry = new SchemaRegistry(this.db);
this.resourceService = new ResourceService(this.db, {
  // ...
  getSchemaRegistry: () => this.schemaRegistry,   // 惰性注入
});
```

`Repository.createResource(type, content, { schema })` 透传 schema 到 `resourceService.create`。

---

## 七、当前边界

| 项 | 状态 |
|---|---|
| Schema 存储 | ✅ 独立表 |
| SchemaRegistry 服务 | ✅ 独立类，已接入 Repository |
| Resource 创建校验 + 版本记录 | ✅ create 集成 |
| Resource 更新校验 | ✅ update 集成（按绑定 Schema 校验）|
| 读取侧补全 schema | ✅ getByRid / getByName / getByNameLayer |
| 资源列表按 Schema 过滤 | ✅ getAll({ schema }) |
| CLI 管理入口 | ✅ `lo schema`（8 个子命令，create/update 支持 `--behavior`）|
| HTTP API 入口 | ✅ `/api/schemas` CRUD + attach/detach |
| 查询能力 | ✅ listResourcesBySchema / getResourceSchemaPublic |
| behaviors 语义声明 | ✅ stateField / titleField / archiveField / sortableFields（字段引用强校验）|
| Workflow 引用 | ⚠️ 支持 schemaId 绑定（仅存 ID，暂不校验存在性），尚未消费字段定义做规则强校验 |
| View 消费 | ✅ View 读取 Schema：字段投影按 schema.fields 强校验、默认投影取自 schema.fields、schema 条件解析为 id（见 [View 系统](view.md)）|
| Automation / AI 消费 | ❌ 未实现（使用方式未定）|
| 插件注册 Schema / Field 类型 | ❌ 未接（`registerMetadataField` 具备雏形）|
| relation 自引用 | ⚠️ 创建时不可自引用（目标需已存在）；可通过 `update` 补加自引用字段 |
| Schema 依赖 / 插件安装顺序 | ⚠️ 未实现（relation target 强校验要求目标先存在；未来插件生态需考虑 dependencies）|

**实现性质**：Schema 已是 lo 核心的独立语义系统（存储、注册表、校验、CLI、HTTP API、查询能力、语义声明齐备），尚缺上层消费端接入。

> **架构边界**：Schema 只负责"是什么"（语义声明 + 约束），**不**负责"怎么变化 / 怎么展示 / 怎么行动"——Workflow 管状态流转、View 管展示、Automation 管行为。新增需求时应优先让消费端读 Schema，而不是往 Schema 里塞执行逻辑。

---

## 相关文档

- [资源模型](resource-model.md) — Resource / Metadata 基础
- [数据库结构](database.md) — schemas / resource_schemas 表说明
- [RID 一等公民机制](rid.md) — Resource 身份设计
- [schema 命令参考](../commands/schema.md)
- [HTTP API 参考](../reference/api.md)
