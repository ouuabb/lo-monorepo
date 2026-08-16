# 双向链接（wikilink）——rid-based 身份模型

> 目的：厘清 lo 系统对 `[[...]]` 双向链接语法的**完整处理链路**（解析 / 保存 / 与 Relation
> 的关系），供编辑器补全等上层功能对齐语义。本文基于代码事实（packages/core）。
>
> **身份模型**：Wikilink 的 identity 是 **rid**（`[[rid]]` / `[[rid|alias]]` 为唯一语法）。
> name 不参与身份解析——`[[名字]]` 是旧语法，已移除（无兼容层）。

## 1. 语法定义

| 语法 | 含义 | 解析结果 |
|---|---|---|
| `[[res_xxx]]` | 引用 rid 为 `res_xxx` 的资源 | `{ targetRid: 'res_xxx', alias: null }` |
| `[[res_xxx\|别名]]` | 引用 rid，显示别名 | `{ targetRid: 'res_xxx', alias: '别名' }` |

解析正则（`src/utils/wikilinkParser.cjs`）：

```
/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
```

- token 与 alias 均 `trim()`；token 必须通过 `RidUtils.validate`
  （`/^res_[a-z0-9]+_[a-f0-9]+$/i`，见 `src/utils/rid.cjs`）才算合法 wikilink，
  否则该段文本**不产生任何解析结果**；
- `[[名字]]`（旧 name 语法）→ 解析为空，不报错、不建关系；
- 不匹配嵌套 `[[]]`、不匹配含 `|` 的 token（`|` 后为 alias）；
- `parseTargets` 提供去重 targetRid 列表；
- parser 纯语法 + RID 形状校验，**不碰数据库**（不做 name→rid 查询）。

## 2. 解析入口与一致性原则

**一致性原则（强约束）**：Markdown content 是事实，wikilink/embed relation 是**派生数据**。
任何正式 content mutation 写入口完成后，必须重建派生关系——不允许部分入口同步、
部分不同步，也不允许依赖调用方自行记得同步。

**唯一解析入口**：`src/utils/markdownParser.cjs`（`MarkdownParser.parse(content)`）——
聚合 Wikilink 与 Embed（`![alt](path)` / `<img>`）两种引用，返回
`{ wikilinks: [], embeds: [] }`。`WikiLinkParser` 是其子解析器之一。

**Content Mutation 全覆盖矩阵**（每个正式写入口完成后的行为）：

| 写入口 | 内容落盘 | 派生同步 | 触发位置 |
|---|---|---|---|
| `repository.createResource`（CLI new/daily、API create/upload、AI、automation） | 写文件 | ✅ | `repository.cjs` `_syncMarkdownRelationsSafe`（尾部） |
| `repository.importFile`（`lo import`） | 文件即内容 | ✅ | 同上（importFile 尾部） |
| `operations resource.update`（Agent 保存/API PUT/CLI edit 保存） | `resourceService.updateContent` | ✅ | `resourceUpdate.cjs` execute（content 更新后） |
| `operations resource.update` undo（内容回滚） | 快照写回 | ✅ | `resourceUpdate.cjs` undo（恢复后） |
| 外部编辑器直接改文件 | 文件直接改 | ✅ | FileWatcher change → hash 变化检测 → `_syncMarkdownRelationsSafe` |
| `lo sync --wikilinks` / `syncAllMarkdownRelations` | — | ✅（全量重建） | 手动 |
| decrypt/encrypt（文本不变） | 重写同内容 | 无需 | — |
| rename/move（内容不变） | 不写内容 | 无需 | — |
| 非 note 资源（text/json/...） | — | 不触发 | 仅 note 参与解析 |

**FileWatcher 生命周期**：`repo.startWatcher()` 在 `lo serve` 启动时启用（`--no-watch`
可禁用，测试/CI 用）；change 事件先 rehash 比较 hash，**仅内容实际变化才同步**
（operation 自身写文件产生的 change 事件不会重复同步——幂等 + hash 检测双重保证）。
同步本身幂等（事务内删旧建新），重复触发结果一致，不形成循环（同步不写文件）。

## 3. 保存模型：文本即事实 + 派生关系

**两级保存，明确分离**：

1. **文本即事实（Source of Truth）**：`[[rid]]` 原文保存在资源文件内容里——
   Core 不认识 Markdown 的 H1/链接语法（018 §5：Core 不解释内容语义）。
2. **派生关系（Derived）**：解析结果落库为 `relations` 表记录，**可随时全量重建**。

`syncMarkdownRelations` 流程（事务内原子执行）：

```
read content → MarkdownParser.parse → BEGIN
  ├─ 删除旧派生：type='wikilink' 且 origin='markdown_parser'（或 origin 为 NULL 的历史数据）
  │              + type='embed' 且 origin='markdown_parser'
  ├─ 每个 wikilink：targetRid 为合法 RID 时
  │   → getByRid(targetRid) 确认存在（不存在 → 跳过，不建 dangling 关系）
  │   → 跳过自引用（targetRid === 源资源 rid）
  │   → relationService.create(rid, targetRid, 'wikilink', { origin: 'markdown_parser' })
  │     （UNIQUE 冲突静默跳过）
  └─ 每个 embed 同理（type='embed'，metadata 含 alt/title）
COMMIT
```

