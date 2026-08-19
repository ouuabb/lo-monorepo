# Markdown 图片架构 — Image Resource Manager + RID-only Embed

> 状态：已实施（2026-08-20）
> 范围：`packages/core`、`packages/client`、`apps/agent`、`meta/`
> 性质：正式架构决策记录

---

## 1. 决策摘要

| 维度 | 决策 |
|---|---|
| **Embed 身份** | `![alt](res_xxx)` **唯一合法身份引用** |
| **非 RID 路径引用** | 在 `syncMarkdownRelations` 中显式 broken，不进入关系 |
| **HTTP/HTTPS 图片** | Markdown 原生外部引用，**不进入** lo Resource |
| **图片管理入口** | lo-agent **Image Resource Manager**（独立 `image/` 模块）——唯一入口 |
| **资源创建** | 显式：粘贴 / 拖入 / 文件选择 → `importImage` → `lo-core:import-resource` → `resource.create` operation |
| **插入时机** | 先导入 Resource → 出现在 Manager 列表 → 用户**主动选择**「插入」→ 当前 Markdown 光标处写 `![alt](res_xxx)` |
| **渲染** | Renderer 走 `lo-core:resource-binary` IPC 拿 Buffer → data URL → `<img>` |
| **二进制通道** | 不走 `file://`（沙箱限制），走 IPC + data URL |
| **解析器** | 保持纯函数（无副作用，不创建资源） |
| **运行时兼容层** | **不保留**（feature flag / 双格式 / legacy 都不做） |
| **云存储 / Blob / S3 / OSS** | **不做** |
| **正式迁移命令** | **不做**；一次性 `scripts/lo-embed-migrate.cjs` 工具（按需） |

---

## 2. 核心问题与决策

### 2.1 图片进入 lo 的链路

```
读取链路（已有）：
  Markdown ![alt](res_xxx)
    → MarkdownParser（纯）
    → syncMarkdownRelations → RID 命中 → embed 关系

创建链路（lo-agent Image Resource Manager）：
  Editor 粘贴/拖拽/选择文件
    → collectImageFiles（纯函数，过滤非图片）
    → imageApi.importImage
    → lo-core:import-resource（preload IPC）
    → Resource.create operation
    → 返回 RID → Image Resource 进入 Manager 列表
    → 用户在 ImageManager 选「插入」
    → handleInsertImageToActiveEditor → NoteEditor.insertImage(rid, alt)
    → 编辑器光标处插入 `![alt](res_xxx)`
```

**关键不变量**：
- 图片**先导入为 Resource**，编辑器**只负责最小 RID 插入**，不采集图片、不创建 Resource
- Parser 从不创建资源
- Resource 创建经 Operation Engine，含 before/after 快照 + undo
- Image Resource Manager 是 lo-agent 内置能力，**不新增 Agent Plugin / agent-plugins-sdk 契约**

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
│ 创建链路（Image Resource Manager）                                   │
│                                                                      │
│  Editor paste/drop file 或 文件选择                                   │
│    ↓                                                                 │
│  ImageManager onPaste/onDrop/onChange                                │
│    ↓                                                                 │
│  collectImageFiles (纯函数，SUPPORTED_MIMES 过滤)                    │
│    ↓                                                                 │
│  imageApi.importImage({bytes, mime, filename})                       │
│    ↓                                                                 │
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
│  Resource { rid: 'res_xxx', type: 'image', ... } → Manager 列表      │
│    ↓ 用户主动选「插入」                                              │
│  App.handleInsertImageToActiveEditor → NoteEditor.insertImage(rid)  │
│    ↓                                                                 │
│  editor.insertText(`![alt](res_xxx)`)                               │
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
│    ↓                                                                 │
│  @lo/client.resources.binary → GET /api/resources/:rid/binary       │
│    ↓                                                                 │
│  [serve.cjs] readResourceBuffer(absPath, repo.cryptoKey)             │
│    ├─ 检测 LOEC magic → CryptoUtils.decryptFile（Core 侧解密）       │
│    └─ 返回 { rid, mime, buffer: base64(明文), size }                 │
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
| `packages/core/src/commands/serve.cjs` | 新增 `POST /api/resources/import`、`GET /api/resources/:rid/binary` 路由（二进制读取解密收敛 Core） |
| `packages/core/src/repo/viewerRegistry.cjs` | 新增 builtin `viewer.markdown-preview` |
| `packages/core/test/repo/embedRelations.test.cjs` | 重写为 RID-only 测试 |
| `packages/core/test/repo/{modeRegistration,usageResolver}.test.cjs` | 反映新增 viewer |
| `packages/core/test/commands/modesHttp.test.cjs` | 反映新增 viewer |
| `meta/core/core/markdown-image-relations.md` | 收敛到 RID-only 文档 |

