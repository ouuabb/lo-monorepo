# View 系统实现文档（方案 C：资源观察层）

> 本文档描述 lo View 系统的**当前实现**（数据层 + CLI + HTTP API + 查询执行）。

---

## 一、定位

View 是 lo 核心的**资源观察层**：以只读视角组织 Resource 集合。它不属于 Resource、不属于 Schema、也不是前端页面。

```
Resource     — 负责身份（数据）
Schema       — 负责语义（描述 metadata）
View         — 负责观察（Resource 集合的只读视角）
```

三个独立一等对象：

- **Query Definition**（`query`）：哪些 Resource 属于这个 View
- **Field Projection**（`fields`）：显示哪些字段、顺序、别名、展示方式
- **Presentation Definition**（`presentation = { type, config }`）：资源集合如何呈现

关键边界：

- View **不创建 / 不拥有 / 不修改** Resource——只是观察规则
- View **不强制绑定 Schema**——跨 Schema 组织是一等能力
- View **不定义业务模型、不替代前端**——`renderView` 返回结构化结果，由 CLI / HTTP / 前端 Renderer 各自解释
- View 定义可 **导出 / 导入**，用于分享与迁移

---

## 二、数据模型

View 定义存储于 `views` 表（`src/repo/migrations/001_initial_schema.cjs`，直接写入最终结构）。

```sql
CREATE TABLE views (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  query         TEXT NOT NULL DEFAULT '{}',      -- Query Definition（JSON）
  fields        TEXT NOT NULL DEFAULT '[]',      -- Field Projection（JSON）
  presentation  TEXT NOT NULL DEFAULT '{}',      -- Presentation Definition：{ type, config }（JSON）
  status        TEXT NOT NULL DEFAULT 'active',  -- active / deprecated
  metadata      TEXT DEFAULT '{}',
  created       INTEGER NOT NULL,
  updated       INTEGER NOT NULL
);
CREATE INDEX idx_views_status ON views(status);
```

---

## 三、Query Definition

`query.conditions` 支持的字段与约束：

| 字段 | 支持的 operator | 说明 |
|------|----------------|------|
| `schema` | `=` / `in` | 目标 Schema（id 或 name）；**所有引用强校验必须存在** |
| `type` | `=` | 资源类型 |
| `tag` | `contains` / `=` / `in` | 资源标签 |
| `capability` | `=` / `in` | 资源能力（仅查询条件，不作为投影字段） |
| `relation` | `linked-to` | 关联资源，value 为目标 RID；`relationType` 可选 |
| `created` / `updated` | `>` / `<` / `within-days` | 时间条件 |
| 其余字段 | `=` / `!=` / `>` / `<` / `contains` / `in` | 一律按 metadata 字段处理（`json_extract`） |

**Schema 引用强校验**：所有 schema 引用（无论 `=` 还是 `in`）统一在创建 / 更新时校验——引用不存在的 Schema 直接拒绝。

```json
{
  "conditions": [
    { "field": "schema", "operator": "=", "value": "Book" },
    { "field": "status", "operator": "=", "value": "reading" }
  ]
}
```

---

## 四、Field Projection

`fields` 定义投影字段，每项 `{ name, label?, format? }`。

- 恰好一个 schema 引用时：字段**强校验**——必须是 Schema 声明的字段或通用字段
- 无 schema / 多 schema 时：仅允许**通用字段**

通用字段集合：`rid`、`name`、`title`、`created`、`updated`、`tags`、`type`、`path`（`rid` / `name` 必含；`capabilities` 不作为展示字段，仅作为查询条件）。

无显式 `fields` 时自动生成默认投影（有 schema → `schema.fields`；无 schema → `rid` / `name`）。

---

## 五、Presentation Definition

`presentation` 为统一结构 `{ type, config }`：`type` 支持六种渲染模式 `table` / `card` / `kanban` / `calendar` / `timeline` / `list`，`config` 为各模式的配置。

```json
{ "type": "kanban", "config": { "group_by": "status", "kanban": { "columns": ["todo", "done"] } } }
```

`config` 支持的键：

| 键 | 类型 | 说明 |
|----|------|------|
| `sort` | `{field, order}[]` | 排序（order 为 asc / desc） |
| `group_by` | string | 分组字段（看板 / 分组） |
| `kanban` | `{ columns?: string[] }` | 看板列配置 |
| `calendar` | `{ date_field }` | 日历日期字段 |
| `timeline` | `{ date_field }` | 时间线日期字段 |
| `card` | `{ title_field, description_field }` | 卡片标题 / 描述字段 |

Presentation 引用的字段同样校验存在性。

**兼容别名**：`createView` / `updateView` 仍接受顶层 `mode`（旧结构）与 `presentation` 顶层键（`sort` / `group_by` 等），内部经 `_normalizePresentation` 归一化为 `{ type, config }` 存储；输出 / 导出统一为 `{ type, config }`。

---

## 六、查询执行（renderView）

`renderView(id, { limit?, offset? })` 返回结构化结果，**不渲染**：

```js
{
  presentation: { type: 'table', config: {} },   // 渲染模式
  columns: [{ name, label, format }],
  rows: [{ ...fieldValues }],   // group_by 时 rows 为 null
  groups: [{ key, rows }] | null,
  total: 42                 // 满足 query 的资源总数（不受 limit 影响）
}
```

执行流程：SQL 查询（六类条件，schema 引用在渲染前统一解析为 id）→ 行 hydration（补全 tags / capabilities / schema 引用）→ 排序 / 分组（基于完整行）→ 字段投影（最后，仅输出投影列）。

---

## 七、数据层实现

`src/repo/viewRegistry.cjs` 提供：

- `createView` / `getView` / `getViewByName` / `listViews` / `updateView` / `deleteView`
- `_validateQuery`（六类条件 + Schema 引用强校验 `_collectSchemaRefs`）
- `_validateFields`（单 schema 强校验 / 无 schema 仅通用字段）
- `_validatePresentation`（`{ type, config }` 的 sort / group_by / kanban / calendar / timeline / card 校验）
- `renderView` / `_buildQuery` / `_hydrateRows` / `_project` / `_applySort` / `_applyGroup`
- `exportView` / `importView`

`Repository.init()` / `open()` 中实例化 `this.viewRegistry = new ViewRegistry(this.db, { getSchemaRegistry: () => this.schemaRegistry })`。

---

## 八、不做什么

- 不修改资源、不定义业务模型
- 不替代前端（Renderer 是消费方，`renderView` 只产出结构化数据）
- 不强制绑定 Schema（跨 Schema 是一等能力）
