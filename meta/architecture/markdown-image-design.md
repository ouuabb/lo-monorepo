# Markdown 图片架构 — Candidate Image + RID-only Embed

> 状态：已实施（2026-08-17）
> 范围：`packages/core`、`packages/client`、`apps/agent`、`meta/`
> 性质：正式架构决策记录

---

## 1. 决策摘要

| 维度 | 决策 |
|---|---|
| **Embed 身份** | `![alt](res_xxx)` **唯一合法身份引用** |
| **非 RID 路径引用** | 在 `syncMarkdownRelations` 中显式 broken，不进入关系 |
| **HTTP/HTTPS 图片** | Markdown 原生外部引用，**不进入** lo Resource |
| **资源创建** | 显式：Editor Assist 调 `lo-core:import-resource` → `resource.create` operation |
| **Candidate Image** | Agent 内存状态，不进入 `resources` 表，不进入 Core |
| **自动化** | 编辑器监听 paste/drop → 写入 CandidateImageStore；用户主动选择后才 Import |
| **渲染** | Renderer 走 `lo-core:resource-binary` IPC 拿 Buffer → data URL → `<img>` |
| **二进制通道** | 不走 `file://`（沙箱限制），走 IPC + data URL |
| **解析器** | 保持纯函数（无副作用，不创建资源） |
| **运行时兼容层** | **不保留**（feature flag / 双格式 / legacy 都不做） |
| **云存储 / Blob / S3 / OSS** | **不做** |
| **正式迁移命令** | **不做**；一次性 `scripts/lo-embed-migrate.cjs` 工具（按需） |

---

## 2. 核心问题与决策

### 2.1 图片进入 lo 的两条链路

```
读取链路（已有）：
  Markdown ![alt](res_xxx)
    → MarkdownParser（纯）
    → syncMarkdownRelations → RID 命中 → embed 关系

创建链路（新增）：
  Editor 粘贴/拖拽/选择文件
    → CandidateImageStore（Agent 内存）
    → 用户在 CandidateImagePanel 选「导入」
    → lo-core:import-resource
    → Resource.create operation
    → 返回 RID
    → 编辑器插入 `![alt](res_xxx)`
```

**关键不变量**：
- Candidate Image 从不进入 `resources` 表
- Parser 从不创建资源
- Resource 创建经 Operation Engine，含 before/after 快照 + undo

### 2.2 为什么 Candidate ≠ Resource

| 维度 | 直传（粘贴即 Resource） | 候选 + 显式确认 |
|---|---|---|
| 临时截图 | 污染资源世界 | 自动丢弃 |
| 错误粘贴 | 占用 RID | 用户删除即可 |
| 重复图片 | 多个 Resource | 用户去重 |
| 一次性图片 | 永久占用 | 不入 |

选择后者：用户**主动决定**图片是否进入 lo 世界。

---

## 3. 数据流图