### 4.2 Client 侧

| 文件 | 改动 |
|---|---|
| `packages/client/src/client.cjs` | 新增 `client.resources.import({buffer, filename, metadata, type})`、`client.resources.binary(rid)` |

### 4.3 Agent 侧（Image Resource Manager）

| 文件 | 改动 |
|---|---|
| `apps/agent/src/renderer/src/image/imageUtils.mjs` | **新增** 纯工具（SUPPORTED_MIMES / mimeExt / base64ToUint8 / formatSize / altFromFilename） |
| `apps/agent/src/renderer/src/image/imageImport.mjs` | **新增** `collectImageFiles` 三入口归一（paste/drop/file-select） |
| `apps/agent/src/renderer/src/image/imageApi.mjs` | **新增** `createImageApi` 数据访问层（list / importImage / getBinary / remove） |
| `apps/agent/src/renderer/src/image/ImageManager.jsx` | **新增** Manager UI（导入 / 列表 / 缩略图 / 预览 / 插入 / 删除） |
| `apps/agent/src/renderer/src/image/ImagePreviewModal.jsx` | **新增** 大图预览遮罩 |
| `apps/agent/src/renderer/src/components/MarkdownImage.jsx` | **保留** RID → data URL 渲染 |
| `apps/agent/src/renderer/src/components/MarkdownPreview.jsx` | **保留** 只读 Markdown 预览（含 RID-embed 渲染） |
| `apps/agent/src/renderer/src/editor/NoteEditor.jsx` | 仅保留最小 `insertImage(rid, alt)` bridge（`executeEdits('insert-image-resource', ...)`），移除 paste/drop 采集 |
| `apps/agent/src/renderer/src/App.jsx` | 新增 `handleInsertImageToActiveEditor` + rail「图片」按钮 + `<Bar id="image">` 渲染 ImageManager |
| `apps/agent/src/preload/index.cjs` | 暴露 `importResource` / `getResourceBinary` |
| `apps/agent/src/main/ipc.cjs` | 通道 `lo-core:import-resource` / `lo-core:resource-binary` |
| `apps/agent/src/main/lo-core.cjs` | 方法 `importResource` / `getResourceBinary` |
| `apps/agent/test/renderer/imageUtils.test.cjs` | **新增** 单元测试 |
| `apps/agent/test/renderer/imageImport.test.cjs` | **新增** 单元测试 |
| `apps/agent/test/renderer/imageApi.test.cjs` | **新增** 单元测试 |

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

**Image Resource 即普通 `type='image'` 资源**，无候选状态、无独立表。

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
| 粘贴 / 拖入 / 文件选择 | ImageManager → `imageApi.importImage` → `lo-core:import-resource` | 创建 `type='image'` Resource |
| 用户在 Manager 选「插入」 | ImageManager → `handleInsertImageToActiveEditor` → `insertImage(rid, alt)` | 当前编辑器光标处写 `![alt](res_xxx)` |
| `lo import <path>` | CLI | `ResourceService.importFile` |
| `POST /api/notes/upload` | lo-agent / 第三方 | multipart |
| FileWatcher `add` 事件 | lo serve | 自动 `importFile` |

### 8.2 引用

- 用户在 lo-agent 编辑器**手动**写 `![alt](res_xxx)`
- 用户在 Image Resource Manager 选中图片后点「插入」：`insertImage(rid, alt)` 自动生成 `![alt](res_xxx)`（编辑器不做图片采集 / Resource 创建）
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
- 图片导入（Resource 创建）与 Markdown 插入（`note.update`）为两个独立操作，各自可 undo

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

## 10. 边界（Agent / Core / Plugin）

