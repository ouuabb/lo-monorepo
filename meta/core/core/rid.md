## RID 一等公民机制

### 什么是 RID

RID（Resource IDentifier）是每个资源在 lo 系统中的唯一标识符。

格式：`res_{timestamp}_{random}`
示例：`res_mrapmaj2_07f5af1286ade83a`

RID 在资源首次入库时生成（`lo add` + `lo commit` 或 `lo sync`），一旦分配则不可变更，伴随资源整个生命周期。

### 一等公民原则

"RID 一等公民"意味着：所有资源操作的第一标识符是 RID，而非文件名或路径。

| 优势 | 说明 |
|------|------|
| 路径无关 | 文件重命名不影响资源标识，RID 恒定不变 |
| 名称解耦 | name 是逻辑标签，可被栈层复用，RID 才是终极唯一标识 |
| 关系稳定 | relations 表通过 from_rid/to_rid 建立链接，重命名/移动不影响链接 |
| 同步安全 | 跨设备同步基于 RID 做操作日志匹配 |

### 三级查找机制

`resolveResource(input)` 实现了统一的资源查找入口：

1. **第 1 级**：input 以 `res_` 开头 → `getByRid(input)` — 精确匹配，不区分 layer，栈中资源也能找到
2. **第 2 级**：`getByName(input)` — 按 name 查找活跃层（layer=0），日常操作入口，只返回活跃资源
3. **第 3 级**：`getByPath(input)` — 按文件路径匹配（含绝对路径和相对路径降级）

这意味着用户可以自由使用 rid、name 或 path 中的任意一种方式引用资源，系统自动按优先级解析。

### RID 生命周期

```mermaid
flowchart TD
  NEW[lo new / 拖文件进仓库] -->|文件在磁盘, 无RID| DISK[磁盘文件]
  DISK -->|lo add + lo commit| CREATE[ResourceService.create()]
  DISK -->|lo sync| CREATE
  IMPORT[lo import] -->|RidUtils.generate()| CREATE

  CREATE -->|INSERT| DB[(resources 表<br/>RID = PRIMARY KEY)]
  CREATE -->|INSERT| TAGS[resource_tags]
  CREATE -->|INSERT| CAPS[resource_capabilities]

  DB -->|resolveResource| OPS[CRUD 操作<br/>show/edit/delete/tag/link...]
  OPS -->|始终以RID操作| DB

  SYNC[跨设备同步] -->|syncOp 以RID匹配| DB
  SYNC -->|冲突时入栈| STACK[RID_stack_{layer}<br/>确定性后缀,可追溯]
```

RID 不可变更：即使文件被重命名、移动、内容被修改，RID 始终不变。
RID 不可复用：软删除的资源 RID 不会被回收给新资源使用。

### name 与 RID 的关系

| | name | RID |
|------|------|-----|
| 作用 | 人类可读的逻辑标签 | 机器使用的唯一键 |
| 唯一性 | name+layer 组合唯一 | 绝对唯一 |
| 来源 | 从文件路径自动推导 | 入库时随机生成 |
| 变更 | 不推荐但可能（rename）| 永远不变 |
| 栈层 | name 相同，layer 不同 | 每个栈层有独立 RID |

日常使用中，用户更习惯用 name 引用资源（如 `lo show 笔记测试`），系统自动通过 `resolveResource` 查找活跃层（layer=0）返回。栈中资源则需要使用 RID 精确访问。

### 实现细节

- `resources` 表主键为 rid（`TEXT PRIMARY KEY`）
- `resolveResource` 在 `repository.cjs` 中实现，被所有命令复用
- `getByName` 只查 `WHERE name = ? AND layer = 0 AND deleted = 0`
- `getByRid` 不限制 layer，可访问栈中任意资源
- `getByPath` 不做 layer 过滤，因为文件路径全局唯一
- 栈 pop 操作通过 `UPDATE layer` 交换 rid，不改变文件

所有 CRUD 命令（`show/edit/delete/tag/category/link/unlink/move`）统一使用 `resolveResource` 作为资源查找入口，确保一致性。

### 注意事项

- `lo new` 不分配 RID，文件在磁盘但不入库
- RID 在 commit/sync 时才分配，此时才成为"一等公民"
- 按 name 查找只返回活跃层，栈中资源需通过 rid 访问
- `relations` 表基于 rid 建立链接，name 变更不影响链接
- 跨设备同步的操作日志以 rid 为主键匹配资源

### 相关命令

- `lo show` — 查看资源
- `lo list` — 列出资源
- `lo manual show` — 查看 show 命令手册

### 相关文档

- [资源栈机制](stack.md) — 栈层与 RID 的交互
- [核心概念](../../guide/concepts.md) — RID 的设计哲学
- [数据库结构](database.md) — resources 表结构
