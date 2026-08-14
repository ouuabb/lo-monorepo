## schema — Schema 系统管理

**用法:** `lo schema <create|list|show|update|rm|attach|detach|validate> [选项...]`

管理 lo 核心的独立语义系统——Schema 定义及其与 Resource 的绑定关系。

### 子命令

- `create <id>` — 创建 Schema（`id` 为位置参数，必填）
- `list [--status <status>]` — 列出 Schema，可按状态过滤
- `show <id|name>` — 查看 Schema 详情（字段 / 关系 / 版本）
- `update <id> [--name] [--field ...] [--status]` — 更新 Schema（结构变更自动升版）
- `rm <id>` — 删除 Schema（资源引用级联清除）
- `attach <rid> <schema>` — 将资源绑定到 Schema（均为位置参数）
- `detach <rid>` — 解除资源的 Schema 绑定
- `validate <rid>` — 校验资源 metadata 是否符合其绑定 Schema

### 选项

**create:**
- `<id>` — Schema 唯一标识（位置参数，必填）
- `--name <name>` — 显示名（`--name` 与 `--file` 至少提供一个；缺省时等于 id）
- `--field <JSON>` — 字段定义，可多次传入，如 `--field '{"name":"status","type":"enum","values":["a","b"]}'`
- `--behavior <JSON>` — 行为语义声明，可多次传入（合并），如 `--behavior '{"stateField":"status"}'`
- `--file <path>` — 从 JSON 文件读取 `{ fields, relations, metadata, behaviors }`
- 注意：`--name` 与 `--file` 至少提供一个

**update:**
- `--name <name>` — 更新显示名
- `--field <JSON>` — 替换字段列表（触发 version + 1）
- `--behavior <JSON>` — 替换行为语义声明（触发 version + 1）
- `--status <status>` — 更新状态（active / deprecated）

### 示例

```
lo schema create followup --name FollowUp \
  --field '{"name":"status","type":"enum","values":["waiting","done"]}'
lo schema create person --file ./person.schema.json
lo schema list
lo schema show followup
lo schema update followup --field '{"name":"stage","type":"text"}'
lo schema rm followup
lo schema attach res_123 followup
lo schema detach res_123
lo schema validate res_123
```

### 工作机制

- **独立语义系统**：Schema 不属于任何 ResourceType，是平行于资源类型的独立管理层
- **字段模型**：text / number / boolean / date / datetime / enum / json / relation 八种类型，支持 `required`、`min/max`、`maxLength`、`label`、`description`、`display` 等属性
- **relation target 强校验**：relation 字段 / relations 条目的 `target` 必须指向已存在的 Schema（按 id 或 name），否则拒绝写入
- **behaviors 语义声明**：`stateField` / `titleField` / `archiveField` / `sortableFields` 等键声明字段角色，引用字段必须存在；只是语义声明，不执行任何行为
- **自动升版**：update 变更字段（`--field`）或行为声明（`--behavior`）时 version + 1，历史资源保留创建时版本；relations 只能通过 create 时的 `--file` 设置
- **attach 幂等覆盖**：一个资源同时只挂一个 Schema，重复 attach 覆盖

### 注意事项

- 必须在已初始化（`lo init`）的仓库目录下运行
- 创建时字段定义需为合法 JSON，且包含非空 `name`
- enum 字段必须声明 `values` 数组；relation 字段必须声明 `target`
- 删除 Schema 时，`resource_schemas` 引用随外键级联删除

### 相关命令

- [show](show.md) — 查看资源详情
- lo docs schema
