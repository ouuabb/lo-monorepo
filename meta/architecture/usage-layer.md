# Usage 层架构（Mode / Viewer / Session）

> 覆盖：Usage Layer 最终模型（S0–U4 六阶段闭环后）。设计演进与实施过程见
> `specs/020-u0-usage-layer-concepts.md`（概念冻结）与 `specs/021~024`（U1–U4 实施）。
> 本文是**最终状态速览**：定义、归属、链路、边界、文档索引。

## 1. 三个概念（U0 冻结）

| 概念 | 定义 | 运行时/存储 |
|---|---|---|
| **Mode** | 资源使用方式（可编辑性/交互性的语义声明）：`{ modeId, semantics, applicableTo: {types?, capabilities?}, rules: {writable, interactive} }` | Core 内存注册表（builtin 代码种子）+ `mode_definitions` 表（插件贡献） |
| **Viewer** | 单个资源的处理/呈现入口：`{ viewerId, label, semantics, supports: {modes[]} }`；**自行声明 supports.modes，不建立 Mode→Viewer 映射表** | Core 内存注册表（builtin 代码种子）+ `viewer_definitions` 表（插件贡献） |
| **Session** | 一次使用实例（纯运行时，**不落库**）：`{ resourceRid, modeId, viewerId, writable, state: {readOnly, dirty, scroll}, overrides }` | lo-agent 渲染进程内存（`SessionService.mjs`） |

**readOnly 唯一链**（三层严格分离）：

```
Mode.rules.writable
    → Session.state.readOnly（= !writable || overrides.has(rid)）
    → UI / editor / save guard
    → Permission（独立体系，不并入 Mode/Session）
    → Operation（不变）
```

## 2. 最终所有权（归属）

| 归属 | 贡献 |
|---|---|
| **Core builtin**（代码种子，不落 DB） | `editing`（types:[note]，writable）· `reading`（types:[pdf,image,video,audio,epub,html,document,spreadsheet,presentation]，只读）· `preview`（兜底，只读非交互）；Viewer：`viewer.markdown-editor`（supports editing）· `viewer.generic-preview`（supports reading/preview） |
| **epub 插件**（`ctx.modes.register` / `ctx.viewers.register`） | `annotating`（writable）· `metadata`（只读）· `viewer.epub-reader`（supports reading）——**不得重复注册 builtin reading**（同 modeId 冲突抛错） |

解析结果（插件已注册态）：

```
note → [editing]                → viewer.markdown-editor
pdf  → [reading]                → viewer.generic-preview
epub → [reading, annotating, metadata]  → viewer.epub-reader（reading 的 Viewer 列表首位由插件注册顺序决定）
未知 type → [preview]           → viewer.generic-preview
```

> 插件未装态：epub → `[reading]`（builtin reading 覆盖 epub）。两状态断言相互独立。

## 3. 代码链路

### Core（packages/core）

```
src/repo/modeRegistry.cjs      ModeRegistry + BUILTIN_MODES（editing/reading/preview）
src/repo/viewerRegistry.cjs    ViewerRegistry + BUILTIN_VIEWERS（2 个）
src/repo/usageResolver.cjs     resolveModes（type 精确 > capability 条件 > preview 兜底）
                               resolveViewers（supports.modes 匹配，注册顺序）
src/repo/repository.cjs        listModes / resolveModes(rid) / resolveViewers(rid, modeId?)
                               listViewers(modeId?) / registerPluginMode / registerPluginViewer
                               （读取/写入 mode_definitions / viewer_definitions 表）
HTTP：GET /api/modes · /api/modes/:rid · /api/viewers?mode=
```

### 插件贡献（plugins-sdk 契约）

```
ctx.modes.register({ modeId, semantics, applicableTo: {types}, rules: {writable, interactive} })
ctx.modes.resolve(rid)                # 只读解析（命令域校验用）
ctx.viewers.register({ viewerId, label, semantics, supports: {modes} })
```

契约校验（SDK 层强制）：modeId/viewerId 非空；`applicableTo.types` 非空数组；
`rules` 仅允许 `writable/interactive`（**禁入 operations/permission/schema 等**）；
builtin 冲突抛错。

### 客户端（apps/agent）

```
openResource(rid)
  → SessionService.createSession        # modes.resolve(rid) → 第一个 Mode
                                        # viewers.list(modeId) → 第一个 Viewer
  → Session { resourceRid, modeId, viewerId, writable, state, overrides }
  → Tab 承载 Session
  → EditorRenderer（viewerRegistry.js） # 按 session.viewerId 选渲染器：
                                        #   内置 → Monaco 组件（markdown-editor / generic-preview）
                                        #   插件 → PluginViewerHost（agent-plugins:render-viewer HTML 快照）
                                        #   未注册 → 明确提示
```

`session.state.readOnly` 是 UI 只读/禁用/保存守卫/自动保存的唯一运行态来源；
用户强制只读经 `overrides`（Session 内维护，`toggleReadOnly` 重算）；
右键菜单只读判定经 `resolveReadOnly`（已开 tab 用 Session 事实，否则 `modes.resolve`）。

### IPC / client

- `lo-core:modes` / `lo-core:modes-resolve` / `lo-core:viewers`（preload `loCore.modes/viewers`）
- `agent-plugins:list-viewers` / `agent-plugins:render-viewer`（preload `plugins.viewers`）
- `@lo/client`：`modes.list/resolve`、`viewers.list/resolve`

## 4. 边界（不可触犯）

- Mode 只表达使用方式：**不承载** Permission / Operation / Relation / Schema / Container。
- annotating 只是使用上下文：标注数据模型仍是 Operation + note + source-of Relation。
- Session 纯运行时：Core 不持久化，**无 Session 表**。
- Viewer 与 Query View（View）是两等概念：View = Resource[] 的 Query/fields/presentation
  （集合观察）；Viewer = 单资源处理入口。Query View / ViewPanel 独立实现，不迁移。
- Capability 不并入 Mode（Mode 的 `applicableTo.capabilities` 仅作解析条件声明）。

## 5. 文档索引

| 主题 | 文档 |
|---|---|
| 概念冻结（权威定义） | `specs/020-u0-usage-layer-concepts.md` |
| 实施过程 | `specs/021-u1-mode-viewer-core.md` ~ `specs/024-u4-convergence.md` |
| Core 架构 | `architecture/core.md` §2（Usage 层） |
| Agent 架构 | `agent/architecture.md` §6.1（Session/Viewer 渲染） |
| 插件贡献 | `plugins-sdk/api/PluginContext.md`（ctx.modes/viewers）、`specs/023-u3-plugin-sdk-epub.md`、`lo-plugins/plugins/epub-reader.md`（Usage 贡献） |
| 命令域 | `core/commands/operation.md`（Operation 语义）、epub 命令页 |
| 收敛验收 | `specs/024-u4-convergence.md`（17 分支归属 + 零残留扫描） |
