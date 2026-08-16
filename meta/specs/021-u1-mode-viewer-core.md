# U1 · Mode / Viewer Core 基础

> 状态：**实施文档（待执行）**——由 U0（020）§2/§4/§6 推导，不引入新概念。
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

**Mode（5 个，依据 U0 §2）**：

| modeId | semantics | applicableTo | rules |
|---|---|---|---|
| editing | 以编辑方式使用（内容可写） | types:[note] | writable=true, interactive=true |
| reading | 以阅读/沉浸方式使用（只读） | types:[pdf,image,video,audio,epub,html,document,spreadsheet,presentation] | writable=false, interactive=true |
| annotating | 阅读上下文中进行标注 | types:[epub] | writable=true, interactive=true |
| metadata | 查看/编辑元数据字段 | types:[epub] | writable=false, interactive=false |
| preview | 只读通用查看（兜底） | 其余未覆盖 type | writable=false, interactive=false |

**Viewer（2 个，依据 U0 §4）**：

| viewerId | semantics | supports |
|---|---|---|
| viewer.markdown-editor | Markdown 内容编辑 | modes:[editing] |
| viewer.generic-preview | 通用只读呈现 | modes:[reading, annotating, metadata, preview] |

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
| resolveModes：epub | → [reading, annotating, metadata] |
| resolveModes：未知 type | → [preview]（兜底） |
| resolveViewers(editing) | → [viewer.markdown-editor] |
| resolveViewers(reading) | → [viewer.generic-preview]（epub 插件未装时） |
| 插件表合并 | 表注册 mode 可解析；builtin 冲突抛错 |
| API/IPC | 端点与通道参数断言 |

## 8. 验收标准

1. `resolveModes/resolveViewers` 全用例通过
2. Core 新增端点/IPC 可用；client 命名空间透传
3. 无兼容层；`type==='note'` 使用判断未新增（U2 才移除旧判断）
4. 全量 `pnpm test` + lint 绿

## 9. Checkpoint

提交信息：`feat(core): 使用层模式与查看器注册（U1）`
