# Note 类型 Markdown 图片处理调研文档

> 调研范围：`lo-monorepo` 单仓（CWD）
> 调研日期：2026-08-17
> 调研方式：源码静态阅读 + 交叉验证，未做任何修改
> 文档定位：项目根目录下的**调研笔记**，正式文档源仍在 `meta/`（与 `meta/AGENTS.md §5` 收敛原则一致；本文件按你的指示置于根目录，便于快速检索）

---

## 摘要 TL;DR

| # | 结论 | 关键证据 |
|---|---|---|
| 1 | `note` 不是带 schema 的类型，而是**一个字符串标签**，由 `.md` 扩展名经 `TYPE_MAP` 映射而来 | `packages/core/src/utils/resourceType.cjs:3-67` |
| 2 | 图片**不内联**为 base64、**不**走对象存储；是**与 markdown 同仓库**的独立二进制资源，存于 `{repoPath}/resources/` 目录 | `packages/core/src/repo/repository.cjs:602` · `packages/core/src/commands/serve.cjs:432-498` |
| 3 | Markdown 解析器是**自研正则 + 括号计数法**（`MarkdownImageParser`），不支持 remark/markdown-it；明确排除 `https?:` / `data:` / HTML 标签起点 | `packages/core/src/utils/markdownImageParser.cjs:1-144` |
| 4 | 每次 note 内容落地都会触发 `syncMarkdownRelations`：在 SQLite 事务中删旧 embed、建新 embed，关系元数据保存 `alt` / `title` | `packages/core/src/repo/repository.cjs:4148-4258` |
| 5 | 图片路径 → 目标 RID 是**三级回退**：`res_*` RID → 路径上下文拼接 → name 规范化 | `packages/core/src/repo/repository.cjs:4267-4295` |
| 6 | **已知缺口**：lo-agent 当前**没有内置图片预览 viewer**；内置只有 Monaco 编辑器；沙箱 + 无 raw 通道 → 用户写下的 `![](path)` 在 UI 上无法显示 | `apps/agent/src/renderer/src/editor/NoteEditor.jsx:1-84` · `apps/agent/src/renderer/src/services/viewerRegistry.js:10-22` |

---

## §0 术语与背景

lo Core 的世界模型只有 **Resource** 这一个实体，"类型"仅是一列字符串。`type='note'` 拥有三个关键同伴：

| 概念 | 形态 | 在 `resources` 表中的位置 |
|---|---|---|
| **note** | 文本/Markdown 资源，磁盘上是 `.md` 文件 | `type='note'` · `location_kind='local'` · `location='notes/xxx.md'` |
| **image** | 二进制图片资源，磁盘上是 `.png` / `.jpg` 等 | `type='image'`（由扩展名映射） |
| **embed** | 关系数据，**不是**资源 | `relations` 表中 `type='embed'`，`from_rid=noteRid`, `to_rid=imageRid`, `metadata.origin='markdown_parser'` |

**核心规则**：
- markdown 文本里 `![alt](path)` **不携带图片数据**，只携带路径。
- 路径在保存时由解析器识别，并通过解析回退策略转换为**目标 image resource 的 RID**，最终落库为一条 `embed` 关系。
- 渲染端如需显示图片，必须先找到 image resource，再读取其二进制内容（见 §5 现状与缺口）。

---

## §1 解析：如何从 Markdown 中识别图片

### §1.1 统一解析入口 `MarkdownParser`

`packages/core/src/utils/markdownParser.cjs:25-34`：

```js
const wikilinks = WikiLinkParser.parse(content);
const embeds = MarkdownImageParser.parse(content);
return { wikilinks, embeds };
```

聚合两个子解析器：
- `WikiLinkParser` —— 处理 `[[rid]]` / `[[rid|alias]]`
- `MarkdownImageParser` —— 处理 `![alt](path)` 与 `<img src=…>`

对外仅暴露这三类入口：`parse` / `parseWikiTargets` / `parseImagePaths`（`markdownParser.cjs:41-52`）。

### §1.2 `MarkdownImageParser` 实现细节

`packages/core/src/utils/markdownImageParser.cjs:1-144` 全文 144 行，是解析逻辑的**唯一**实现。

**支持的两种语法**（`:5-8` 注释明确）：

```
![alt](path/to/image.png)
![alt](path/to/image.png "title")
<img src="path/to/image.png" alt="">
<img src="./img.png" />
```

**明确不处理**（`:11-14` 注释明确）：

- 远程 URL（`http://` / `https://`）
- base64 内嵌图片
- `data:` 协议

#### 1.2.1 Markdown 语法分支（`:22-69`）

```js
const mdImageRegex = /!\[([^\]]*)\]/g;            // 第 30 行
```

1. 先匹配 `![alt]`；
2. 验证紧跟 `(` 开头；
3. 排除远程/内嵌：`if (/^(https?:|data:|<)/.test(innerContent)) continue;`（`:42`）
4. **括号计数法** `_extractUrlPart` 提取 URL 部分（处理路径中嵌套括号的情况如 `state(1).png`）；
5. 解析 `title`（URL 后空格 + `"..."` 形式）（`:50-52`）；
6. 去重（`seen` Set）并推入 `results`（`:55-65`）。

