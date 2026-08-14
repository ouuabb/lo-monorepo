# @lo/agent-plugins-sdk 架构（packages/agent-plugins-sdk）

> 核对基线：见 `meta/setup/.baseline`。以当前代码为准；`@lo/client` 为 optional peer（workspace）。

`@lo/agent-plugins-sdk` 是 **lo-agent 客户端插件开发工具包**（契约层）。与 lo Core 的嵌入式
插件系统（`@lo/plugins-sdk`，进程内）不同，本 SDK 的插件**直接运行在 lo-agent 桌面端**，
通过 `@lo/client` 访问 lo Core。

## 结构

- `packages/agent-plugins-sdk/src/index.cjs`：统一出口。
- `src/AgentPlugin.cjs`：插件基类（manifest/activate/deactivate 生命周期）。
- `src/AgentPluginContext.cjs`：运行时上下文（结构 + 注入点）。
- `src/lo-facade.cjs`：`ctx.lo` 接口契约（Host 注入实现；权限白名单过滤）。
- `src/extensions-facade.cjs`：`ctx.extensions` 能力注册契约（Host 注入实现）。
- `src/manifest.cjs`：manifest schema 定义 + 校验（导出 `manifestSchema`）。
- `src/lifecycle.cjs`：生命周期状态枚举 + 转移表。
- `src/types.cjs`：capability / permission 类型定义。
- `src/AgentEventEmitter.cjs`：事件总线。
- `src/Logger.cjs`：日志接口 + console/silent/fromHost。
- `src/validateManifest.cjs` / `src/loadPlugin.cjs`：manifest 校验 / `createPlugin`。
- `src/contributes.cjs` / `src/extension-point.cjs`：contributes 解析 / 扩展点构造。
- `test/`：契约测试；`types/index.d.ts`：类型声明。

## 依赖方向（单向）

```
Plugin → ctx.lo(契约) → Host Adapter(实现) → @lo/client → lo Core
Plugin → ctx.extensions(契约) → Host ExtensionRegistry(实现) → 命令执行 Runtime
```

- **SDK 不依赖 lo-agent**（无反向依赖）；**不替代 `@lo/client`**（不 require、不封装
  HTTP/协议）；**不定义二次协议**。
- `ctx.lo` / `ctx.extensions` 只是契约，实现由 Host（lo-agent）注入。

## 契约面

- `ctx.lo`：operations / relations / events / resources / health（Host 注入；权限白名单过滤，
  未授权调用抛错）。
- `ctx.extensions`：registerCommands / registerView / registerPanel / registerEditor /
  registerService / getService / listServices（Host 注入）。
- `ctx.config(key, def)` / `ctx.events`（AgentEventEmitter）/ `ctx.settings`。
- **manifest 契约**：必填 id/name/version/main；contributes（commands/views/panels/editors/
  services）；permissions.lo（最小权限，默认只读）；dependsOn；activationEvents；ui（mountEl）。
  独立规范见 `meta/specs/manifest-spec.md`。

## 边界

- 插件只从 `@lo/agent-plugins-sdk` require，永不 require lo-agent 内部文件。
- 所有能力接口有 noop 默认（未注入不崩溃，调用抛错提示）。
- 事件点号命名（`resource.created`，自定义 `<pluginId>.<event>`）。
- 生命周期/能力权限由 SDK 定义，Host 按契约驱动。
- 新公开 API 必须同步 `types/index.d.ts` 与测试。
