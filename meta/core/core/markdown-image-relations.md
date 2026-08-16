# Markdown 图片引用关系功能 — 完整实现文档

> 本文档记录实现细节、设计决策、已知约束，供未来评估与维护参考。
> 最后更新：2026-07-30

---

## 1. 概述

为 lo 系统增加 **Markdown 文件中图片引用的关系解析能力**。当 Markdown 资源中包含 `![alt](path)` 或 `<img src="path">` 形式的图片引用时，系统自动将其解析为 Resource 间的 `embed` 类型关系。

### 核心价值

- 图片引用成为一等公民：Markdown 中的图片不再只是裸路径，而是被解析为可查询、可追踪的 Resource Relation
- 复用现有架构：图片仍是普通 Resource，不引入独立图片模型或存储体系
- 派生关系自动化：Relation 由内容解析派生，Markdown 内容是唯一真相来源

### 技术约束

| 约束 | 说明 |
|------|------|
| **RID 优先** | 所有资源查找通过 RID 或 name，不依赖文件路径做资源匹配 |
| **不侵入 Core** | 图片解析逻辑独立于 Resource 生命周期管理 |
| **事务原子性** | 关系重建在 SQLite 事务中执行，保证删除+创建的原子性 |
| **向后兼容** | 旧 wikilink（无 origin 字段）可被正确清理 |

---

## 2. 设计原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | RID 优先架构 | 所有资源查询使用 RID 或 name。路径仅用于文件系统 IO |
| 2 | 图片资源统一管理 | 图片复用 Resource 生命周期。禁止创建 `ImageResource` 特殊模型 |
| 3 | 派生关系隔离 | `embed` / `wikilink`（解析产生）vs `reference`（用户创建）通过 `metadata.origin` 隔离 |
| 4 | Markdown 内容是真相来源 | Relation 数据库是索引结果，Markdown 文件内容才是最终事实 |
| 5 | 全量重建策略 | 每次解析先删后建，避免状态不一致 |
| 6 | 不侵入 Resource Core | 解析逻辑独立于 Resource 生命周期管理 |

---

## 3. 模块架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Core Utility Layer                        │
│                                                              │
│  src/utils/markdownParser.cjs  统一解析入口（核心能力）    │
│  ├── parse(content)            → { wikilinks, embeds }     │
│  ├── parseWikiTargets(content) → string[]                  │
│  └── parseImagePaths(content)  → string[]                  │
│                                                              │
│  src/utils/markdownImageParser.cjs  图片引用解析器（核心）  │
│  ├── parse(markdown)            → EmbedRef[]                │
│  ├── parsePaths(markdown)      → string[]                  │
│  └── _extractUrlPart(text)    → {urlPart, rest}            │
│                                                              │
│  src/utils/wikilinkParser.cjs    (已有，未修改)           │
└───────────────────────┬─────────────────────────────────────┘
                        │ 被调用
┌───────────────────────▼─────────────────────────────────────┐
│                     Repository Layer                         │
│  src/repo/repository.cjs                                    │
│                                                              │
│  新增方法:                                                   │
│  ├── syncMarkdownRelations(rid)   单资源关系同步 [事务]    │
│  ├── syncAllMarkdownRelations()   全量重建                │
│  ├── _resolveImageResource(res, path)  三级路径解析       │
│  ├── _resolveWikiLinkTarget(target)    Wikilink 解析       │
│  └── _extractResourceName(filePath)  名称提取工具         │
│                                                              │
│  src/repo/relationService.cjs                               │
│                                                              │
│  新增方法:                                                   │
│  ├── removeByFromRidAndType(fromRid, type, origin) 按源删除 │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 文件变更清单

### 4.1 新增文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/utils/markdownImageParser.cjs` | ~130 | Markdown 图片引用解析器 |
| `src/utils/markdownParser.cjs` | ~55 | 统一解析入口，聚合 wikilink + embed |
| `test/repo/embedRelations.test.cjs` | ~150 | 10 个集成测试用例 |
| `test/utils/markdownImageParser.test.cjs` | ~110 | 21 个解析器单元测试 |

