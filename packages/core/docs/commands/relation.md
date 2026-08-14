## relation — 资源关系管理

**用法:** `lo relation <add|remove|list|show> [选项...]`

管理资源之间的双向引用关系。关系存储在 relations 表中，支持类型标记和元数据。

### 子命令

**创建关系:**
- `add <from> <to>` — 在两个资源之间建立关系

选项:
  - `--type <类型>` — 关系类型（默认: `reference`）
  - `--label <标签>` — 关系标签（存储在 metadata.label 中）

**删除关系:**
- `remove <id>` — 按关系 ID 删除关系

**列出关系:**
- `list` — 列出所有关系
- `list <resource>` — 列出指定资源的所有关系（含 outgoing 和 incoming）

选项:
  - `--type <类型>` — 按关系类型过滤

**查看关系:**
- `show <id>` — 查看关系详情（源/目标/类型/元数据/时间）

### 示例

```
lo relation add res_abc res_xyz                              # 建立 reference 关系
lo relation add res_abc res_xyz --type tag --label "相关"     # 带标签的关系
lo relation list                                              # 列出所有关系
lo relation list res_abc                                      # 列出指定资源的关系
lo relation list --type reference                             # 按类型过滤
lo relation show 42                                           # 查看关系详情
lo relation remove 42                                         # 删除关系
```

### 工作机制

- 关系是双向的：从 A 到 B 的关系会自动建立，可通过 `list <resource>` 同时查看 outgoing 和 incoming
- 关系存储于 relations 表中，包含 from_rid、to_rid、type 和 metadata 字段
- 关系独立于 wikilink 系统：wikilink 通过 sync 自动解析，relation 通过命令行手动管理
- 关系类型可自定义，默认类型为 `reference`
- metadata 字段为 JSON 格式，支持附加 label、origin 等自定义信息

### 关系类型

| type | 说明 | 创建方式 | origin |
|------|------|----------|--------|
| `reference` | 用户手动引用关系 | `lo relation add` | `user` |
| `wikilink` | 笔记间 `[[...]]` 双向链接 | `lo sync` 自动解析 | `markdown_parser` |
| `embed` | Markdown 图片引用 `![alt](path)` | `lo sync` 自动解析 | `markdown_parser` |
| `attach` | 附件关系 | 手动或插件 | 视场景 |
| `cite` | 引用/引文关系 | 手动或插件 | 视场景 |

> `wikilink` 和 `embed` 为派生关系（`origin: 'markdown_parser'`），由 `lo sync` 自动管理。用户创建的关系使用 `origin: 'user'`，两者互不干扰。
>
> **注意**：`lo sync` 在 SQLite 事务中重建派生关系，仅删除 `origin = 'markdown_parser'` 或 `origin IS NULL` 的记录。用户通过 `lo relation add` 创建的关系不受影响。

### 与 [[wikilink]] 的区别

| 特性 | `lo relation` | `[[wikilink]]` | `embed` |
|------|---------------|----------------|---------|
| 创建方式 | 命令行手动执行 | 写在 .md 文件中 | 写在 .md 文件中 |
| 目标匹配 | 按 RID 精确指定 | 按 RID/标题匹配 | 按 RID/文件名匹配 |
| 存储位置 | relations 表 | relations 表 | relations 表 |
| 方向 | 单向或双向 | 自动双向 | 单向 |
| 重命名后 | 自动保持（基于 RID） | 自动保持（基于 RID） | 自动保持（基于 RID） |
| 内容变化后 | 不受影响 | 下次 sync 自动更新 | 下次 sync 自动更新 |
| 适用场景 | 跨类型资源关联 | 笔记内引用 | 图片/附件引用 |

### 注意事项

- 创建关系前需确保源资源和目标资源都存在
- 删除关系后不可恢复，请确认后再操作
- 关系 ID 为整数，可通过 `lo relation list` 获取

### 相关命令

- [graph](graph.md) — 知识图谱可视化与分析
- lo link / lo unlink — 更简洁的资源链接操作（封装了 relation add/remove）
- lo docs wikilink
