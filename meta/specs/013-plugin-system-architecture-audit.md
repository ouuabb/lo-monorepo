# 013 · Plugin System Architecture Audit

> 状态：v0.1 · 架构审计（不新增功能）
> 范围：lo-agent Plugin Host 边界核对 + Plugin Ecosystem 分层
> 上游基准：006（生态边界）· 010（Core 协议）· 011（lo-agent 审计）· 012（Plugin Runtime 设计）· 当前实现
> 方法：以代码与已冻结文档为准，区分"属于 lo-agent"与"应迁移到独立 SDK/规范"

---

## 1. 审计背景

lo-agent Plugin Host 最小闭环已完成（PluginManager/Loader/Host/Context + demo 插件）。
但这是 **lo-agent 内部 Runtime/Host**，不是完整 Plugin Ecosystem。

本报告核对：
1. Host 职责是否正确
2. 哪些应属 lo-agent / 哪些应迁移到独立 SDK
3. Host API 白名单是否耦合 lo-agent 业务
4. manifest 是否需要独立规范
5. lifecycle/context/permission/capability 是否需要抽象
6. 下一阶段开发顺序

---

## 2. 当前实现 vs 基准核对

### 2.1 职责分配现状

| 职责 | 当前实现位置 | 基准要求 | 判定 |
|---|---|---|---|
| 插件加载/生命周期 | `lo-agent/src/main/plugin/` | 属 Host（lo-agent） | ✅ 正确 |
| 插件契约（基类/上下文） | `@lo/agent-plugins-sdk` | 独立 SDK 仓库 | ✅ 正确 |
| Core 访问 | 经 `ctx.host` → LoCoreService → @lo/client | 经 Host API，不直连 | ✅ 正确 |
| 插件 UI 扩展 | 未实现 | 属未来（012 §9） | 记录 |

### 2.2 正确项（保持）

- **PluginManager/Loader 属 Host**：生命周期、扫描、注册表是 lo-agent 宿主职责，不迁移。
- **SDK 属独立仓库**：`@lo/agent-plugins-sdk` 已独立，插件契约在此。
- **边界**：插件只能经 `ctx.host` 访问 Core，Host 内部经 @lo/client（已验证，host 无 client 暴露）。

---

## 3. 问题：Host API 白名单耦合 lo-agent 业务

### 3.1 现状（plugin-host.cjs 实测）

```js
createPluginHost(loCore) {
  return {
    getStatus, listNotes, getNote, updateNote,
    getRelations, listOperations, undoOperation,
    subscribeEvents, unsubscribeEvents, isAuthenticated,
  };
}
```

### 3.2 问题

1. **方法命名 = LoCoreService 业务方法**：`listNotes`/`updateNote` 是 lo-agent 渲染层用的方法名，
   不是 Plugin 语义。插件看到一个 `updateNote`，实际应理解为 `operations.execute("resource.update")`。
2. **只暴露了 lo-agent 已消费的能力**：白名单 = LoCoreService 现有方法。
   若 Core 新增能力（如 schemas），需先改 LoCoreService 再加白名单 —— **Host 与 lo-agent 业务耦合**。
3. **与 012 设计不符**：012 §4 定义 `ctx.lo` 为 `operations/relations/events/resources` 协议语义门面，
   当前实现用 `ctx.host` + 业务方法名。

### 3.3 判定

**Host API 应抽象为"Core 协议语义门面"而非"LoCoreService 方法透传"。**
白名单应从 `operations/relations/events/resources/health` 协议面派生，而不是 lo-agent 业务方法名。

---

## 4. 哪些能力属于 lo-agent vs 独立 SDK/规范

### 4.1 属 lo-agent（Host）——保持

| 项 | 理由 |
|---|---|
| PluginManager / PluginLoader / PluginRegistry | 宿主生命周期，与 lo-agent 进程绑定 |
| ExtensionRegistry（UI 扩展点收集） | 与 lo-agent UI 绑定（未来） |
| 插件安装/卸载/配置存储 | 与 userData 绑定 |
| Host 能力注入（构造 context） | 宿主职责 |

### 4.2 应迁移/抽象到独立 SDK（`@lo/agent-plugins-sdk`）

| 项 | 现状 | 迁移方向 |
|---|---|---|
| **PluginContext 结构** | 由 Host `_createContext` 内联构造 | 应定义在 SDK（`AgentPluginContext`），Host 只注入能力 |
| **Context 能力门面（operations/relations/events/...）** | Host 内联 `ctx.host` | SDK 定义 `ctx.lo` 协议门面 + Host 实现 |
| **Manifest 规范** | 内联在 Host `validateManifest` 使用 | SDK 独立定义 manifest schema 校验 |
| **Lifecycle 状态机** | Host `plugin-manager` 内实现 | 状态定义属 SDK 契约；编排属 Host |

### 4.3 应独立成规范（文档层面）

| 项 | 现状 | 方向 |
|---|---|---|
| **Manifest 独立规范** | 依赖 SDK validateManifest 硬编码字段 | 输出独立 manifest schema 文档（012 §1 已有草案） |
| **Permission/Capability** | 未实现 | 在 SDK 定义抽象接口，Host 实现 |

---

## 5. Host API 白名单重新设计

### 5.1 目标：协议语义门面（解耦 lo-agent 业务）

```js
// ctx.lo —— 协议语义门面（对齐 010）
ctx.lo = {
  operations: { execute(type, params, options), list(query), undo(id), ... },
  relations:  { list(rid), get(id), create(...), update(...), remove(id) },
  events:     { subscribe(types, handler), history(query) },
  resources:  { list(query), get(rid), search(q) },   // 读面
  health:     { stats() },
}
```