### 4.2 修改文件

| 文件 | 变更类型 | 具体变更 |
|------|----------|----------|
| `src/repo/repository.cjs` | 新增方法 | `syncMarkdownRelations`、`syncAllMarkdownRelations`、`_resolveImageResource`、`_resolveWikiLinkTarget`、`_extractResourceName` |
| `src/repo/repository.cjs` | 修改调用点 | `importFile`、`sync`、`_handleFileEvent` 中插入 `syncMarkdownRelations` 调用；`path.toLowerCase().endsWith('.md')` → `type === 'note'` |
| `src/repo/relationService.cjs` | 新增方法 | `removeByFromRidAndType(fromRid, type, origin)` |

---

## 5. 事务保障机制

### 5.1 问题背景

`syncMarkdownRelations` 原实现为非原子操作：

```
旧流程（有风险）:
  1. DELETE 旧 wikilink 关系
  2. DELETE 旧 embed 关系
  3. ... 解析 content ...
  4. INSERT 新 wikilink 关系
  5. INSERT 新 embed 关系
  ↓
  若步骤 3-5 之间 crash（进程异常、OOM、数据库锁定超时）：
  - 该资源的所有派生关系全部丢失
  - 没有回滚机制
```

### 5.2 解决方案

在 `syncMarkdownRelations` 中使用 SQLite 事务包裹整个删除+创建流程：

```javascript
async syncMarkdownRelations(rid) {
  // ...
  await this.db.exec('BEGIN');
  try {
    // 1. 删除旧关系（origin 过滤）
    await this.relationService.removeByFromRidAndType(rid, 'wikilink', 'markdown_parser');
    await this.db.run(
      `DELETE FROM relations WHERE from_rid = ? AND type = ? AND json_extract(metadata, '$.origin') IS NULL`,
      [rid, 'wikilink']
    );
    await this.relationService.removeByFromRidAndType(rid, 'embed', 'markdown_parser');

    // 2. 创建新关系（逐条，内部 UNIQUE 冲突静默跳过）
    for (const wl of wikilinks) { /* ... */ }
    for (const emb of embeds) { /* ... */ }

    await this.db.exec('COMMIT');
    return result;
  } catch (txError) {
    await this.db.exec('ROLLBACK');
    throw txError;
  }
}
```

### 5.3 事务特性

| 特性 | 说明 |
|------|------|
| **原子性** | 删除+创建作为一个整体执行。任何步骤失败，全部回滚 |
| **隔离性** | 在 WAL 模式下，读操作不受未提交事务影响 |
| **一致性** | 只有 COMMIT 后其他连接才能看到新状态 |
| **回滚范围** | 仅回滚当前 `syncMarkdownRelations` 操作产生的变更 |

### 5.4 事务内的逐条插入

在事务内部，对每个关系执行单独的 `INSERT`：

- 遇到 `UNIQUE` 约束冲突（`from_rid + to_rid + type` 重复），静默跳过该条
- 不中断整个事务
- 全部处理完毕后统一 `COMMIT`

### 5.5 错误处理层级

```
Layer 1 (外部): try-catch
  → 捕获资源不存在、文件读取失败等
  → 返回 { wikilinks: 0, embeds: 0, broken: 0, error: msg }

Layer 2 (事务内): try-catch
  → 捕获解析/创建过程中的错误
  → 执行 ROLLBACK
  → 重新抛出错误给 Layer 1
```

---

## 6. 路径解析三级回退策略

### 6.1 问题背景

Markdown 中的图片引用路径（如 `./assets/photo.png`）需要映射到系统 Resource。直接用文件名查找在多目录场景下会产生冲突。

### 6.2 三级回退流程

