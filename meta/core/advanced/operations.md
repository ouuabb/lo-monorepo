## 操作追踪体系

> 本文含两部分：① **Operation 语义体系**（010 收敛后的全部写操作审计 + undo + 事务）；
> ② **sync_ops 同步操作日志**（跨设备同步用的旧日志体系）。两者并存：
> `operations` 表 = 全部写操作的可追踪事实（Resource/Relation/Schema/View/Automation/
> Member/Workflow 级）；`sync_ops` 表 = 同步传播单位（跨设备回放）。

---

## 一、Operation 语义体系（operations 表）

### 1.1 概念

Operation = 可追踪事实：`type + params + context(actor)`。**所有写操作必须经
OperationEngine 执行**（import/link 亦收敛到 `resource.create`），每条记录持久化到
`operations` 表（S0 后由 `container_operations` 更名），可经 `lo undo` 或
`lo container transaction undo` 回滚。

### 1.2 引擎与状态机（src/repo/）

| 模块 | 职责 |
|---|---|
| `operationEngine.cjs` | 统一执行入口 `execute()`：OperationRegistry 查找 handler → 状态生命周期 `pending → success / failed / rolled_back` → 持久化 operations 表 → undo（父子操作链） |
| `operationRegistry.cjs` | 操作类型注册表：`{ execute, undo }` handler 映射（替代硬编码 switch） |
| `operationLogger.cjs` | 容器操作历史 + Undo 系统 |
| `transactionEngine.cjs` | 两层事务：SQLite 原子事务 + 业务事务记录（container_transactions）；失败自动 undo |

`src/operations/index.cjs` 自动扫描注册全部 `{type, execute, undo}` 完整 handler。

### 1.3 操作类型清单（30 个）

| 域 | 操作 |
|---|---|
| 资源 | `resource.create`（含 import/link）/ `resource.update` / `resource.delete`（软删）/ `resource.move` |
| 关系 | `relation.create` / `relation.update` / `relation.remove`（软删） |
| 成员 | `member.add` / `delete` / `update` / `rename` / `move` / `copy` / `remove` / `restore` / `promote` / `demote` / `ignore` / `unignore` |
| Schema | `schema.create` / `schema.update` / `schema.delete` |
| View | `view.create` / `view.update` / `view.delete` |
| 自动化 | `automation.create` / `automation.update` / `automation.remove` |
| 工作流 | `workflow.transition`（唯一合法状态变化入口，undo 回滚实例状态） |

### 1.4 undo 语义

- `resource.update`：执行前抓取 before 状态；content 变更快照到
  `.repo/operations/<opId>.bak`，undo 回滚内容与字段。
- `resource.create`：undo = 软删已建资源；`resource.delete`：undo = 恢复 deleted=0 与原 name。
- 成员操作：before 快照恢复（promote/demote/rename/move/copy/ignore 等）。
- 父子操作链：事务内子操作随父操作 undo 级联。

### 1.5 HTTP / CLI 面

- `POST /api/operations`（execute，options 含 actor/parentOperationId/transactionId）、
  `GET /api/operations`（历史）、`GET /api/operations/:id`、`POST /api/operations/:id/undo`；
  事务：`POST /api/operations/transaction`（begin）+ `/transaction/:id/{execute,commit,rollback}`。
- CLI：`lo operation`（列表/详情）、`lo undo <operationId>`（撤销最近或指定操作）、
  `lo container transaction ...`。

### 1.6 事件联动

Operation 执行后统一 emit 领域事件（`resource.created` / `relation.created` /
`workflow.transition` 等）——事件是领域事实广播，Operation 是写路径事实（见
`core/systems/event.md`）。

---

## 二、sync_ops 同步操作日志（跨设备同步）

### 操作类型（OP_TYPES）

`sync_ops` 表定义了 5 种操作类型：

| 类型 | 值 | 状态 |
|------|-----|------|
| RESOURCE_CREATED | resource_created | 活跃 |
| RESOURCE_UPDATED | resource_updated | 活跃 |
| RESOURCE_DELETED | resource_deleted | 活跃 |
| RESOURCE_MOVED | resource_moved | 活跃 |
| RESOURCE_TAGGED | resource_tagged | 预留 |

> RESOURCE_TAGGED 定义了处理逻辑但当前无任何代码触发，属于预留类型。

### RESOURCE_CREATED — 资源创建

触发场景：
- `lo import <文件>` — 导入外部文件到仓库
- `lo sync` — 发现磁盘上的新文件
- `lo commit` — 提交暂存区 added 列表
- `FileWatcher add 事件` — 拖文件/外部程序写入文件时 chokidar 检测到文件新增
- `Repository.importFile()` / `Repository.createResource()` — API 调用
- `lo pull` 从远程拉取的新建资源