**括号计数法**（`:105-123`）：

```js
static _extractUrlPart(afterBracket) {
  if (!afterBracket || afterBracket[0] !== "(") return null;
  let depth = 0;
  for (let i = 0; i < afterBracket.length; i++) {
    if (afterBracket[i] === "(") depth++;
    else if (afterBracket[i] === ")") {
      depth--;
      if (depth === 0) {
        return {
          urlPart: afterBracket.substring(1, i),
          rest: afterBracket.substring(i + 1),
        };
      }
    }
  }
  return null;
}
```

这是为了兜住路径中带括号的情况，但**不解析 `(unbalanced)` 错误**——遇到没有收尾的括号会返回 `null`，被 `:46` 跳过。

#### 1.2.2 HTML img 标签分支（`:72-94`）

```js
const htmlImgRegex = /<img\s+[^>]*?src=["']([^"']+)["'][^>]*?\/?\s*>/gi;
```

- 同样排除 `https?:` / `data:` 协议（`:78`）；
- 提取 `alt` 属性（`:81-82`）；
- 复用 `seen` Set 去重。

#### 1.2.3 返回结构

```ts
{
  type: 'embed',
  target_path: string,   // 用户写的路径（保留原样，不预先 resolve）
  alt: string,
  title?: string,        // 仅 markdown 语法可能出现
  raw: string,           // 原始字符串，用于日志/回显
}
```

### §1.3 关键代码定位

| 文件 | 行号 | 作用 |
|---|---|---|
| `packages/core/src/utils/markdownImageParser.cjs` | 1-144 | 图片解析器（核心） |
| `packages/core/src/utils/markdownParser.cjs` | 25-34 | 聚合入口（wikilink + embed） |
| `packages/core/src/utils/wikilinkParser.cjs` | 1-61 | wikilink 解析器（兄弟） |
| `packages/core/test/utils/markdownImageParser.test.cjs` | 1-152 | 21 个解析用例（空/null/远程/嵌套括号/HTML/去重） |

---

## §2 存储：图片资源的存放方式

### §2.1 存储模型总览

**纯本地文件系统**，无任何远程对象存储。

```
{repoPath}/
├── resources/                           # 所有 resource 文件夹（resources 是仓库默认根名）
│   ├── notes/
│   │   ├── 2026-08-17-foo.md            # location = "notes/2026-08-17-foo.md"
│   │   └── 2026-08-17-foo/              # 配套目录
│   │       └── assets/
│   │           └── photo.png            # location = "notes/2026-08-17-foo/assets/photo.png"
│   └── images/                          # 或别的子目录，结构由用户组织
│       └── cover.jpg
└── .repo/
    ├── database.sqlite                  # 元数据
    └── operations/                      # undo 快照（.bak 文件）
```

### §2.2 `location` 字段：相对路径而非绝对路径

`packages/core/src/repo/resourceService.cjs:43-51` — `locationFromPath`：

```js
locationFromPath(absPath) {
  if (absPath 仓内) return { kind: 'local', value: 相对 repoPath 的路径 };
  if (absPath 仓外) return { kind: 'external', value: 原值 };
  return { kind: 'virtual', value: absPath };
}
```

- **仓内文件** → `{ kind: 'local', value: 'notes/xxx.md' }`（`packages/core/src/repo/resourceService.cjs:45-51`）
- 仓库搬移/备份时，`location` 字段保持不变，`repoPath` 改变，路径重新拼接 → 资源天然可移植

反向解析 `resolveLocation`（`resourceService.cjs:58-62`）：

```js
resolveLocation({ kind: 'local', value: 'notes/xxx.md' })
  → 返回 `${repoPath}/notes/xxx.md` 绝对路径
```

### §2.3 落地逻辑（`createResource`）

`packages/core/src/repo/repository.cjs:580-713` — `createResource(type, content, options)`：

1. **类型认定**（`:598-600`）：
   ```js
   const finalType = type || ResourceType.fromPath(filename) || 'note';
   ```
   - `POST /api/notes/upload` 故意传 `type: null`，让 Core 按扩展名自动判定 → `.png/.jpg` 自动归 `type='image'`（`serve.cjs:474`）
2. **写文件**（`:602` + `:642`）：
   ```js
   const filePath = path.join(this.repoPath, 'resources', name);
   await fs.writeFile(filePath, contentBuf);
   ```
3. **走 Operation 引擎**（`:677-684`）：
   ```js
   await operationEngine.execute('resource.create', {
     type: finalType, location_kind, location, metadata, schema, name,
   });
   ```
   —— 任何写操作都经 Operation 落日志/参与 undo/redo。
4. **note 类型立即建派生关系**（`:708-710`）：
   ```js
   if (finalType === 'note') {
     await this._syncMarkdownRelationsSafe(result.rid);
   }
   ```