```
_resolveImageResource(sourceResource, targetPath)
│
├── Guard: 远程 URL / data: 协议 → 返回 null
│
├── Level 1: RID 直接匹配
│   条件: targetPath.startsWith('res_')
│   操作: resolveResource(targetPath) → getByRid
│   用途: 用户显式使用 RID 引用，100% 准确
│   例: ![photo](res_abc123)
│
├── Level 2: 路径上下文拼接
│   条件: sourceResource.path 存在
│   操作:
│     sourceDir = sourceResource.path.replace(/[^/\\]*$/, '')
│     combinedPath = sourceDir + targetPath.replace(/^\.\/?/)
│     resolveResource(combinedPath)
│   用途: 基于 Markdown 文件所在目录解析相对路径
│   例: notes/test.md 引用 ./assets/photo.png
│       → notes/assets/photo.png
│
└── Level 3: 纯文件名查找（最后兜底）
    条件: Level 1 和 Level 2 均未命中
    操作:
      name = _extractResourceName(targetPath)
      resolveResource(name) → getByName
    用途: 全局唯一文件名的快速匹配
    例: assets/img.png → img
```

### 6.3 路径上下文拼接详解

```javascript
// sourceResource.path = "notes/my-notes.md"
// targetPath = "./assets/photo.png"

const sourceDir = sourceResource.path.replace(/[^/\\]*$/, '');
// → "notes/"

const combinedPath = sourceDir + targetPath.replace(/^\.\/?/);
// → "notes/assets/photo.png"

// 特殊情况: targetPath = "../assets/photo.png"
// → "notes/" + "../assets/photo.png" = "notes/../assets/photo.png"
// resolveResource 内部会处理路径归一化
```

### 6.4 三级回退的设计理由

| 级别 | 精确性 | 性能 | 适用场景 |
|------|--------|------|----------|
| Level 1 (RID) | 100% | O(1) | 显式 RID 引用 |
| Level 2 (路径) | 高 | O(log n) | 同项目内相对路径 |
| Level 3 (name) | 低 | O(log n) | 全局唯一文件名兜底 |

Level 2 是核心方案，Level 3 是兼容兜底。当 Level 2 能正确处理时，同名资源冲突的概率极低。

---

## 7. 历史数据兼容

### 7.1 问题背景

系统早期的 wikilink 关系没有 `metadata.origin` 字段（或 origin 为 null）。新增的 origin 过滤删除逻辑无法清理这些历史数据。

### 7.2 兼容方案

在事务内使用双条件删除：

```sql
-- 删除新格式数据（有 origin 字段）
DELETE FROM relations
WHERE from_rid = ? AND type = 'wikilink'
  AND json_extract(metadata, '$.origin') = 'markdown_parser'

-- 同时删除历史数据（origin 为 NULL）
DELETE FROM relations
WHERE from_rid = ? AND type = 'wikilink'
  AND json_extract(metadata, '$.origin') IS NULL
```

等价于：删除所有由解析产生的 wikilink，无论新旧格式。

### 7.3 embed 不需要此兼容

embed 是本次新增功能，所有记录都有 `origin: 'markdown_parser'`。因此只需一条删除语句：

```sql
DELETE FROM relations
WHERE from_rid = ? AND type = 'embed'
  AND json_extract(metadata, '$.origin') = 'markdown_parser'
```

### 7.4 用户创建的 wikilink 不受影响

如果未来用户可以通过 `lo relation add --type wikilink` 手动创建 wikilink 关系，这些关系的 `origin` 为 `user`（或默认值），不会被 `removeByFromRidAndType` 的 `markdown_parser` 过滤删除。

---

## 8. 括号嵌套路径解析

### 8.1 问题背景

标准 Markdown 图片解析使用非贪婪正则 `/^(.+?)(?:\s+"([^"]*)")?\)/`，遇到路径中的括号会提前截断：

```markdown
![diagram](state(1).png)
```

正则匹配结果: `target_path = "state(1"`（丢失 `.png`）

### 8.2 解决方案

改用括号计数法（depth-based matching）：

