# 双向链接（wikilink）语法处理调研

> 目的：厘清 lo 系统对 `[[...]]` 双向链接语法的**完整处理链路**（解析 / 保存 / 与 Relation
> 的关系），供编辑器补全等上层功能对齐语义。本文基于代码事实（packages/core）。

## 1. 语法定义

| 语法 | 含义 | 解析结果 |
|---|---|---|
| `[[Target]]` | 引用名为 Target 的资源 | `{ target: 'Target', alias: null }` |
| `[[Target\|别名]]` | 引用 Target，显示别名 | `{ target: 'Target', alias: '别名' }` |

解析正则（`src/utils/wikilinkParser.cjs`）：

```
/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
```

- target 与 alias 均 `trim()`；
- 不匹配嵌套 `[[]]`、不匹配含 `|` 的 target（`|` 后为 alias）；
- `parseTargets` 提供去重 target 列表。

## 2. 解析入口与时机

**唯一解析入口**：`src/utils/markdownParser.cjs`（`MarkdownParser.parse(content)`）——
聚合 Wikilink 与 Embed（`![alt](path)` / `<img>`）两种引用，返回
`{ wikilinks: [], embeds: [] }`。`WikiLinkParser` 是其子解析器之一。

**触发时机**（`syncMarkdownRelations(rid)`，`repository.cjs:4134`）：

| 时机 | 位置 |
|---|---|
| note 资源创建/导入后 | `createResource` / `importFile`（`:549`、`:4826` 内容变更 rehash 后） |
| 内容更新后 | `updateResource`（`:4826`） |
| `lo sync --wikilinks` 全量重建 | `sync` 的 `wikilinks` 选项（`:4670`） |
| 全量重建命令 | `rebuildAllMarkdownRelations`（`:4324`） |

仅 `type === 'note'` 的 Markdown 资源参与解析（`:4143`）。

## 3. 保存模型：文本即事实 + 派生关系

**两级保存，明确分离**：

1. **文本即事实（Source of Truth）**：`[[Target]]` 原文保存在资源文件内容里——
   Core 不认识 Markdown 的 H1/链接语法（018 §5：Core 不解释内容语义）。
2. **派生关系（Derived）**：解析结果落库为 `relations` 表记录，**可随时全量重建**。

`syncMarkdownRelations` 流程（事务内原子执行，`:4157-4225`）：

```
read content → MarkdownParser.parse → BEGIN
  ├─ 删除旧派生：type='wikilink' 且 origin='markdown_parser'（或 origin 为 NULL 的历史数据）
  │              + type='embed' 且 origin='markdown_parser'
  ├─ 每个 wikilink：target → _resolveWikiLinkTarget（见 §4）
  │   → relationService.create(rid, targetRid, 'wikilink', { origin: 'markdown_parser' })
  │     （target 解析失败/自引用跳过；UNIQUE 冲突静默跳过）
  └─ 每个 embed 同理（type='embed'，metadata 含 alt/title）
COMMIT
```

- **幂等**：删除旧 + 建新 = 内容变化后关系与文本始终一致；
- **origin 标记**：`metadata.origin = 'markdown_parser'` 标识派生来源，可安全全量重建；
- 解析失败（文件读取错误等）返回 `{ error }`，不影响调用方。

## 4. 与 Relation 的关系（核心结论）

- **wikilink 就是一条 Relation**：`relations` 表 `(from_rid, to_rid, type='wikilink', metadata)`；
  表结构有 `UNIQUE(from_rid, to_rid, type)` 唯一约束（`001_initial_schema.cjs`）。
- **target → RID 解析**（`_resolveWikiLinkTarget` → `resolveResource`，`:4241`）：
  复用统一资源解析：**rid > name > path** 三级（018 命名模型：name 为 canonical name，
  输入统一 `normalizeResourceName`）。
- **单向存储，双向语义靠查询**：`relationService.create` 只建 `A → B` 一条（wikilink
  语义）；**反向（backlink）经 `graphEngine.incoming(rid)` 查询 `to_rid` 得到**
  （`getBacklinks`，`:1848`）。对比：`reference` 类型才显式建双向两条
  （`linkResources`，`:1831`：wikilink 分支只建单向）。
- **写入口统一**：`syncMarkdownRelations` 内部经 `relationService.create`；
  `linkResources(..., 'wikilink')` 经 `createRelation`（`relation.create` operation，
  可撤销）——都走 Operation 写路径收敛。
- **删除语义**：软删（deleted=1）；parser 重建时按 origin 定向清理，不动用户手动建的关系
  （origin 为 NULL 的历史 wikilink 数据也清理，保证一致性）。

## 5. 对编辑器补全的语义要求

编辑器补全（`@lo/editor-assist`）插入的文本最终会被 `syncMarkdownRelations` 解析：

1. **插入必须是 `[[canonical_name]]`**——target 会经 `resolveResource` 按 name 匹配；
   候选来自 `notes.list`（name 即 canonical name），插入 `[[name]]` 保证解析命中；
2. **别名语法** `[[name|别名]]` 同样被支持（alias 为显示名，target 仍是 name）；
3. **保存时机**：内容保存/更新后 Core 自动重建 wikilink relation——补全不写关系，
   只负责产出正确文本；
4. **候选语义**：`[[`（空 token）→ 最近笔记；`[[J` → 按 J 搜索——与 §4 的
   resolveResource（name 精确）互补：补全帮助选名，保存后 Core 负责解析落库。

## 6. 相关代码索引

| 模块 | 位置 |
|---|---|
| WikiLink 语法解析 | `packages/core/src/utils/wikilinkParser.cjs` |
| 聚合解析入口 | `packages/core/src/utils/markdownParser.cjs` |
| 派生关系同步（事务重建） | `packages/core/src/repo/repository.cjs` `syncMarkdownRelations` |
| target → RID | `repository.cjs` `_resolveWikiLinkTarget` / `resolveResource` |
| 反向查询（backlink） | `graphEngine.incoming` / `repository.getBacklinks` |
| 关系存储 | `relations` 表（`UNIQUE(from_rid,to_rid,type)`，软删） |
| 相关实现文档 | `core/core/markdown-image-relations.md`（embed 专项） |
