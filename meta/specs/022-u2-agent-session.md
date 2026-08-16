# U2 · Agent Session 重构（含 readOnly 迁移）

> 状态：**实施文档（已完成）**——由 U0（020）§3/§7 推导。
> 依赖：U1（021）已提供 `resolveModes`/`resolveViewers` API；本阶段重构 Agent 打开/编辑链路。
> 原则：**直接删除旧实现**——`type !== 'note'` 只读判断与 `readOnlyOverrides` Set 一次性删除，不建 isLegacyReadOnly 等过渡函数、不同时维护两套状态。

---

## 1. 实现来源（概念 → 实现映射）

| U0 概念 | 本阶段实现 |
|---|---|
| Session（§3） | `openResource` → 创建 Session；Tab 字段 ↔ session.state 映射 |
| readOnly 三层（§7） | `session.state.readOnly = !mode.rules.writable \|\| overrides.has(rid)`；删除旧计算 |
| Viewer 选择（§4） | `resolveViewers(modeId)` → 选定 viewerId → 渲染器注册表 |

## 2. Agent 新模块

### `apps/agent/src/renderer/src/services/SessionService.js`

```js
createSession(n, api): Promise<Session>
  → api.modes.resolve(n.rid) → 选择 Mode（默认第一个；后续支持记忆）
  → api.viewers.resolve(rid, modeId) → 选择 Viewer（priority；默认第一个）
  → Session = {
      resourceRid, modeId, viewerId,
      state: { readOnly: !mode.rules.writable || overrides.has(rid),
               dirty: false, savedText, savedTitle, savedTagsText, savedCategory, scroll: 0, meta },
      overrides: Set<string>,
    }
```

### Viewer 渲染注册表

```js
// renderer/src/services/viewerRegistry.js
const VIEWERS = {
  'viewer.markdown-editor': { component: NoteEditor, props: {...} },
  'viewer.generic-preview': { component: NoteEditor, props: { readOnly: true } },  // 只读 Monaco
};
resolveViewerComponent(viewerId);
```

## 3. App.jsx 直接重构点

| 现位置 | 旧实现 | 直接重构为 |
|---|---|---|
| `openResource`（:184-231） | 建 tab（`readOnly = n.type!=='note' \|\| overrides.has`） | `createSession(n)` → tab = session 承载（tab.readOnly ← session.state.readOnly；tab.text/saved* ← session.state.*） |
| `readOnlyOverrides`（:60） | 独立 Set | **删除**；overrides 并入 Session（按 rid 维护 session.overrides；新建 Session 时合并已存在的 override 集合） |
| `toggleReadOnly`（:410-423） | 翻转 Set + tab | 翻转对应 Session.overrides + state.readOnly |
| 右键菜单 readOnly（:583） | type 判断 | 经当前 Session 或 `modes.resolve(rid)` 取 mode.rules.writable |
| 保存守卫（:292/:332） | `activeTab.readOnly` | `session.state.readOnly`（语义不变） |
| UI 禁用/徽标（:826-875） | `activeTab.readOnly` | `session.state.readOnly` |

**删除**：`type !== 'note'` 的全部使用（App.jsx:199/583）；`readOnlyOverrides` 定义与引用。

> **Query View 不受影响**：设置栏「视图」（ViewPanel + CoreViewPanel，Query View 消费链）与本阶段重构无关——View（集合观察）与 Viewer（单资源入口）保持完全独立；本阶段只动资源打开/编辑链路。

## 4. readOnly 迁移（三层严格分离，依据 U0 §7）

```
Mode.writable（来自 resolveModes 的 rules.writable）
  → Session.state.readOnly（运行态）
  → Permission（本阶段不接线——Permission 是独立体系，U0 边界明确；Session 可写不等于已授权）
  → Operation（不变）
```

- `session.state.readOnly = !mode.rules.writable || session.overrides.has(rid)`
- overrides 生命周期：Session 内（客户端内存）；可选持久化到 Agent preferences（非 Core）——本阶段保持内存态

## 5. 测试

| 用例 | 断言 |
|---|---|
| createSession(note) | mode=editing → state.readOnly=false |
| createSession(pdf) | mode=reading → state.readOnly=true |
| createSession(epub) | mode=reading（默认第一个）→ readOnly=true；viewer=generic-preview（未装插件时） |
| override 强制 | overrides.has(rid) → readOnly=true（editing 亦然） |
| toggle | 翻转 override → state.readOnly 翻转 |
| 保存链路 | readOnly session 不保存（守卫） |
| 删除旧实现 | `type !== 'note'`、`readOnlyOverrides` 全仓零残留（grep 断言） |

## 6. 验收标准

1. note 可编辑 / 非 note 只读 / 用户强制只读——行为与旧实现一致（来源已迁移）
2. 全仓零 `type !== 'note'`（App 渲染层）与零 `readOnlyOverrides`
3. 打开/编辑/保存/撤销链路回归通过
4. 全量 `pnpm test` + lint 绿

## 7. Checkpoint

提交信息：`feat(agent): 会话模型与只读迁移（U2）`

## 8. 阶段状态即验收边界（原则）

本阶段完成 = **Agent 能基于 Mode/Viewer 建立 Session**：openResource 经 resolveModes/resolveViewers 创建 Session、readOnly 迁移到 Session.state、viewer 渲染注册表（内置）可用。**不提前依赖后续阶段**：插件 Viewer（U3）、epub 阅读器（U3）不在本阶段验收；epub 在插件未装态走 generic-preview。Query View 面板行为不变（本阶段不验收其变更）。