- **幂等**：删除旧 + 建新 = 内容变化后关系与文本始终一致；
- **origin 标记**：`metadata.origin = 'markdown_parser'` 标识派生来源，可安全全量重建；
- **无 name 解析**：Wikilink 不再调用 `resolveResource`（旧 `_resolveWikiLinkTarget`
  已删除）；`resolveResource` 仅保留给通用场景（CLI/automation/embed 图片路径解析）；
- 解析失败（文件读取错误等）返回 `{ error }`，不影响调用方。

## 4. 与 Relation 的关系（核心结论）

- **wikilink 就是一条 Relation**：`relations` 表 `(from_rid, to_rid, type='wikilink', metadata)`；
  表结构有 `UNIQUE(from_rid, to_rid, type)` 唯一约束（`001_initial_schema.cjs`）。
- **targetRid 即关系目标**：parser 输出的 `targetRid` 直接作为 `to_rid` 建关系
  （`getByRid` 存在性校验），**不经过任何 name 匹配**；
- **改名与 wikilink 解耦**：`renameResource` 只改 `resource.name`（走
  `resource.update` operation，可撤销；rid/location/layer/content/metadata 不变），
  **不重写任何 `[[rid]]` 引用**——引用始终指向同一 rid，改名后关系不变，
  显示名（alias ?? resource.name）随之更新；
- **显示语义**：`alias` 为空时显示 `resource.name`（反查 rid 得名），有 alias 时显示
  alias——两者都是 presentation，不落关系；
- **单向存储，双向语义靠查询**：`relationService.create` 只建 `A → B` 一条（wikilink
  语义）；**反向（backlink）经 `graphEngine.incoming(rid)` 查询 `to_rid` 得到**
  （`getBacklinks`）。对比：`reference` 类型才显式建双向两条
  （`linkResources`：wikilink 分支只建单向）。
- **写入口统一**：`syncMarkdownRelations` 内部经 `relationService.create`；
  `linkResources(..., 'wikilink')` 经 `createRelation`（`relation.create` operation，
  可撤销）——都走 Operation 写路径收敛。
- **删除语义**：软删（deleted=1）；parser 重建时按 origin 定向清理，不动用户手动建的关系
  （origin 为 NULL 的历史 wikilink 数据也清理，保证一致性）。
- **dangling 语义**：`[[rid]]` 指向不存在的资源 → 解析不报错，**不建关系**
  （保持可写状态，编辑器补全插入后关系由保存链路建立）。

## 5. 对编辑器补全的语义要求

编辑器补全（`@lo/editor-assist`）插入的文本最终会被 `syncMarkdownRelations` 解析：

1. **插入必须是 `[[rid]]`**——候选（`CompletionCandidate`）携带 `rid` 字段，
   `insertText = '[[${rid}]]'`，`label` 仍为资源 name（UI 展示用）；
2. **候选身份是 rid**：去重按 rid（不按 name）；`[[`（空 token）→ 最近笔记；
   `[[J` → 按 J 搜索（name 搜索，帮助用户找到目标，插入仍写 rid）；
3. **别名语法** `[[rid|别名]]` 同样被支持（alias 为显示名，targetRid 仍是 rid）；
4. **保存时机**：内容保存/更新后 Core 自动重建 wikilink relation——补全不写关系，
   只负责产出正确文本；
5. **渲染层**：lo 目前没有把 `[[...]]` 渲染成可点击链接的实现（无 Markdown 渲染引擎）；
   待渲染层落地时按「alias ?? resource.name」解析显示名（rid 反查，见 §4）。

## 6. 相关代码索引

| 模块 | 位置 |
|---|---|
| WikiLink 语法解析（RID 校验） | `packages/core/src/utils/wikilinkParser.cjs` |
| RID 生成/校验 | `packages/core/src/utils/rid.cjs`（`RidUtils.validate`） |
| 聚合解析入口 | `packages/core/src/utils/markdownParser.cjs` |
| 派生关系同步（事务重建） | `packages/core/src/repo/repository.cjs` `syncMarkdownRelations` |
| targetRid 存在性校验 / 自引用跳过 | 同上（getByRid，无 name 解析） |
| 反向查询（backlink） | `graphEngine.incoming` / `repository.getBacklinks` |
| 关系存储 | `relations` 表（`UNIQUE(from_rid,to_rid,type)`，软删） |
| 编辑器补全（候选 rid + 插入 `[[rid]]`） | `packages/editor-assist`（`candidate.cjs` / `types/index.d.ts`） |
| 相关实现文档 | `core/core/markdown-image-relations.md`（embed 专项） |
