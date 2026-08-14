# API 与模块说明

> 正式 API 文档统一在此（`meta/api/`）；代码包内仅保留极简 README 与 `types/index.d.ts`。

## 索引

| 模块 | API 文档 |
|---|---|
| `@lo/client`（packages/client） | [`client.md`](client.md) |
| `@lo/plugins-sdk`（packages/plugins-sdk） | [`plugins-sdk.md`](plugins-sdk.md) |
| `@lo/agent-plugins-sdk`（packages/agent-plugins-sdk） | [`agent-plugins-sdk.md`](agent-plugins-sdk.md) |
| lo-agent（apps/agent）IPC 通道 | [`ipc-channels.md`](ipc-channels.md)（自动生成） |

## 概览

- **@lo/client**：HTTP 客户端 SDK，消费 `lo serve` 协议；所有 API 返回 `res.body`；
  错误 `LoApiError`/`LoHttpError`；SSH 挑战-应答认证；命名空间
  notes/search/schemas/views/workflows/automations/evolution/admin/sync/health/relations/
  operations/events。
- **@lo/plugins-sdk**：Core 插件契约（`Plugin`/`PluginContext`/`ResourceProvider`/
  `ResourceBuilder`/`RelationBuilder`/`EventApi`/`Logger`），宿主加载时注入实现。
- **@lo/agent-plugins-sdk**：客户端插件契约（`AgentPlugin`/`AgentPluginContext`/
  `createLoFacade`/`createExtensionsFacade`/`validateManifest`/`manifestSchema`/
  `createPlugin`/`AgentEventEmitter`/`Logger`）；Manifest 规范见
  [`../specs/manifest-spec.md`](../specs/manifest-spec.md)。
- **lo-agent**：`window.loAgent.loCore`（App 能力）与 `window.loAgent.plugins`/
  `window.pluginUi`（插件能力）经 preload 白名单暴露；IPC 通道目录见
  [`ipc-channels.md`](ipc-channels.md)。

> 详细签名以各包 `types/index.d.ts` 与源码为准。
