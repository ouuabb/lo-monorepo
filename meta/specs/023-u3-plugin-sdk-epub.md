# U3 · Plugin SDK 与 epub 迁移

> 状态：**实施文档（待执行）**——由 U0（020）§2/§4/§8 推导。
> 依赖：U1（021）Core Registry；U2（022）Agent Session；本阶段提供插件贡献入口并把 epub 插件迁移到新模型。
> 原则：直接重构——epub 旧命令守卫删除、旧捆绑方式解耦；无兼容层。

---

## 1. 实现来源（概念 → 实现映射）

| U0 概念 | 本阶段实现 |
|---|---|
| Plugin 贡献 Mode/Viewer（§8） | `plugins-sdk`：`ctx.modes.register` / `ctx.viewers.register`；Agent 插件 viewer 渲染 |
| Mode 适用（§2） | epub 插件注册 reading/annotating/metadata（applicableTo epub） |
| Viewer 定义（§4） | epub 插件注册 `viewer.epub-reader`（supports modes:[reading]） |
| 命令域 | epub 命令从 `type!=='epub'` 守卫改为「仅 epub Mode 上下文中可用」（经 Session.modeId） |

## 2. plugins-sdk 新增契约

### `PluginContext` 扩展（packages/plugins-sdk/src/PluginContext.cjs）

```js
ctx.modes.register({ modeId, semantics, applicableTo, rules });
ctx.viewers.register({ viewerId, label, semantics, supports });
```

- 注册写入：调用 Core 端点/经 Core 插件系统 → `mode_definitions`/`viewer_definitions` 表（S0 表；U1 已就绪读取路径，本阶段补写入）
- 校验：modeId/viewerId 非空；`applicableTo.types` 非空数组；`rules` 仅允许 `{writable, interactive}`（**禁止塞入 operations/permission/schema 等**——U0 §6 边界）
- 冲突：与 builtin 同 modeId/viewerId → 抛错（U1 已定）

### Agent 插件 Viewer 渲染（agent-plugins-sdk + apps/agent）

- `manifest.contributes.viewers: [{ viewerId, label, render }]`——render 为受控函数（经 `agent-plugins:render-viewer` IPC）
- Agent `viewerRegistry`（U2）合并：内置 → 插件注册的 viewerId 组件映射

## 3. epub-reader 迁移（直接重构）

| 现实现 | 迁移为 |
|---|---|
| manifest 注册 epub 类型（保留） | 不变（TypeRegistry） |
| 命令守卫 `resource.type !== 'epub'`（commands.cjs:40） | **删除**；命令入口校验改为「当前 Session.modeId ∈ {reading, annotating}」 |
| —（新增） | `ctx.modes.register`：reading（writable=false）/ annotating（writable=true）/ metadata（writable=false）——applicableTo types:[epub] |
| —（新增） | `ctx.viewers.register`：`viewer.epub-reader`（supports modes:[reading]） |
| HTTP 阅读器端点 | 保留（作为 viewer.epub-reader 的实现载体）；Agent 桥接新 viewer 渲染入口 |
| 标注（note + source-of 关系） | 保留（Operation/Relation 体系，U0 §6 边界）——annotating Mode 是其使用上下文 |
| 命令/端点注册 | 保留（命令注册机制不变） |

## 4. epub 端到端链路（验收路径）

```
导入 .epub → type=epub
打开 → resolveModes → [reading, annotating, metadata]
  → resolveViewers(reading) → viewer.epub-reader（插件注册）
  → Session { modeId: reading, viewerId: viewer.epub-reader, state.readOnly: true }
  → Agent 渲染 viewer.epub-reader（插件实现）
标注 → annotating Mode 上下文 → Operation：note 创建 + relation.create(source-of)
命令 epub:note/highlight → 命令层校验 Session Mode 上下文
```

## 5. 测试

| 用例 | 断言 |
|---|---|
| plugins-sdk registerMode/registerViewer | 契约校验（禁入字段拒绝）；写入表可读回 |
| epub Mode 解析 | resolveModes(epub 资源) = [reading, annotating, metadata] |
| epub Viewer 解析 | resolveViewers(reading) 含 viewer.epub-reader |
| 命令域 | epub 命令在 reading/annotating Session 可用；非 epub Session 拒绝 |
| 标注链路 | annotating 上下文创建 note + source-of 关系可撤销 |
| Agent 插件 viewer | manifest viewers 注册 → viewerRegistry 合并 → 渲染桥调用 |

## 6. 验收标准

1. epub 插件不再以「类型+命令+HTTP+标注」捆绑方式定义使用——分别落在 TypeRegistry / Mode / Viewer / Command / Operation
2. `type !== 'epub'` 命令守卫零残留（grep）
3. epub 端到端（导入→阅读→标注→撤销）通过
4. plugins-sdk/agent-plugins-sdk 测试全绿；全量回归

## 7. Checkpoint

提交信息：`feat(plugins-sdk): 模式与查看器注册契约（U3）`