### 5.2 与当前 `ctx.host` 的关系

| 方式 | 说明 | 判定 |
|---|---|---|
| 保留 `ctx.host` + 增加 `ctx.lo` 协议门面 | 过渡期兼容 | 短期可 |
| 只留 `ctx.lo` 协议门面 | 彻底解耦，SDK 定义 | **推荐** |

### 5.3 解耦后的结构

```
SDK 定义:
  AgentPluginContext（含 ctx.lo 协议门面的接口声明）
  AgentPlugin 基类
  Manifest schema

Host（lo-agent）实现:
  实现 ctx.lo 门面（内部映射到 LoCoreService / @lo/client）
  生命周期编排
  能力注入
```

> 关键变化：`ctx.lo` 的**接口在 SDK 定义**，Host 提供**实现**。
> 这样 SDK 独立于 lo-agent 业务，Host 只负责绑定。

---

## 6. Manifest 独立规范

### 6.1 现状

- SDK `validateManifest.cjs` 硬编码 `id/name/version/main` 必填 + id/version 格式。
- 012 §1 已给出扩展草案（engines/activationEvents/contributes/permissions/config）。

### 6.2 判定

**Manifest 应独立成规范（文档 + SDK schema），而非 Host 内联。**
理由：
- 插件是第三方编写的，manifest 是插件↔宿主契约，必须稳定、有版本。
- 当前 SDK 校验仅覆盖基础字段，`contributes/permissions/engines` 未定义 schema。

### 6.3 方向

- SDK 增加 `manifestSchema`（JSON Schema 或校验器），覆盖：
  `id/name/version/main`（现有）+ `engines` + `activationEvents` + `contributes` + `permissions` + `config`。
- 输出独立文档：`Manifest Specification`（012 §1 扩展为正式规范）。

---

## 7. Lifecycle / Context / Permission / Capability 抽象

### 7.1 Lifecycle

| 现状 | 判定 |
|---|---|
| Host 内实现 `loaded → activated → deactivated → disposed` | 状态定义应属 SDK 契约；状态机编排属 Host |

**方向**：SDK 定义生命周期枚举 + 状态转移表；Host 按表驱动。

### 7.2 Context

| 现状 | 判定 |
|---|---|
| Host `_createContext` 内联返回 `{pluginId, host, logger, config}` | Context 结构应属 SDK（`AgentPluginContext` 类） |

**方向**：Host 用 SDK 的 `AgentPluginContext` 实例化（注入能力），而非返回裸对象。

### 7.3 Permission

| 现状 | 判定 |
|---|---|
| 未实现（manifest.permissions 未消费） | 需抽象：SDK 定义 permission 声明，Host 实现能力代理 |

**方向**：`ctx.lo` 门面按 manifest.permissions 白名单暴露方法（未授权抛错）。

### 7.4 Capability

| 现状 | 判定 |
|---|---|
| 未实现（无 capability 声明） | 需抽象：SDK 定义 capability（commands/views/...）声明，Host 收集 |

**方向**：manifest.capabilities/contributes → Host ExtensionRegistry 收集消费。

---

## 8. 下一阶段开发顺序

### Phase A：SDK 契约完善（先做，独立于 lo-agent）

1. **SDK `AgentPluginContext` 落位**：SDK 定义 `ctx.lo` 协议门面接口 + context 结构（operations/relations/events/resources/health）。
2. **SDK Manifest Schema 完善**：增加 engines/activationEvents/contributes/permissions/config 校验。
3. **SDK 生命周期定义**：导出状态枚举 + 转移表。
4. **SDK 输出 Manifest Specification 文档**。

> 产出：`@lo/agent-plugins-sdk` 成为完整契约层（非 lo-agent 附属）。

### Phase B：Host 对齐（lo-agent 侧）

5. **Host 用 SDK `AgentPluginContext` 实例化**（注入能力，不内联裸对象）。
6. **Host 实现 `ctx.lo` 协议门面**（内部映射到 LoCoreService / @lo/client）。
7. **移除 `ctx.host` 业务方法透传**（或保留为兼容别名，短期）。
8. **Host 实现 permission 代理**（ctx.lo 按 manifest.permissions 白名单）。

### Phase C：Capability / UI

9. **ExtensionRegistry 收集 contributes**（commands/views/panels）。
10. **UI 挂载机制**（012 §9 渲染进程模型）。

### Phase D：生态（未来）

11. **Plugin 仓库/发布机制**（lo-agent-plugins 独立仓库，012 §11 预留）。
12. **Plugin 市场/管理 UI**。

---

## 9. 结论

1. **Host 职责正确**（生命周期/加载/能力注入属 lo-agent），保持。
2. **主要问题**：Host API 白名单 = LoCoreService 业务方法透传，**耦合 lo-agent 业务**，应抽象为 `ctx.lo` 协议语义门面（SDK 定义接口，Host 实现）。
3. **应迁移到 SDK**：PluginContext 结构、ctx.lo 门面接口、Manifest schema、生命周期状态定义。
4. **应独立成规范**：Manifest Specification（SDK 导出 schema + 独立文档）。
5. **permission/capability 需抽象**：SDK 定义声明，Host 实现代理/收集。
6. **阶段顺序**：先 SDK 契约完善（A）→ Host 对齐（B）→ Capability/UI（C）→ 生态（D）。

> 核心判断：当前实现是"lo-agent 内部的插件 Host"，正确但偏业务耦合。
> 完整 Plugin Ecosystem 需要 **SDK 承担契约、Host 承担编排、Manifest 承担规范** 的三层分离。