5. **加密模式**（`:635-643`）：写盘为 `MAGIC + ciphertext` 形态；解析器对加密无感知，加密图片需运行时密钥已解锁才能解密读出。

### §2.4 上传入口：单一 multipart 入口

`packages/core/src/commands/serve.cjs:432-498` — `POST /api/notes/upload`：

```js
// 第 434-453 行：手写解析 multipart/form-data（无外部依赖）
// 第 460-488 行：遍历每个上传文件
for (const file of parsedFiles) {
  const result = await repo.createResource(null, file.data, {
    filename: file.name,
    name: file.name,
    metadata: { tags, mimetype: file.mimetype, size: file.size },
  });
}
```

**关键设计**：
- 没有任何中间件（无 S3/MinIO/OSS/presign URL）
- 客户端构造 multipart → 直接 POST 到 lo Core HTTP（端口 8765）
- 文件落入 `{repoPath}/resources/{name}`，DB 写入 `resources` 表行

### §2.5 与 Markdown 的相对关系

**最关键的事实**：图片与 markdown **共处** `resources/` 子目录，按 `location` 相对路径定位。

典型用户场景：

```
resources/
├── notes/2026-08-17-travel.md          # location = "notes/2026-08-17-travel.md"
└── notes/2026-08-17-travel/cover.jpg   # location = "notes/2026-08-17-travel/cover.jpg"
```

用户在 markdown 里写：
```markdown
![封面](./cover.jpg)
```

- markdown `location = "notes/2026-08-17-travel.md"` → `sourceDir = "notes/2026-08-17-travel/"`
- `target_path = "./cover.jpg"` → 拼成 `"notes/2026-08-17-travel/cover.jpg"` → 命中 image resource

详见 §3.3 `_resolveImageResource` 三级回退。

### §2.6 关键代码定位

| 文件 | 行号 | 作用 |
|---|---|---|
| `packages/core/src/repo/resourceService.cjs` | 43-62 | `locationFromPath` / `resolveLocation` |
| `packages/core/src/repo/repository.cjs` | 580-713 | `createResource` 完整落地流程 |
| `packages/core/src/repo/repository.cjs` | 4878-4891 | `Repository.create(repoPath)` 初始化建 `{repoPath}/resources/` |
| `packages/core/src/repo/repository.cjs` | 4756 | `resources/` 目录监听 |
| `packages/core/src/commands/serve.cjs` | 432-498 | `POST /api/notes/upload` multipart 路由 |
| `packages/core/src/utils/crypto.cjs` | — | 加密模式（会改变磁盘字节） |

---

## §3 关系：从「文本引用」到「embed 关系」

### §3.1 派生关系统一触发点 `syncMarkdownRelations`

`packages/core/src/repo/repository.cjs:4148-4258` — annotate 头部说明：

```
syncMarkdownRelations(rid)：
  read → parse all refs → delete old parser-originated relations → create new relations
  流程原子：SQLite 事务 BEGIN/COMMIT/ROLLBACK
```

完整代码骨架（提炼自 `:4156-4258`）：

```js
async syncMarkdownRelations(rid) {
  const resource = await this.resourceService.getByRid(rid);
  if (!resource) return { wikilinks: 0, embeds: 0, broken: 0, error: "Resource not found" };
  if (resource.type !== "note") return { wikilinks: 0, embeds: 0, broken: 0 };  // 4165：仅处理 note

  try {
    const content = await this.resourceService._readFile(
      this.resourceService.resolveLocation({ kind: resource.location_kind, value: resource.location }),
      "utf-8",
    );
    const { wikilinks, embeds } = MarkdownParser.parse(content);  // 4177：一次解析两类引用

    await this.db.exec("BEGIN");  // 4180：事务起点

    try {
      // 删除旧 wikilink（origin='markdown_parser' + history NULL origin 双删，见 4185-4193）
      await this.relationService.removeByFromRidAndType(rid, "wikilink", "markdown_parser");
      await this.db.run(
        `DELETE FROM relations WHERE from_rid = ? AND type = ? AND json_extract(metadata, '$.origin') IS NULL`,
        [rid, "wikilink"],
      );
      // 删除旧 embed（仅 markdown_parser origin）
      await this.relationService.removeByFromRidAndType(rid, "embed", "markdown_parser");

      // 重建 wikilink（4202-4218）：跳过 dangling（目标资源不存在 → 跳过）
      for (const wl of wikilinks) {
        const target = await this.resourceService.getByRid(wl.targetRid);
        if (!target) continue;
        try { await this.relationService.create(rid, wl.targetRid, "wikilink", { origin: "markdown_parser" }); }
        catch (e) { /* UNIQUE 冲突静默 */ }
      }

      // 重建 embed（4220-4243）：_resolveImageResource 失败 → broken 计数 +1，跳过
      for (const emb of embeds) {
        const targetRid = await this._resolveImageResource(resource, emb.target_path);
        if (!targetRid) { brokenCount++; continue; }
        if (targetRid === rid) continue;  // 自引用跳过
        try {
          await this.relationService.create(rid, targetRid, "embed", {
            origin: "markdown_parser",
            alt: emb.alt || "",
            ...(emb.title ? { title: emb.title } : {}),
          });
        } catch (e) { /* UNIQUE 冲突静默 */ }
      }

      await this.db.exec("COMMIT");  // 4245
      return { wikilinks: wikilinkCount, embeds: embedCount, broken: brokenCount };
    } catch (txError) {
      await this.db.exec("ROLLBACK");  // 4252
      throw txError;
    }
  } catch (e) {
    return { wikilinks: 0, embeds: 0, broken: 0, error: e.message };
  }
}
```

