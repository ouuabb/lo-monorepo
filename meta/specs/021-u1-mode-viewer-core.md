# U1 · Mode / Viewer Core 基础

> 状态：**实施文档（已完成）**——由 U0（020）§2/§4/§6 推导，不引入新概念。
> 依赖：S0（019）已交付最终 001 基线（含 `mode_definitions`/`viewer_definitions` 表）；本阶段实现 Core 注册表与解析。
> 原则：直接重构、无兼容层；旧使用判断（U2 处理的除外）不在此阶段引入兼容函数。

---

## 1. 实现来源（概念 → 实现映射）

| U0 概念 | 本阶段实现 |
|---|---|
| Mode Definition（§2） | `modeRegistry.cjs` + builtin 定义 + `resolveModes` |
| Viewer Definition（§4） | `viewerRegistry.cjs` + builtin 定义 + `resolveViewers` |
| 边界（§6） | 注册表仅接受 Mode/Viewer 语义；不接收 operations/permission/schema 字段 |

## 2. 新增模块

### `packages/core/src/repo/modeRegistry.cjs`

```js
class ModeRegistry {
  register(def);      // {modeId, semantics, applicableTo, rules}；同 modeId 冲突抛错
  get(modeId);
  list();
}
```

### `packages/core/src/repo/viewerRegistry.cjs`

```js
class ViewerRegistry {
  register(def);      // {viewerId, label, semantics, supports}；同 viewerId 冲突抛错
  get(viewerId);
  list();
}
```

### `packages/core/src/repo/usageResolver.cjs`

```js
resolveModes(resource);        // type 精确 > capability 条件 > preview 兜底；有序返回
resolveViewers(modeId);        // supports.modes 包含 → 按注册顺序；空结果返回 []
```

## 3. 内置定义（代码种子，不落 DB）

**Mode（3 个，依据 U0 §2；annotating/metadata 属 epub 插件贡献，不在 builtin）**：

| modeId | semantics | applicableTo | rules |
|---|---|---|---|
| editing | 以编辑方式使用（内容可写） | types:[note] | writable=true, interactive=true |
| reading | 以阅读/沉浸方式使用（只读） | types:[pdf,image,video,audio,epub,html,document,spreadsheet,presentation] | writable=false, interactive=true |
| preview | 只读通用查看（兜底） | 其余未覆盖 type | writable=false, interactive=false |

> **reading 覆盖 epub**：U1 阶段无需 epub 插件即可对 epub 资源解析得到 `[reading]`。`annotating`/`metadata` **不属于 Core builtin**——由 epub 插件在 U3 注册（本阶段不注册、不解析到它们）。

**Viewer（2 个，依据 U0 §4）**：

| viewerId | semantics | supports |
|---|---|---|
| viewer.markdown-editor | Markdown 内容编辑 | modes:[editing] |
| viewer.generic-preview | 通用只读呈现 | modes:[reading, preview] |

> 本阶段 generic-preview 仅声明 reading/preview；annotating/metadata 的 Viewer 支持在 U3 插件贡献后由插件侧补充。

## 4. Repository 入口与 Resolver 接入

- `repository.cjs`：`resolveModes(rid)`（内部读资源行 → usageResolver.resolveModes）+ `resolveViewers(rid, modeId?)`（可选默认选第一个 Mode）
- `getRepositoryContext()` 不动；`resolveUsage` 命名不用（概念名为 Mode/Viewer）

## 5. 插件贡献持久化（表读取）

- 插件注册的 Mode/Viewer 落 `mode_definitions`/`viewer_definitions`（S0 表）——**本阶段仅实现表结构就绪 + 读取路径**（U3 实现注册写入）
- 解析时合并：`builtin（代码） ∪ 表（插件）`，冲突以 builtin 为准（同 modeId 插件注册抛错）

## 6. API / IPC / SDK（新命名空间，无旧 API 冲突）

```
GET /api/modes             → { modes: [...] }（builtin+插件）
GET /api/modes/:rid        → { resource: rid, modes: [{modeId, semantics, rules}] }
GET /api/viewers?mode=:id  → { viewers: [...] }

client.modes.list() / resolve(rid)
client.viewers.list() / resolve(modeId)
IPC：lo-core:modes / lo-core:viewers
```

## 7. 测试

| 用例 | 断言 |
|---|---|
| resolveModes：note | → [editing] |
| resolveModes：pdf | → [reading] |
| resolveModes：epub（**插件未安装/未迁移态**） | → [reading]（builtin reading 覆盖 epub；**不得断言插件贡献的 annotating/metadata**） |
| resolveModes：未知 type | → [preview]（兜底） |
| resolveViewers(editing) | → [viewer.markdown-editor] |
| resolveViewers(reading) | → [viewer.generic-preview] |
| 插件表合并 | 表注册 mode 可解析；builtin 冲突抛错 |
| API/IPC | 端点与通道参数断言 |

## 8. 验收标准

1. `resolveModes/resolveViewers` 全用例通过
2. Core 新增端点/IPC 可用；client 命名空间透传
3. 无兼容层；`type==='note'` 使用判断未新增（U2 才移除旧判断）
4. 全量 `pnpm test` + lint 绿

## 9. Checkpoint

提交信息：`feat(core): 使用层模式与查看器注册（U1）`

## 10. 阶段状态即验收边界（原则）

本阶段完成 = **Core 能独立提供 builtin Mode/Viewer 并解析**：editing/reading/preview + markdown-editor/generic-preview；插件表读取路径就绪。**不提前依赖后续阶段**：annotating/metadata（U3 插件贡献）、Session（U2）、Agent 渲染（U2）均不在本阶段验收；不得为「最终状态」提前断言插件 Mode 或后续阶段行为。