```
┌─────────────────────────────────────────────────────────────────────┐
│ Markdown 读取链路                                                   │
│                                                                      │
│  ![alt](res_xxx)                                                     │
│    ↓                                                                 │
│  MarkdownParser.parse(md)                                            │
│    ↓ {wikilinks, embeds[]}                                           │
│  Repository._resolveImageResource(null, targetPath)                 │
│    ├─ https?://|data:  → null（外部引用）                          │
│    ├─ !startsWith('res_') → null（broken）                         │
│    └─ resolveResource(rid) → imageResource.rid                     │
│    ↓                                                                 │
│  relationService.create(noteRid, imageRid, 'embed', {origin, alt})  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 创建链路                                                             │
│                                                                      │
│  Editor paste/drop file                                              │
│    ↓                                                                 │
│  NoteEditor onPaste/onDrop handler                                   │
│    ↓                                                                 │
│  CandidateImageStore.add({buffer, mime, filename, source})          │
│    ↓ (内存 Map，非 Resource)                                         │
│  CandidateImagePanel UI                                             │
│    ↓ 用户点击「导入」                                                │
│  lo-core:import-resource (preload IPC)                              │
│    ↓                                                                 │
│  [主进程] LoCoreService.importResource                              │
│    ↓                                                                 │
│  @lo/client.resources.import → POST /api/resources/import (JSON)   │
│    ↓                                                                 │
│  [serve.cjs] Repository.importBuffer({buffer, filename, metadata})  │
│    ├─ 写文件 → {repoPath}/resources/<name>                          │
│    ├─ operationEngine.execute('resource.create', params)            │
│    └─ 落 DB + 记录 syncOps                                          │
│    ↓                                                                 │
│  Resource { rid: 'res_xxx', type: 'image', ... }                    │
│    ↓                                                                 │
│  Renderer: editor.insertText(`![alt](res_xxx)`)                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 渲染链路                                                             │
│                                                                      │
│  MarkdownPreview viewer 解析 md 文本                                 │
│    ↓ 命中 `![alt](res_xxx)` 或 `<img src="res_xxx">`                 │
│  MarkdownImage 组件（接受 rid）                                      │
│    ↓                                                                 │
│  lo-core:resource-binary (preload IPC)                              │
│    ↓                                                                 │
│  [主进程] LoCoreService.getResourceBinary                            │
│    ├─ resolveLocation(rid) → 绝对路径                                │
│    ├─ fs.readFile                                                   │
│    └─ 返回 { buffer: base64, mime, size }                          │
│    ↓                                                                 │
│  Renderer: data:image/png;base64,... → <img src="data:...">          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. 关键文件清单

### 4.1 Core 侧

| 文件 | 改动 |
|---|---|
| `packages/core/src/repo/repository.cjs` | `_resolveImageResource` 简化为 RID-only；`_candidateNameFromPath` 删除；新增 `importBuffer` |
| `packages/core/src/commands/serve.cjs` | 新增 `POST /api/resources/import` 路由 |
| `packages/core/src/repo/viewerRegistry.cjs` | 新增 builtin `viewer.markdown-preview` |
| `packages/core/test/repo/embedRelations.test.cjs` | 重写为 RID-only 测试 |
| `packages/core/test/repo/{modeRegistration,usageResolver}.test.cjs` | 反映新增 viewer |
| `packages/core/test/commands/modesHttp.test.cjs` | 反映新增 viewer |
| `meta/core/core/markdown-image-relations.md` | 收敛到 RID-only 文档 |

### 4.2 Client 侧

| 文件 | 改动 |
|---|---|
| `packages/client/src/client.cjs` | 新增 `client.resources.import({buffer, filename, metadata, type})` |

### 4.3 Agent 侧

| 文件 | 改动 |
|---|---|
| `apps/agent/src/renderer/src/services/candidateImageStore.mjs` | **新增** 候选图片内存存储 |
| `apps/agent/src/renderer/src/components/CandidateImagePanel.jsx` | **新增** 候选 UI |
| `apps/agent/src/renderer/src/components/MarkdownImage.jsx` | **新增** RID → data URL 渲染 |
| `apps/agent/src/renderer/src/components/MarkdownPreview.jsx` | **新增** 只读 Markdown 预览（含 RID-embed） |
| `apps/agent/src/renderer/src/editor/NoteEditor.jsx` | 注入 paste/drop 监听 |
| `apps/agent/src/renderer/src/services/viewerRegistry.js` | 注册 `viewer.markdown-preview` |
| `apps/agent/src/renderer/src/App.jsx` | 集成 CandidateImagePanel + `handleCandidateImport` |
| `apps/agent/src/preload/index.cjs` | 暴露 `importResource` / `getResourceBinary` |
| `apps/agent/src/main/ipc.cjs` | 新增 `lo-core:import-resource` / `lo-core:resource-binary` 通道 |
| `apps/agent/src/main/lo-core.cjs` | 新增 `importResource` / `getResourceBinary` 方法 |
| `apps/agent/test/renderer/candidateImageStore.test.cjs` | **新增** 单元测试 |
| `apps/agent/test/main/ipc.test.cjs` | 更新通道数（29 → 31） |

### 4.4 一次性迁移

| 文件 | 用途 |
|---|---|
| `scripts/lo-embed-migrate.cjs` | 一次性 path → RID 迁移（不进 lo 命令） |

---

## 5. 数据模型

```sql
-- resources 表（已有）
rid           TEXT PRIMARY KEY     -- 永久身份
type          TEXT NOT NULL        -- 'note' | 'image' | ...
location_kind TEXT NOT NULL        -- 'local' | 'external' | 'virtual'
location      TEXT NOT NULL        -- local: 相对路径；external: 绝对/URL；virtual: ''
hash          TEXT
metadata      TEXT DEFAULT '{}'
encrypted     INTEGER DEFAULT 0
...

