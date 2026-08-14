## 操作追踪体系

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