**设计要点**：
- **幂等**：每次都是「删旧建新」，可重复调用。
- **原子性**：删旧+建新在 SQLite 事务里。失败回滚，状态与 markdown 内容保持一致。
- **silently skip**：UNIQUE 冲突（已存在）静默跳过；dangling 资源（目标不存在）也不创建关系只 +1 broken 计数。
- **降级是局部的**：上层 `resource.update` operation 失败只记日志，**不阻塞保存**（见 §4.1）。

### §3.2 关系元数据 schema

`embed` 关系存于 `relations` 表，含 `metadata` JSON 字段：

```json
{
  "origin": "markdown_parser",
  "alt": "封面",
  "title": "可选标题，markdown 语法才有"
}
```

`wikilink` 关系 metadata：

```json
{ "origin": "markdown_parser" }
```

### §3.3 路径 → 目标 RID 三级回退 `_resolveImageResource`

`packages/core/src/repo/repository.cjs:4267-4295` — 这是图片引用能否命中资源的**关键函数**：

```js
async _resolveImageResource(sourceResource, targetPath) {
  // Guard 0：远程 URL / base64 直接拒
  if (/^https?:/i.test(targetPath) || /^data:/i.test(targetPath)) return null;

  // ─── L1：RID 形式 ───
  if (targetPath.startsWith("res_")) {
    const resource = await this.resolveResource(targetPath);
    return resource ? resource.rid : null;
  }

  // ─── L2：路径上下文拼接（最常用） ───
  // 例：notes/test.md 引用 ./assets/photo.png
  //   → sourceDir = "notes/"
  //   → combinedPath = "notes/assets/photo.png"
  if (sourceResource && sourceResource.location_kind === 'local' && sourceResource.location) {
    const sourceDir = sourceResource.location.replace(/[^/\\]*$/, "");  // 剥文件名
    const combinedPath = sourceDir + targetPath.replace(/^\.\/?/, "");  // 剥 ./ 开头
    const resource = await this.resolveResource(combinedPath);
    if (resource) return resource.rid;
  }

  // ─── L3：name 规范化兜底 ───
  const candidate = this._candidateNameFromPath(targetPath);
  if (!candidate) return null;
  const resource = await this.resolveResource(candidate);
  return resource ? resource.rid : null;
}
```

#### 3.3.1 各级命中示意

| 用户写法 | L1 (RID) | L2 (路径上下文) | L3 (name) |
|---|---|---|---|
| `![photo](res_abc123)` | ✅ 直接命中 | — | — |
| `![](./photo.png)` 跨同目录 | ✗ | ✅ `notes/photo.png` | ✅ `photo.png` |
| `![](../assets/p.png)` 跨上级 | ✗ | ✅ `assets/p.png` | ✅ `p.png` |
| `![](photo.png)` 文件不存在 | ✗ | ✗ | ✗ → broken++ |
| `![](https://...png)` | ✗ | ✗ | —（Guard 0 拒） |
| `![](data:image/png;base64,...)` | ✗ | ✗ | —（Guard 0 拒） |

#### 3.3.2 `_candidateNameFromPath` 规范化策略

`packages/core/src/repo/repository.cjs:4304-4331`：

```js
_candidateNameFromPath(filePath) {
  // 1. 提取文件名（去除目录）
  //    ./assets/img.png → img.png, ../photo.jpg → photo.jpg
  let fileName = filePath;
  // 2. 去扩展名
  // 3. 去日期前缀 YYYY-MM-DD-
  // 4. 去随机后缀 -xxxxxxxx
  // 最终由 resolveResource 统一 normalize
}
```

完整步骤见函数体内（`:4304-4331`）。**最终由 `resolveResource` 统一 normalize**（`repository.cjs:1405-1430` 三级查找：rid → normalized name → path）。

### §3.4 关键代码定位

| 文件 | 行号 | 作用 |
|---|---|---|
| `packages/core/src/repo/repository.cjs` | 4148-4258 | `syncMarkdownRelations`（事务化删旧建新） |
| `packages/core/src/repo/repository.cjs` | 4267-4295 | `_resolveImageResource` 三级回退 |
| `packages/core/src/repo/repository.cjs` | 4304-4331 | `_candidateNameFromPath` 规范化 |
| `packages/core/src/repo/repository.cjs` | 1405-1430 | `resolveResource`（rid → name → path） |
| `packages/core/src/repo/repository.cjs` | 4683-4703 | 批量入口 `syncMarkdownRelationsFromList` |
| `packages/core/src/repo/repository.cjs` | 4338-4378 | 全量重建 `syncAllMarkdownRelations` |
| `packages/core/test/repo/embedRelations.test.cjs` | 1-193 | 集成测试（5 种场景） |