-- relations 表（已有）
from_rid  TEXT NOT NULL
to_rid    TEXT NOT NULL
type      TEXT NOT NULL        -- 'embed' | 'wikilink' | ...
metadata  TEXT DEFAULT '{}'    -- embed 含 {origin: 'markdown_parser', alt, title?}

-- 无新增表 / 无新增字段
```

**Candidate Image 不进入任何数据库表**，仅存在于 Agent 渲染进程的 `Map` 内存中。

---

## 6. Markdown 语法

```markdown
![alt](res_xxx)             ← 唯一合法 lo Resource 引用
![alt](https://example.com) ← Markdown 原生外部引用
![alt](data:image/png;base64,...) ← Markdown 原生外部引用
![alt](./photo.png)         ← 非 RID 路径引用 → 显式 broken
![alt](photo.png)           ← 非 RID 路径引用 → 显式 broken
```

**不引入** `lo://res_xxx` / `resource:res_xxx` 等新语法（破坏 CommonMark 兼容）。

---

## 7. HTTP/HTTPS 模型

| 形态 | 处理 |
|---|---|
| `https://example.com/a.png` | Markdown 原生外部引用，不进入 lo |
| `data:image/png;base64,...` | Markdown 原生外部引用，不进入 lo |

**不引入**：
- ❌ Core 自动下载
- ❌ 自动缓存 / 失效检测
- ❌ S3 / OSS / MinIO / Blob Storage
- ❌ 远程图片自动 Resource 化

**理由**：lo 当前是本地文件仓库。HTTP 资源是 Markdown 渲染层面的问题（CommonMark 规范），不在世界模型层。

---

## 8. 生命周期

### 8.1 创建

| 路径 | 入口 | 行为 |
|---|---|---|
| 用户粘贴/拖拽/选图 | Editor Assist → CandidateImageStore | 内存 |
| 用户点击「导入」 | CandidateImagePanel → `lo-core:import-resource` | Core `resource.create` op |
| `lo import <path>` | CLI | `ResourceService.importFile` |
| `POST /api/notes/upload` | lo-agent / 第三方 | multipart |
| FileWatcher `add` 事件 | lo serve | 自动 `importFile` |

### 8.2 引用

- 用户在 lo-agent 编辑器**手动**写 `![alt](res_xxx)`
- 用户**粘贴/拖拽** 图片：Editor Assist 自动生成 `![alt](res_xxx)`
- 旧 Markdown 中的 path 引用 → 显式 broken（迁移可选）

### 8.3 读取

- `<img>` 渲染时调 `lo-core:resource-binary` → bytes + mime → data URL
- 不走 `file://`（沙箱）

### 8.4 修改 / 移动 / 重命名

- 资源**内容**变化（User 在外部编辑器改 PNG）→ FileWatcher `change` → `rehash` → embed 关系不变
- 资源**location** 变化（`resource.move`）→ embed 关系不变（RID 身份）
- 资源**name** 变化 → embed 关系不变（RID 身份）

### 8.5 删除

- 资源软删（`resource.delete`）→ relations 同步移除
- 撤销 → relations 恢复

### 8.6 多引用

- 一个 image Resource 被多个 note embed 是正常情况
- 删除单个 embed 的语义：用户从 Markdown 文本移除 `![alt](res_xxx)`，保存时 `syncMarkdownRelations` 自动删旧

### 8.7 外部修改（FileWatcher）

- `add` + `ResourceType.isSupported` → 自动 `importFile`
- `change` → `rehash`，若 `hash` 变化且 `type === 'note'` → 重建 wikilink/embed
- `delete` → 软删

### 8.8 Undo / Redo

- 资源创建 / 更新 / 删除 / 移动均经 Operation Engine，支持 undo
- Candidate Image 阶段无 Core Operation → undo 不会被污染
- 导入资源后的 Markdown 插入属 `note.update` 独立操作

### 8.9 仓库迁移 / Git

- `repoPath` 改变：`location` 字段不变 → 资源稳定
- `resources/` 目录是普通文件目录 → 可 Git 管理
- Markdown 文本含 `res_xxx` 引用 → Git diff 可读

---

## 9. 迁移方案

### 9.1 不做正式迁移命令

- 无 `lo embed-migrate` 命令
- 无 `migrate_suggestions` 表
- 无 `metadata.legacy_target_path` 字段
- 无运行时 fallback

### 9.2 一次性脚本

`scripts/lo-embed-migrate.cjs`：

```bash
node scripts/lo-embed-migrate.cjs <repo-path> [--dry-run] [--write]
```

按需使用，但不作为长期工具；项目发布后归档。

---

## 10. 边界（Agent / Core / Editor Assist / Plugin）

| 组件 | 责任 | 明确不做 |
|---|---|---|
| **lo Core** | Resource 生命周期、Operation Engine、Markdown 解析、关系、文件存储、查询、加密 | 网络下载、用户交互、自动 Semantic |
| **lo-agent** | UI 渲染、IPC 桥、Viewer 注册、Renderer | 直接 fs、解析路径 |
| **Editor Assist**（NoteEditor + 新增监听） | 监听 paste/drop → 写入 Candidate → 触发导入 | 直接写文件、绕过 IPC |
| **Candidate Image** | Agent 内存（`services/candidateImageStore.mjs`） | Core、表、Resource |
| **Plugin (Agent)** | `manifest.contributes.viewers` | 创建 Resource（除非 Editor Assist 是它的内嵌功能） |
| **Plugin (Core)** | `ctx.resources/ctx.relations` | 自动化文件解析 |

### 10.1 边界铁律

- Parser 纯函数（无副作用）
- Resource 创建走 Operation Engine
- Candidate Image 不进入 Core
- Renderer 不走 `file://`
- 沙箱铁律（renderer 不接触 Node 与网络 API）

---

## 11. 与历史约束的对照

| 历史约束 | 现状 |
|---|---|
| Parser 显式排除 `https?:` / `data:` | **保留**（Markdown 原生外部引用） |
| `_resolveImageResource` L2/L3 路径兜底 | **删除**（RID-only） |
| `_candidateNameFromPath` 规范化猜名字 | **删除**（避免猜测命中错资源） |
| Editor 仅 Monaco | **保留**（编辑态 Monaco） |
| 新增 `viewer.markdown-preview` 只读预览 | **新增**（含 RID-embed 渲染） |
| `lo-core:upload-notes` multipart | **保留**（既有上传路径） |
| 新增 `lo-core:import-resource` JSON | **新增**（buffer → resource） |
| 新增 `lo-core:resource-binary` | **新增**（RID → bytes） |

---

## 12. 测试覆盖

| 包 | 测试数 | 状态 |
|---|---|---|
| `@lo/core` | 3772 | ✅ 全绿 |
| `@lo/client` | 101 | ✅ 全绿 |
| `lo-agent` | 272 | ✅ 全绿 |

新增 / 改动测试：
- `packages/core/test/repo/embedRelations.test.cjs`（重写为 RID-only）
- `packages/core/test/repo/modeRegistration.test.cjs`（反映新 viewer）
- `packages/core/test/repo/usageResolver.test.cjs`（反映新 viewer）
- `packages/core/test/commands/modesHttp.test.cjs`（反映新 viewer）
- `apps/agent/test/renderer/candidateImageStore.test.cjs`（新增 15 用例）
- `apps/agent/test/main/ipc.test.cjs`（通道数 29 → 31）

---

## 13. 后续工作（可选）

非本次实施范围：

- 完整 Markdown 渲染（heading/list/quote/table）— 当前 MarkdownPreview 是极简内联解析
- 插件 viewer 提供更完整 Markdown 预览
- 富文本粘贴（保留原格式）
- 图片维度识别（width/height metadata）
- 多文件批量导入
- clipboard 图像元数据（PNG EXIF 等）

---

## 14. 设计原则落实

| 原则 | 落实 |
|---|---|
| Identity 与 Location 分离 | RID 唯一身份，`location` 仅存 |
| Core 持有 Resource 生命周期 | 所有 Resource 创建经 Operation Engine |
| Parser 保持纯 | `MarkdownParser.parse` 无副作用 |
| 显式动作产生副作用 | 粘贴入候选需用户主动导入 |
| 编辑器可自动化，不改变 Core 模型 | Editor Assist 通过 IPC 调现有入口 |
| 引用稳定性优先 | `res_xxx` 在资源移动/重命名后不变 |
| 不引入云存储复杂度 | 无 HTTP 下载 / 无对象存储 |