| 组件 | 责任 | 明确不做 |
|---|---|---|
| **lo Core** | Resource 生命周期、Operation Engine、Markdown 解析、关系、文件存储、查询、加密 | 网络下载、用户交互、自动 Semantic |
| **lo-agent** | UI 渲染、IPC 桥、Viewer 注册、Image Resource Manager | 直接 fs、解析路径 |
| **Image Resource Manager**（`image/` 模块） | 采集图片（paste/drop/file-select）→ 导入 Resource → 列表 → 预览/删除 → 主动插入当前编辑器 | 自动写 Markdown、绕过 IPC |
| **Plugin (Agent)** | `manifest.contributes.viewers` | 创建 Resource（除非 Agent 插件显式声明权限） |
| **Plugin (Core)** | `ctx.resources/ctx.relations` | 自动化文件解析 |

### 10.1 边界铁律

- Parser 纯函数（无副作用）
- Resource 创建走 Operation Engine
- 编辑器只做最小 RID 插入，**不采集图片 / 不创建 Resource**（采集与导入收敛在 Image Resource Manager）
- Renderer 不走 `file://`
- 沙箱铁律（renderer 不接触 Node 与网络 API）

---

## 11. 与历史约束的对照

| 历史约束 | 现状 |
|---|---|---|
| Parser 显式排除 `https?:` / `data:` | **保留**（Markdown 原生外部引用） |
| `_resolveImageResource` L2/L3 路径兜底 | **删除**（RID-only） |
| `_candidateNameFromPath` 规范化猜名字 | **删除**（避免猜测命中错资源） |
| Editor 仅 Monaco | **保留**（编辑态 Monaco） |
| 新增 `viewer.markdown-preview` 只读预览 | **新增**（含 RID-embed 渲染） |
| `lo-core:upload-notes` multipart | **保留**（既有上传路径） |
| 新增 `lo-core:import-resource` JSON | **新增**（buffer → resource，Image Resource Manager 入口） |
| 新增 `lo-core:resource-binary` | **新增**（RID → bytes） |
| 候选图片链路（CandidateImageStore / CandidateImagePanel / Editor 采集） | **删除**（收敛为 Image Resource Manager） |

---

## 12. 测试覆盖

| 包 | 测试数 | 状态 |
|---|---|---|
| `@lo/core` | 3772 | ✅ 全绿 |
| `@lo/client` | 101 | ✅ 全绿 |
| `lo-agent` | 275 | ✅ 全绿 |

新增 / 改动测试：
- `packages/core/test/repo/embedRelations.test.cjs`（重写为 RID-only）
- `packages/core/test/repo/modeRegistration.test.cjs`（反映新 viewer）
- `packages/core/test/repo/usageResolver.test.cjs`（反映新 viewer）
- `packages/core/test/commands/modesHttp.test.cjs`（反映新 viewer）
- `apps/agent/test/renderer/imageUtils.test.cjs`（新增）
- `apps/agent/test/renderer/imageImport.test.cjs`（新增）
- `apps/agent/test/renderer/imageApi.test.cjs`（新增）

---

## 13. 后续工作（可选）

非本次实施范围：

- 完整 Markdown 渲染（heading/list/quote/table）— 当前 MarkdownPreview 是极简内联解析
- 插件 viewer 提供更完整 Markdown 预览
- 富文本粘贴（保留原格式）
- 图片维度识别（width/height metadata）
- 多文件批量导入
- clipboard 图像元数据（PNG EXIF 等）
- Image Manager 内批量删除 / 按名称检索

---

## 14. 设计原则落实

| 原则 | 落实 |
|---|---|
| Identity 与 Location 分离 | RID 唯一身份，`location` 仅存 |
| Core 持有 Resource 生命周期 | 所有 Resource 创建经 Operation Engine |
| Parser 保持纯 | `MarkdownParser.parse` 无副作用 |
| 显式动作产生副作用 | 图片先显式导入为 Resource，再显式选择插入 |
| 能力收敛于 Manager | 采集/导入/管理收敛在 Image Resource Manager，编辑器只做最小插入，不新增插件契约 |
| 引用稳定性优先 | `res_xxx` 在资源移动/重命名后不变 |
| 不引入云存储复杂度 | 无 HTTP 下载 / 无对象存储 |
