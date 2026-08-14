# @lo/agent-plugins-sdk

lo-agent 插件开发工具包 —— 让插件**直接运行在 lo-agent 内**,通过 `@lo/client`
访问 lo Core,而不是像 lo Core 的嵌入式插件那样跑在核心进程里。

## 为什么单独一套 SDK

- **运行位置不同**:插件跑在 lo-agent(Electron 桌面端),不跑在 lo Core 进程
- **能力来源不同**:插件经 `@lo/client`(HTTP)访问仓库,而非进程内 `ResourceService`
- **生命周期不同**:由 lo-agent 宿主激活/停用,而非 lo Core 的 PluginManager

`@lo/agent-plugins-sdk` 定义插件契约(基类、上下文、事件、manifest),
`@lo/client` 提供通讯能力,两者配合使用。

**Manifest 规范**:插件 `plugin.json` 的完整契约见
[`manifest-spec.md`](./manifest-spec.md)(必填字段 / dependsOn / contributes /
permissions / config / 完整示例)。

## 插件生命周期

```
created → loaded → activated → enabled → disabled → deactivated → disposed
```

由 lo-agent 宿主驱动;插件通常只实现 `manifest()` 与 `activate(ctx)`。

## 与既有 SDK 的关系

| SDK | 运行位置 | 消费者 |
|---|---|---|
| `@lo/plugins-sdk` | lo Core 进程内 | lo Core 插件 |
| `@lo/client` | 任意外部进程 | lo Core 的 HTTP 客户端 |
| **`@lo/agent-plugins-sdk`** | **lo-agent 内** | **lo-agent 插件** |