---

## §4 触发点：什么时候会重建关系

总览：

| 触发点 | 文件:行号 | 备注 |
|---|---|---|
| `resource.update` operation | `operations/resourceUpdate.cjs:77-79` | **最常触发**（用户在 lo-agent 编辑保存） |
| `resource.update` undo | `operations/resourceUpdate.cjs:153-155` | 内容回滚后必重建 |
| `createResource` 内部 | `repo/repository.cjs:708-710` | 新建 note 立即建 |
| `importFile` 入库后 | `repo/repository.cjs:546-549` | 外部导入路径 |
| `FileWatcher` 检测到 .md 变更 | `commands/serve.cjs:3188` | 外部编辑器改 .md 后自动 rehash + 重建 |

### §4.1 详解：`resource.update`（最常触发）

`packages/core/src/operations/resourceUpdate.cjs:38-79`：

```js
async execute(ctx, params) {
  const { rid, updates } = params;
  // 1. 抓 before 状态（用于 undo）
  const before = await ctx.db.get('SELECT * FROM resources WHERE rid = ? AND deleted = 0', [rid]);
  if (!before) throw new Error(`资源不存在或已删除: ${rid}`);

  // 2. 旧内容快照 → .repo/operations/<opId>.bak（用于 undo 回滚）
  const { content, ...restUpdates } = updates || {};
  let contentSnapshot = null;
  if (content !== undefined) {
    const absPath = ctx.resourceService.resolveLocation({ kind: before.location_kind, value: before.location });
    if (absPath && (await fs.pathExists(absPath))) {
      await fs.ensureDir(snapshotDir(ctx));
      contentSnapshot = `${ctx.opId}.bak`;
      await fs.copy(absPath, path.join(snapshotDir(ctx), contentSnapshot));
    }
    try { await ctx.resourceService.updateContent(rid, content); }
    catch (e) { /* 失败清理快照 */ throw e; }
  }
  const result = await ctx.resourceService.update(rid, restUpdates);

  // 3. ★ 关键触发：note 类型且 content 更新 → 重建派生关系
  if (content !== undefined && result && result.type === "note") {
    await ctx.repo._syncMarkdownRelationsSafe(rid);  // 78 行
  }
  // ...
}
```

`_syncMarkdownRelationsSafe` 是 `syncMarkdownRelations` 的失败降级包装（失败只记日志，不阻塞保存）。

undo 路径（`resourceUpdate.cjs:104-160`）：

```js
// 内容恢复完成 → 重建派生关系（保证回滚后关系一致）
if (operationResult.contentSnapshot) {
  // ... 写回快照 → refresh
  if (rolledBack && rolledBack.type === "note") {
    await ctx.repo._syncMarkdownRelationsSafe(rid);  // 154 行
  }
}
```

### §4.2 关键代码定位

| 文件 | 行号 | 触发动作 |
|---|---|---|
| `packages/core/src/operations/resourceUpdate.cjs` | 77-79 | save 触发（最常） |
| `packages/core/src/operations/resourceUpdate.cjs` | 153-155 | undo 触发 |
| `packages/core/src/repo/repository.cjs` | 546-549 | importFile 触发 |
| `packages/core/src/repo/repository.cjs` | 707-710 | createResource 触发 |
| `packages/core/src/commands/serve.cjs` | 3188 | FileWatcher 触发 |

---

## §5 渲染端：lo-agent 侧

### §5.1 安全基线

`apps/agent/src/main/index.cjs:71-103` — 创建 BrowserWindow 时强制：

```js
preload: '...index.cjs',          // 77
contextIsolation: true,            // 78
nodeIntegration: false,            // 79
sandbox: true,                     // 80
```

**直接后果**：
- 渲染进程**不能直接访问 fs**，也无 `os` / `path` 等 Node API
- 加载 `local file://` 受 webSecurity 限制 → `<img src="file://...">` 不可用
- 无 iframe / WebView / 自定义协议（`meta/AGENTS.md §12.3` G2 安全模型禁止）

### §5.2 IPC 白名单（lo-agent 侧与图片相关的 API）

`apps/agent/src/preload/index.cjs:9-65` 暴露给 `window.loAgent.loCore` 的方法：

