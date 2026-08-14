# @lo/plugins-sdk 架构（packages/plugins-sdk）

> 核对基线：见 `meta/setup/.baseline`。以当前代码为准；`@lo/core` 为 optional peer（workspace）。

`@lo/plugins-sdk` 是 **lo Core 插件开发契约层**：定义 Core Plugin 与 Core 之间的稳定契约，
插件经它接入 Core 的 PluginManager，**运行在 lo Core 进程内**。SDK **只定义契约**，
真实 `PluginContext` 由 Core PluginManager 加载时注入。

## 结构

- `packages/plugins-sdk/src/index.cjs`：统一出口。
- `src/Plugin.cjs`：插件基类（通用插件继承）。
- `src/PluginContext.cjs`：插件运行时上下文（Host 注入实现）。
- `src/base/ResourceProvider.cjs`：外部数据适配基类。
- `src/builders/ResourceBuilder.cjs` / `RelationBuilder.cjs`：链式构建器。
- `src/EventApi.cjs` / `Logger.cjs`：事件与日志契约。
- `packages/plugins-sdk/test/`：sdk/edge 测试；`types/index.d.ts`：类型声明。

## 插件模型

- **Plugin 基类**：`manifest()` 声明元信息（id/name/version/role/dependencies/contributes）；
  `register(ctx)` 注册命令/Hook/扩展点；可选 `initialize/enable/disable/dispose` 生命周期。
- **ResourceProvider 基类**：外部输入源适配（一个输入源可产出多个 Resource + Relation）。
- **role 标签**：adapter / connector / discovery 等，用于插件分类。

## PluginContext（契约面）

- `config(key, default)`：读配置。
- `logger`：日志。
- `extensions.register(...)`：注册扩展点。
- `hooks.register(name, fn)`：注册 Hook。
- `events.on(...)`：事件订阅。
- `resources` / `relations`：**Facade 资源操作**（内部 API 稳定；不直接操作裸 repo）。

## 边界

- **SDK 不依赖 lo Core 内部实现**、不 require lo-agent、不封装 `@lo/client`、不定义二次协议。
- 插件代码只从 `@lo/plugins-sdk` require；不自行 require lo Core 内部模块。
- 新公开 API 必须同步 `types/index.d.ts` 与测试。

## 与 `@lo/agent-plugins-sdk` 的关系

- `@lo/plugins-sdk` = 扩展 **Core 世界模型能力**（进程内）。
- `@lo/agent-plugins-sdk` = 扩展 **客户端交互能力**（lo-agent 内）。