```javascript
static _extractUrlPart(afterBracket) {
  if (!afterBracket || afterBracket[0] !== '(') return null;

  let depth = 0;
  for (let i = 0; i < afterBracket.length; i++) {
    if (afterBracket[i] === '(') {
      depth++;
    } else if (afterBracket[i] === ')') {
      depth--;
      if (depth === 0) {
        return {
          urlPart: afterBracket.substring(1, i),
          rest: afterBracket.substring(i + 1)
        };
      }
    }
  }
  return null;
}
```

### 8.3 解析流程变化

```
旧流程（正则一步完成）:
  ![alt](path)
  → 正则: /!\[([^\]]*)\]\(\s*(?!https?:|data:|<)/g
  → 正则: /^(.+?)(?:\s+"([^"]*)")?\)/
  → 结果: target_path = "path"
  ↓
  问题: path = "state(1).png" → 截断

新流程（分步 + 括号计数）:
  Step 1: /!\[([^\]]*)\]/g → 匹配 ![alt]
  Step 2: 切片剩余文本，检查以 ( 开头
  Step 3: _extractUrlPart() 括号计数找匹配的 )
  Step 4: 从 urlPart 中提取 path 和可选 title
```

### 8.4 边界用例

| 输入 | 输出 | 说明 |
|------|------|------|
| `![alt](state(1).png)` | `target_path = "state(1).png"` | ✅ 正确处理嵌套括号 |
| `![alt](path/to/file.png)` | `target_path = "path/to/file.png"` | ✅ 标准路径 |
| `![alt](path.png "title")` | `target_path = "path.png"`, `title = "title"` | ✅ 带标题 |
| `![alt]()` | `null` | 空路径跳过 |
| `![alt](https://example.com)` | `null` | 远程 URL 跳过 |

---

## 9. 解析器实现细节

### 9.1 MarkdownImageParser 解析流程

```
输入: Markdown 文本
  │
  ├─ 遍历 Markdown 图片语法:
  │   1. 正则匹配 ![alt]
  │   2. 检查后续是否以 ( 开头
  │   3. 排除远程 URL / data: / HTML 标签
  │   4. _extractUrlPart() 提取括号内容
  │   5. 解析为 { target_path, alt, title? }
  │   6. 去重（以 target_path 为 key）
  │   7. 推进 lastIndex 跳过已匹配内容
  │
  ├─ 遍历 HTML <img> 标签:
  │   1. 正则匹配 <img ... src="..." ...>
  │   2. 排除远程 URL / data:
  │   3. 提取 alt 属性
  │   4. 去重
  │
  └─ 返回 EmbedRef[]
```

### 9.2 排除远程 URL 的时机

```javascript
// 在 _extractUrlPart 之前检查，避免无意义的括号计数
const innerContent = afterBracket.substring(1).replace(/^\s+/, '');
if (/^(https?:|data:|<)/.test(innerContent)) continue;
```

检查点在 `(` 之后、`)` 之前的内容。这样 `![](http://example.com/img.png)` 会被正确排除。

### 9.3 HTML `<img>` 标签解析

```javascript
const htmlImgRegex = /<img\s+[^>]*?src=["']([^"']+)["'][^>]*?\/?\s*>/gi;

// 特点:
// - 支持单引号和双引号: src="path" 或 src='path'
// - 支持自闭合标签: <img ... /> 或 <img ... >
// - alt 属性单独提取: /alt=["']([^"']*)["']/i
// - alt 缺失时默认为空字符串
```

### 9.4 去重策略

以 `target_path` 为唯一键（Set），相同路径只返回首次出现的引用。Markdown 中同一图片可能被多次引用，只产生一条关系。

### 9.5 MarkdownParser 聚合

```javascript
// 两次遍历（分别调用两个子解析器）
static parse(content) {
  return {
    wikilinks: WikiLinkParser.parse(content),
    embeds: MarkdownImageParser.parse(content)
  };
}
```

注释：实际对 content 做了两次遍历。对普通 Markdown（< 100KB）性能影响可忽略。如果未来需要优化，可以合并为单次遍历。

---

## 10. _extractResourceName 实现细节