| preload 方法 | IPC 通道 | 后端实现 | 用途 |
|---|---|---|---|
| `loCore.uploadNotes(files, options)` | `lo-core:upload-notes` | `POST /api/notes/upload` multipart | 上传图片入仓 |
| `loCore.getNote(rid)` | `lo-core:get-note` | `GET /api/notes/:rid` | 拿 note 的 `{content, metadata, ...}`，**纯文本 content** |
| `loCore.updateNote(rid, body)` | `lo-core:update-note` | `PUT /api/notes/:rid` (经 `resource.update` op) | 保存 note，**触发 §4.1** |
| `loCore.createNote(body)` | `lo-core:create-note` | `POST /api/notes` | 新建 note |
| `loCore.removeNote(rid)` | `lo-core:remove-note` | `DELETE /api/notes/:rid` | 删 note |
| `loCore.listNotes(query)` | `lo-core:list-notes` | `GET /api/notes` | 列 note 列表 |
| `loCore.repository.resolveLocation(rid)` | `lo-core:resource-location` | `GET /api/resources/:rid/location` | 返回 `{kind, absolutePath}` 字符串 |
| `loCore.revealResource(rid)` | `lo-core:reveal-resource` | `electron.shell.showItemInFolder(absolutePath)` | 在系统文件管理器高亮文件 |
| `loCore.relations.list(rid)` | `lo-core:relations` | `GET /api/relations?rid=…` | 列关系（含 `embed`） |
| `loCore.modes.resolve(rid)` | `lo-core:modes-resolve` | — | 解析 Mode |
| `loCore.viewers.list(modeId)` | `lo-core:viewers` | — | 列可用 Viewer |

**确认无图片二进制通道**：`grep 'protocol.registerFileProtocol|registerStreamProtocol|raw'` 在 `apps/agent/src/main` **0 命中**。`/api/notes/:rid/raw` / `/api/resources/:rid/raw` 这类接口**不存在**。

### §5.3 当前内置 Viewer：只有 Monaco 编辑器

`apps/agent/src/renderer/src/services/viewerRegistry.js:10-22`：

```js
const VIEWERS = {
  'viewer.markdown-editor': { component: NoteEditor },            // 13-16：可编辑
  'viewer.generic-preview': { component: NoteEditor, readOnly: true },  // 17-21：只读
};
```

**两个 viewer 实际都是同一个 `NoteEditor` 组件**。

`apps/agent/src/renderer/src/editor/NoteEditor.jsx:1-84` 用的是 Monaco：

```js
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/markdown/register';
// ...
const editor = monaco.editor.create(el, {
  value, language: 'markdown', theme: 'vs', readOnly, ...
});
```

Monaco 只提供 markdown 语法高亮 + 编辑；**不渲染图片预览**。

### §5.4 ⚠️ 已知缺口：图片无法在 UI 上显示

**事实链**：

1. 用户在 Monaco 里写 `![photo](./photo.png)`
2. 保存 → `updateNote` → `resource.update` op → syncMarkdownRelations → image resource 命中 → embed 关系落库
3. 用户切到只读模式（`viewer.generic-preview`）→ 渲染的**还是 Monaco**，只设 `readOnly: true`
4. 用户期望看到图片，但 `<img src="">` 在 Monaco 里只显示为语法高亮的文本

**为什么不能 `<img src="file://...">` 直接显示**：
- 沙箱 + contextIsolation，禁止 `file://` 协议
- 即便放开，`lo serve` 也没有任何静态文件服务（已确认无注册）
- `getNote(rid)` 只返回 `content` 字符串字段，**不含图片二进制**

**当前能拿到的最大值**：
- `loCore.repository.resolveLocation(rid)` → 返回 `{kind, absolutePath}` 字符串（例：`C:\Users\...\resources\notes\photo.png`）
- 渲染端拿到的是**绝对路径字符串**，不是可加载的 URL

**reavealResource 是什么**：`apps/agent/src/main/lo-core.cjs:188-217` 把绝对路径交给 `electron.shell.showItemInFolder(absolutePath)` 打开系统文件管理器。这**不是显示图片**，是定位文件。

### §5.5 关键代码定位

| 文件 | 行号 | 作用 |
|---|---|---|
| `apps/agent/src/main/index.cjs` | 71-103 | BrowserWindow 安全基线 |
| `apps/agent/src/preload/index.cjs` | 9-65 | IPC CHANNEL 字典 |
| `apps/agent/src/main/lo-core.cjs` | 188-217 | `service.revealResource` |
| `apps/agent/src/renderer/src/editor/NoteEditor.jsx` | 1-84 | Monaco 编辑器 |
| `apps/agent/src/renderer/src/services/viewerRegistry.js` | 10-22 | 内置 Viewer 注册表 |
| `apps/agent/src/renderer/src/services/SessionService.mjs` | 23-56 | `session.viewerId` 解析 |
| `apps/agent/src/renderer/src/App.jsx` | 1275-1352 | `EditorRenderer` / `PluginViewerHost` |

---

## §6 端到端流程图

### §6.1 写图全链路（上传 → 引用 → 保存）