### RESOURCE_UPDATED — 资源更新

触发场景：
- `lo edit <rid>` — 用编辑器修改资源
- `lo sync` — 检测到文件 mtime 变化且 hash 或元数据不同
- `lo commit` — 提交暂存区 modified 列表
- `FileWatcher change 事件` — 外部程序修改文件内容

### RESOURCE_DELETED — 资源删除

触发场景：
- `lo delete <rid>` — 软删除或硬删除（`--hard`）
- `lo sync` — 检测到磁盘文件消失
- `lo commit` — 提交暂存区 deleted 列表
- `FileWatcher unlink 事件` — 文件被外部删除

### RESOURCE_MOVED — 资源移动/重命名

触发场景：
- `lo move <rid> <新路径>` — 显式移动/重命名
- `lo sync` — 通过 hash 匹配自动检测重命名
- `lo commit` — 提交暂存区 renamed 列表

### 检测命令对比

| 检测维度 | lo status | lo diff | lo sync |
|---------|-----------|---------|---------|
| 暂存 added | 分类列出 | + 内容预览（前5行）| — |
| 暂存 modified | 分类列出 | + hash对比+元数据 | — |
| 暂存 deleted | 分类列出 | + title/type | — |
| 暂存 renamed | 分类列出 | + 旧→新路径 | — |
| 暂存 metadata | 分类列出 | + 具体字段变化 | — |
| 未暂存 mod | 分类列出 | + hash 对比 | 更新 DB+sync_ops |
| 未暂存 del | 分类列出 | — | 标记删除+sync_ops |
| 未暂存 rename | hash匹配检测 | — | hash匹配+sync_ops |
| 未跟踪新文件 | 列出 | 标记"未跟踪" | 导入 DB+sync_ops |
| wikilink | — | — | 自动解析 [[]] |

> status 和 diff 是只读检测，不修改任何数据。sync 是唯一能将"未暂存变更"直接写入 DB 和 sync_ops 的命令。

### FileWatcher — chokidar 实时文件监控

lo 内置基于 chokidar 的文件监控器：

| 事件 | 自动响应 |
|------|---------|
| add | importFile() 自动导入到 DB |
| change | rehash() 更新 hash |
| unlink | deleteResource() 软删除 |

> FileWatcher 的自动处理不会写入 sync_ops 操作日志。只有显式命令才会产生可跨设备同步的操作记录。

### 暂存区（staging_changes 表）

| 列表 | 含义 |
|------|------|
| added | 新文件已被 lo add，尚未 commit |
| modified | 已入库文件修改后 lo add，尚未 commit |
| deleted | lo rm 标记删除，尚未 commit |
| renamed | 重命名操作已暂存，尚未 commit |
| metadata | 标签/分类等元数据变更，尚未 commit |

### 完整数据流

```
用户操作 / 拖文件 / chokidar 事件
    │
    ├─→ lo add/rm/mv/tag/category  ──→  staging_changes 表
    │                                        │
    │                                   lo commit ──→ DB + sync_ops
    │
    ├─→ lo import / lo edit / lo sync  ──→  DB + sync_ops（直接写入）
    │
    ├─→ FileWatcher (chokidar)  ──→  DB 更新（不写 sync_ops）
    │
    ├─→ lo status  ──→  只读检测：暂存 + 未暂存 + 未跟踪
    ├─→ lo diff    ──→  只读检测：同上 + 内容差异详情
    │
    └─→ lo sync    ──→  全量检测 + 写入 sync_ops
         lo push   ──→  对比远程清单 → 差集打包 → 远程
         lo pull   ──→  对比远程清单 → 下载批次 → applyOps
```

### 注意事项

- `lo status` / `lo diff` 不修改任何数据，仅做检测报告
- `lo sync` 是唯一能直接将磁盘变更写入 DB + sync_ops 的命令
- FileWatcher 自动响应但不写 sync_ops
- 跨设备同步依赖 sync_ops 表
- RESOURCE_TAGGED 类型已预留，待未来版本激活
- push 发现远程有本地未知操作时会拒绝推送

### 相关命令

- `lo status` — 查看变更状态
- `lo diff` — 查看变更差异
- `lo sync` — 同步文件系统变更到数据库
- `lo commit` — 提交暂存变更
- `lo push / pull` — 远程同步

### 相关文档

- [版本控制](../core/version.md) — 暂存区与提交
- [远程同步](../core/sync.md) — 操作日志与批次
- [数据库结构](../core/database.md) — sync_ops 表结构