### 10.1 处理步骤

```
输入: filePath = "2026-07-30-会议纪要-a1b2c3d4.md"

Step 1: 提取文件名
  lastSlash = max(lastIndexOf('/'), lastIndexOf('\\'))
  fileName = "2026-07-30-会议纪要-a1b2c3d4.md"

Step 2: 去除扩展名
  lastDot = lastIndexOf('.')
  fileName = "2026-07-30-会议纪要-a1b2c3d4"

Step 3: 去除日期前缀
  fileName.replace(/^\d{4}-\d{2}-\d{2}-/, '')
  fileName = "会议纪要-a1b2c3d4"

Step 4: 去除随机后缀
  fileName.replace(/-[a-f0-9]{8}$/, '')
  fileName = "会议纪要"
```

### 10.2 输入输出映射

| 输入 | 输出 | 说明 |
|------|------|------|
| `"assets/img.png"` | `"img"` | 标准路径 |
| `"../photo.jpg"` | `"photo"` | 上级目录 |
| `"photo.jpg"` | `"photo"` | 纯文件名 |
| `"2026-07-30-笔记-a1b2c3d4.md"` | `"笔记"` | 带日期和随机后缀 |
| `null` / `""` | `null` | 空值保护 |
| `".hidden"` | `"hidden"` | 以点开头的文件 |

---

## 11. Relation 元数据结构

### 11.1 embed 关系