```
[Renderer] App.jsx importFiles(fileList)
    │
    ▼
[Preload] window.loAgent.loCore.uploadNotes(files, {})
    │  IPC: 'lo-core:upload-notes'
    ▼
[Main] lo-core.cjs uploadNotes(files)
    │
    ▼
[Client SDK] client.notes.upload(files)
    │  构造 multipart/form-data
    ▼
[HTTP] POST /api/notes/upload
    │
    ▼
[Core serve.cjs:432] 手写 multipart 解析
    │
    ▼
[Repository] createResource(null, file.data, { filename, name, metadata:{tags, mimetype, size} })
    ├─ type ← ResourceType.fromPath(filename)        // .png → 'image'
    ├─ 写文件 → {repoPath}/resources/{filename}       // 落盘
    └─ operationEngine.execute('resource.create')
          └─ DB INSERT resources(rid, name, layer=0, type='image', location_kind='local',
                                location, hash, metadata, encrypted, ...)

── 后续：用户在 Monaco 编辑器里写 note ──

[Renderer] Monaco onDidChangeModelContent → onChange
    │
    ▼
[Renderer] saveActiveTab → api.updateNote(rid, body)
    │
    ▼
[Main] lo-core.cjs updateNote(rid, body)
    │
    ▼
[Core] operations.execute('resource.update', {rid, updates:{content}})
    │
    ▼
[resourceUpdate.cjs:62] updateContent(rid, content)  // 写文件
    │
    ▼
[resourceUpdate.cjs:78] _syncMarkdownRelationsSafe(rid)   // ★ 关键触发
    │
    ▼
[repository.cjs:4156] syncMarkdownRelations(rid)
    ├─ 读 .md 文本 → MarkdownParser.parse(content)        // 一次解析
    │     ├─ WikiLinkParser.parse → wikilinks[]
    │     └─ MarkdownImageParser.parse(markdown) → embeds[]
    │           └─ 每个 embed = { type:'embed', target_path, alt, title?, raw }
    ├─ BEGIN 事务
    ├─ DELETE 旧 embed (origin='markdown_parser')
    ├─ for each emb:
    │     _resolveImageResource(note_resource, emb.target_path)
    │       ├─ L1: RID 形式 → resolveResource(rid)
    │       ├─ L2: 路径上下文拼接 → resolveResource(combinedPath)
    │       └─ L3: name 规范化 → resolveResource(name)
    │     relationService.create(rid, targetRid, 'embed', {
    │       origin: 'markdown_parser', alt: emb.alt, ...(title ? {title} : {})
    │     })
    └─ COMMIT
```

### §6.2 读图链路（**当前无内置显示路径**）

```
[Renderer] App.jsx handleRefresh → 打开 tab → api.getNote(n.rid)
    │
    ▼
[Preload] loCore.getNote(rid)
    │  IPC: 'lo-core:get-note'
    ▼
[HTTP] GET /api/notes/:rid
    │  返回 {rid, type, location, content, metadata, ...}
    │  ↑ 注意：content 是纯文本，不含图片二进制
    ▼
[Renderer] tab.text = data.content
    │
    ▼
[SessionService.createSession] → modes.resolve(rid) → viewers.list(modeId)
    │  → 取 viewerId = 'viewer.markdown-editor' / 'viewer.generic-preview'
    ▼
[EditorRenderer] 选 viewer 组件
    ├─ 内置：NoteEditor（Monaco）
    │     → 高亮 markdown 源码
    │     → ![alt](path) 仅显示为文本，不渲染图片
    └─ 插件：PluginViewerHost → agent-plugins:render-viewer → HTML 快照
          → dangerouslySetInnerHTML（无图片二进制通道）

[关联面板] RelationPanel 读 api.relations.list(noteRid)
    │  → 列出 'embed' 关系（指向 image resource）
    ▼
    显示「嵌入资源 → image-...」，无缩略图（无对应 endpoint）

【缺位路径（不存在）】
   A. Core HTTP 路由 /api/notes/:rid/raw + GET /api/resources/:rid/raw → image/{mime}
   B. Renderer 新 preview viewer = 解析 markdown → 重写 <img src> 为 (A) URL
   C. 插件提供 viewer（manifest.contributes.viewers）→ 自己 fetch 数据并渲染 HTML
      当前 plugins/agent/packages/* 均无 viewer 贡献
```

### §6.3 外部编辑器改 .md 后的同步路径

```
[外部编辑器] 用户改 .md 文件
    │
    ▼
[Core] serve.cjs:3188 FileWatcher
    │  监听 {repoPath}/resources/**
    ▼
[repository.cjs:_handleFileEvent] importFile 入库
    │
    ▼
[repository.cjs:546] _syncMarkdownRelationsSafe(rid)   // 立即重建
```

---

## §7 关键文件速查表

