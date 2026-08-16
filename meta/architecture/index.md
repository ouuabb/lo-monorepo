# 架构（Architecture）

lo 生态统一架构：**一个代码工作区，一个文档来源，一个站点入口**。

## 总体分层

```
        ┌────────────────────────────────────────────┐
        │              lo Core（packages/core）        │  世界模型唯一持有者
        │  Resource / Relation / Operation / Event     │  CLI `lo` / `lo serve`(8765)
        └───────────────────▲────────────────────────┘
                            │ HTTP
        ┌───────────────────┴────────────────────────┐
        │            @lo/client（packages/client）      │  通信能力层
        └───────────────────▲────────────────────────┘
        ┌───────────────────┴────────────────────────┐
        │   lo-agent（apps/agent）Electron 主进程/渲染   │  消费方 + 插件宿主
        │      PluginManager/Loader/Adapter/Registry    │
        └───────────────────▲────────────────────────┘
                            │ workspace:*（@lo/agent-plugins-sdk）
        ┌───────────────────┴────────────────────────┐
        │    Agent Plugin（plugins/agent）              │  ctx.lo / ctx.extensions / mountEl
        └────────────────────────────────────────────┘
```

## 各模块架构

| 模块 | 架构文档 |
|---|---|
| `packages/core` | [`core.md`](core.md)（世界模型/repo/插件系统/operation/event/workflow/agent/ai/collaboration/security/evolution/runtime/serve） |
| `packages/client` | [`client.md`](client.md)（request 管线/命名空间/错误/认证） |
| `packages/plugins-sdk` | [`plugins-sdk.md`](plugins-sdk.md)（Plugin/PluginContext/Builder/ResourceProvider 契约） |
| `packages/agent-plugins-sdk` | [`agent-plugins-sdk.md`](agent-plugins-sdk.md)（AgentPlugin/ctx.lo/extensions/manifest/lifecycle） |
| `apps/agent` | [`agent.md`](agent.md)（主进程↔Core/IPC 白名单/插件宿主/mountEl/渲染） |
| `plugins/core` | [`plugins-core.md`](plugins-core.md)（Core 插件源码+分发） |
| `plugins/agent` | [`plugins-agent.md`](plugins-agent.md)（客户端插件源码+分发） |
| Usage 层（Mode/Viewer/Session） | [`usage-layer.md`](usage-layer.md)（最终模型：定义/归属/链路/边界；演进见 specs/020~024） |

## 关键机制

- 跨包依赖：`workspace:*`（pnpm 链接）。
- 插件访问 Core：只经 `ctx.lo`（权限白名单 facade）→ `@lo/client`。
- 插件 UI：渲染进程 isolated world，`ctx` 唯一入口，G2 安全模型（见 [`../design/adr-001-mountel-g2.md`](../design/adr-001-mountel-g2.md)）。
- 生命周期：`dependsOn` 拓扑 + `activationEvents` 懒激活。
- 使用方式：Mode → Session → Viewer（`rules.writable → state.readOnly → UI`，见 [`usage-layer.md`](usage-layer.md)）。

详见 [`../specs/012-plugin-runtime-architecture`](../specs/012-plugin-runtime-architecture) 等。