```json
{
  "origin": "markdown_parser",
  "alt": "图片描述",
  "title": "My Title"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `origin` | string | 固定为 `"markdown_parser"`，标识为解析派生关系 |
| `alt` | string | Markdown `![alt]` 中的 alt 文本 |
| `title` | string? | 可选，`![alt](path "title")` 中的 title |

### 11.2 wikilink 关系

```json
{
  "origin": "markdown_parser"
}
```

新增 `origin` 字段用于区分解析产生的 wikilink。旧数据没有此字段，通过 `IS NULL` 条件兼容。

### 11.3 origin 取值约定

| origin | 含义 | 处理方式 |
|--------|------|----------|
| `markdown_parser` | Markdown 解析产生的派生关系 | `lo sync` 全量重建 |
| `user` | 用户手动创建的关系 | `lo sync` 不影响 |
| `null` | 历史数据（wiklilink 旧格式） | `lo sync` 时清除并重建 |

---

## 12. 调用点清单

以下位置调用 `syncMarkdownRelations`：

| 调用点 | 文件 | 触发条件 | 说明 |
|--------|------|----------|------|
| `importFile` | `repository.cjs` | 导入 note 类型资源后 | 新导入的 Markdown 文件立即解析 |
| `_handleFileEvent` | `repository.cjs` | note 类型资源文件变更时 | 编辑保存后自动重新解析 |
| `sync` | `repository.cjs` | 批量同步 note 资源时 | 全量同步流程中触发 |
| `syncAllMarkdownRelations` | `repository.cjs` | 主动调用全量重建 | 修复/初始化时使用 |

所有调用点均使用 `resource.type === 'note'` 判断，不再依赖文件扩展名。

---

## 13. 测试覆盖

### 13.1 单元测试（test/utils/markdownImageParser.test.cjs）

| # | 测试用例 | 验证点 |
|---|----------|--------|
| 1 | standard markdown image | `![alt](path)` 基本解析 |
| 2 | image with title | `![alt](path "title")` 带标题 |
| 3 | empty alt | `![](path)` 空 alt |
| 4 | relative path ./ | `![alt](./path)` 相对路径 |
| 5 | path with spaces | `![alt](my path.png)` 含空格 |
| 6 | path with spaces + title | 空格+标题组合 |
| 7 | HTML img tag | `<img src="path">` HTML 标签 |
| 8 | HTML img without alt | `<img src="path">` 无 alt |
| 9 | HTML img single quotes | `<img src='path'>` 单引号 |
| 10 | exclude HTTP URLs | `![alt](http://...)` 排除 |
| 11 | exclude HTTPS URLs | `![alt](https://...)` 排除 |
| 12 | exclude data: URIs | `![alt](data:...)` 排除 |
| 13 | multiple images | 多个图片引用 |
| 14 | deduplicate same path | 同路径去重 |
| 15 | empty content | 空内容返回空数组 |
| 16 | null/undefined input | 空值保护 |
| 17 | content without images | 无图片内容 |
| 18 | mixed markdown + HTML | 混合语法 |
| 19 | not confuse wikilinks | `[[wikilink]]` 不误判 |
| 20 | parsePaths unique | parsePaths 返回去重路径 |
| 21 | parsePaths empty | parsePaths 空数组 |

### 13.2 集成测试（test/repo/embedRelations.test.cjs）

| # | 测试用例 | 验证点 |
|---|----------|--------|
| 1 | 同目录图片引用 | `![alt](photo.png)` 创建 embed 关系 |
| 2 | 子目录图片引用 | `![alt](assets/photo.png)` 路径上下文拼接 |
| 3 | 上级目录相对路径 | `![alt](../assets/photo.png)` `../` 路径解析 |
| 4 | broken reference | 图片不存在时 broken 计数 |
| 5 | 多图片引用 | 同一文件多个 `![alt](...)` |
| 6 | 排除远程 URL | 远程 URL 不产生关系 |
| 7 | 重新同步重建 | 删引用后重新同步，旧关系清除 |
| 8 | HTML img 标签 | `<img src="...">` 创建 embed 关系 |
| 9 | Wikilink + Embed 混合 | 同时解析两种引用类型 |
| 10 | 返回计数验证 | 返回值 `{ wikilinks, embeds, broken }` 正确 |

### 13.3 测试结果

```
Test Suites: 31 passed, 31 total
Tests:       231 passed, 231 total
```

---

## 14. 约束与已知边界

### 14.1 已实现能力

- ✅ 标准 Markdown 图片语法解析
- ✅ 带标题的图片语法 `![alt](path "title")`
- ✅ HTML `<img>` 标签解析（双引号、单引号）
- ✅ 路径含括号解析（`state(1).png`）
- ✅ 相对路径解析（同目录、子目录、`../`）
- ✅ 路径上下文拼接（基于 source resource 目录）
- ✅ RID 直接匹配
- ✅ 远程 URL 排除（http/https）
- ✅ base64/data 协议排除
- ✅ `<img>` 标签远程 URL / data 排除
- ✅ 重复引用去重
- ✅ 全量重建策略
- ✅ SQLite 事务原子性
- ✅ 历史数据兼容（无 origin 字段的 wikilink）
- ✅ Wikilink + Embed 统一解析
- ✅ Broken reference 计数
- ✅ 与现有 FileWatcher / importFile 集成
- ✅ 所有调用点使用 `resource.type === 'note'`
- ✅ 核心解析器 `MarkdownParser` 直接调用

### 14.2 已知边界

| # | 边界场景 | 当前处理 | 评估 |
|---|----------|----------|------|
| 1 | 图片路径含 `)` 以外特殊字符 | 正常处理 | 可接受 |
| 2 | 同名图片在不同目录 | Level 2 路径上下文可解决大多数场景 | 可接受 |
| 3 | 超大 Markdown 文件（> 1MB） | 两次遍历，性能可接受 | 未来可合并为单次遍历 |
| 4 | 嵌套 `<img>` 内联 `<script>` | 正则无法处理，但 Markdown 规范不允许 | 低风险 |
| 5 | emoji 作为 alt 文本 | 直接作为字符串存储 | 可接受 |
| 6 | 批量同步时部分资源失败 | 单资源 try-catch，不影响其他资源 | 可接受 |
| 7 | 事务内大量 INSERT（> 1000） | WAL 模式下可接受 | 未来可考虑批量 INSERT |

### 14.3 未实现（按设计分阶段）

| 阶段 | 能力 | 说明 |
|------|------|------|
| Phase 2 | Orphan image 检测 | 检测无 embed 关系的图片 Resource |
| Phase 2 | Broken reference 管理 | 提供 broken 引用的查询 API |
| Phase 2 | 删除保护 | 检查 embed 关系后禁止删除图片 |
| Phase 3 | 图片浏览视图 | 前端图片预览组件 |
| Phase 3 | 缩略图生成 | 自动生成缩略图缓存 |
| Phase 3 | OCR 文字识别 | 提取图片中的文字内容 |
| Phase 3 | EXIF 信息读取 | 读取图片元数据 |

---

## 15. API 使用示例

### 15.1 直接使用核心解析器

```javascript
const MarkdownParser = require('./src/utils/markdownParser.cjs');

const { wikilinks, embeds } = MarkdownParser.parse('![photo](img.png)\n\n[[res_abc_0011223344556677]]');
// embeds → [{ type: 'embed', target_path: 'img.png', alt: 'photo', raw: '![photo](img.png)' }]
// wikilinks → [{ targetRid: 'res_abc_0011223344556677', alias: null, raw: '[[res_abc_0011223344556677]]' }]

// 快捷 API
const paths = MarkdownParser.parseImagePaths('![a](x.png) ![b](y.png)'); // → ['x.png', 'y.png']
const targets = MarkdownParser.parseWikiTargets('[[foo]] [[bar]]');       // → ['foo', 'bar']
```

### 15.2 Repository 层同步

```javascript
// 单个资源同步（事务保障）
const result = await repo.syncMarkdownRelations('res_abc123');
// → { wikilinks: 1, embeds: 2, broken: 0 }

// 全量重建
const all = await repo.syncAllMarkdownRelations();
// → { wikilinks: 150, embeds: 320, broken: 5, errors: [] }
```

### 15.3 直接使用解析器

```javascript
const MarkdownImageParser = require('./src/utils/markdownImageParser.cjs');

// 解析 Markdown 图片引用
const refs = MarkdownImageParser.parse('![alt](state(1).png "My Title")');
// → [{
//     type: 'embed',
//     target_path: 'state(1).png',
//     alt: 'alt',
//     title: 'My Title',
//     raw: '![alt](state(1).png "My Title")'
//   }]

// 提取路径列表
const paths = MarkdownImageParser.parsePaths('![a](x.png) ![b](y.png) ![c](x.png)');
// → ['x.png', 'y.png']  去重
```

### 15.4 RelationService 直接调用

```javascript
// 按 origin 过滤删除派生关系
await relationService.removeByFromRidAndType('res_abc', 'embed', 'markdown_parser');
// → { removed: 3 }

// 不带 origin 过滤 → 删除所有该类型关系
await relationService.removeByFromRidAndType('res_abc', 'embed');
// → { removed: 5 }
```

---

## 16. 架构演进记录

| 版本 | 变更 | 原因 |
|------|------|------|
| v1.0 | 独立 `markdownImageParser.cjs` | 初始实现，仅解析图片引用 |
| v1.1 | 合并为 `markdownParser.cjs` 统一入口 | 避免 `wikilinkParser` 和 `markdownImageParser` 分散调用 |
| v1.2 | 合并 `syncWikilinks` + `syncEmbedRelations` | 避免重复读取文件和解析内容 |
| v1.2 | `path.toLowerCase().endsWith('.md')` → `resource.type === 'note'` | RID 优先架构，不依赖路径判断 |
| v1.3 | 改用 `resolveResource` 替代自定义查找逻辑 | 统一查找策略，复用已有方法 |
| v1.4 | SQLite 事务包裹删除+创建 | 保障原子性，防止 crash 导致关系丢失 |
| v1.4 | 路径解析三级回退 | 解决同名图片冲突 |
| v1.4 | wikilink 删除加入 origin 过滤 | 区分解析关系与用户关系 |
| v1.4 | 括号计数法替代正则 | 支持路径含括号（如 `state(1).png`） |
| v1.4 | 历史数据兼容删除 | 清理无 origin 字段的旧 wikilink |