| 主题 | 文件 | 关键行号 |
|---|---|---|
| markdown 图片解析 | `packages/core/src/utils/markdownImageParser.cjs` | 1-144 |
| 引用统一解析 | `packages/core/src/utils/markdownParser.cjs` | 25-34 |
| wikilink 解析 | `packages/core/src/utils/wikilinkParser.cjs` | 1-61 |
| 资源类型映射 | `packages/core/src/utils/resourceType.cjs` | 3-67 |
| 派生关系（事务） | `packages/core/src/repo/repository.cjs` | 4148-4258 |
| 路径三级回退 | `packages/core/src/repo/repository.cjs` | 4267-4295 |
| name 规范化 | `packages/core/src/repo/repository.cjs` | 4304-4331 |
| 资源创建 | `packages/core/src/repo/repository.cjs` | 580-713 |
| location 字段 | `packages/core/src/repo/resourceService.cjs` | 43-62 |
| 触发：save | `packages/core/src/operations/resourceUpdate.cjs` | 77-79 |
| 触发：undo | `packages/core/src/operations/resourceUpdate.cjs` | 153-155 |
| 触发：create | `packages/core/src/repo/repository.cjs` | 707-710 |
| 触发：import | `packages/core/src/repo/repository.cjs` | 546-549 |
| 触发：watcher | `packages/core/src/commands/serve.cjs` | 3188 |
| 上传路由 | `packages/core/src/commands/serve.cjs` | 432-498 |
| Client notes API | `packages/client/src/client.cjs` | 454-500 |
| Preload 通道字典 | `apps/agent/src/preload/index.cjs` | 9-65 |
| Monaco 编辑器 | `apps/agent/src/renderer/src/editor/NoteEditor.jsx` | 1-84 |
| Viewer 注册表 | `apps/agent/src/renderer/src/services/viewerRegistry.js` | 10-22 |
| Session 服务 | `apps/agent/src/renderer/src/services/SessionService.mjs` | 23-56 |
| 安全基线 | `apps/agent/src/main/index.cjs` | 71-103 |
| 解析器单测 | `packages/core/test/utils/markdownImageParser.test.cjs` | 1-152 |
| 关系集成测试 | `packages/core/test/repo/embedRelations.test.cjs` | 1-193 |
| 已有正式文档 | `meta/core/core/markdown-image-relations.md` | 1-692 |

---

## §8 已知缺口与未来工作

### §8.1 已确认是缺位的功能

1. **图片无法在 lo-agent UI 中渲染**：内置 viewer 仅有 Monaco，渲染端没有任何 `<img>` 加载路径（无 raw 通道 + 沙箱禁止 `file://`）。
2. **无 base64 内嵌支持**：解析器显式排除 `data:` 协议（`markdownImageParser.cjs:42, 78`），如需支持需修改解析器 + 渲染端。
3. **无远程 URL 资源化**：解析器不注册 `https?:`，渲染端若需显示需插件或另开机制。
4. **无对象存储 / OSS / S3**：所有图片必须本地入库 + 走 multipart（`commands/serve.cjs:432-498`）；如需云端需另开 channel。
5. **无 markdown 预览 viewer**：当前没有内置 `viewer.markdown-preview` 组件（仅有 `viewer.markdown-editor` 与 `viewer.generic-preview`，二者均为 Monaco）。

### §8.2 渲染端补全路径（仅描述现状与边界，不编写修复方案）

如未来要让 `![](path)` 在 UI 上显示，**必经**以下决策点（任一未解都不可行）：

| 决策点 | 选项 | 现状 |
|---|---|---|
| 1. 二进制通道 | (a) Core HTTP `GET /api/resources/:rid/raw` (b) Plugin 自取 (c) 加密仓解密通道 | 全部未实现 |
| 2. 渲染容器 | (a) 新内置 viewer (b) Monaco 之外换编辑器 (c) 插件 viewer | 仅 Monaco + 插件 viewer 框架 |
| 3. 沙箱边界 | G2 安全模型（`meta/AGENTS.md §12.3`）禁止 iframe/WebView/自定义协议 | 严格 |
| 4. 加密仓 | 加密图片需运行时密钥在线 | 密钥管理在 `crypto.cjs` |

### §8.3 文档注意点

- 本调研文档**正式收录在项目根目录**（按你指示），与 `meta/AGENTS.md §5「meta/ 是唯一正式文档源」` 收敛原则**不一致**。如需后续收敛到 `meta/`，建议目标位置：`meta/core/core/note-image-handling.md` 或 `meta/research/note-image-handling.md`（新建 `research/` 子目录，区分正式 spec 与调研笔记）。
- **如本调研与 `meta/core/core/markdown-image-relations.md` 冲突，以后者为准**（meta 是正式文档源，本文件是调研笔记）。

---

## 附录：不变性与边界

依 `meta/AGENTS.md §1 / §12`，本调研涉及的边界不变性：

- **lo Core 是唯一世界模型持有者**：所有 Resource / Relation 落库规则由 Core 决定，外部消费者（含 lo-agent）不可绕过。
- **写操作经 Operation 引擎**：所有创建/更新都走 `operationEngine.execute(...)`，本调研涉及的 `resource.create` / `resource.update` 即此约定。
- **SDK 不封装 `@lo/client`**：渲染端 → 主进程 → Core 一律经 `lo-core:*` 通道，与 `agent-plugins-sdk` 零运行时依赖。
- **沙箱铁律**：renderer 不接触 Node 与网络 API，二进制通道必须新增 `lo-core:*` 通道并开 `lo-core.cjs` 中具体方法（**禁止**透传任意调用或实例）。
- **G2 安全模型**：插件 UI 在 isolated world 执行，不可触达 `window.loAgent.loCore`；此限制使得"插件 viewer"也是受限渲染路径。

> 调研结论与代码若以后续改动为准，**以代码为准并回报**（`meta/AGENTS.md §11`）。
