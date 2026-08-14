# demo-hello 插件

> 文档基线：[`.baseline`](../.baseline)。manifest 事实见 [`index.md`](index.md)（自动生成）。

## 定位

最小可用闭环验证插件——覆盖插件系统**全部 5 类扩展点** + mountEl UI + config + 写权限
示例，同时是 lo-agent 宿主测试与真实链路冒烟（mountEl isolated world）的载体。

## 演示功能

| 能力 | 内容 | 代码位置 |
|---|---|---|
| 命令·读 | `demo-hello.hello [who]`：返回问候语 + 激活时状态快照 | `plugins/agent/packages/demo-hello/index.cjs` L47-56 |
| 命令·写 | `demo-hello.touch <rid> [name]`：`ctx.lo.operations.execute('resource.update', …)`（需 `operations.write`） | `plugins/agent/packages/demo-hello/index.cjs` L57-68 |
| 视图 | `demo-hello.status`：HTML 快照（greeting + 资源/关系数） | `plugins/agent/packages/demo-hello/index.cjs` L71-85 |
| 面板 | `demo-hello.side`（area: sidebar） | `plugins/agent/packages/demo-hello/index.cjs` L88-95 |
| 编辑器 | `demo-hello.editor`（resourceType: note） | `plugins/agent/packages/demo-hello/index.cjs` L97-105 |
| 服务 | `demo-hello.status-service`：`{ getStatus, getGreeting }`（供 demo-consumer 消费） | `plugins/agent/packages/demo-hello/index.cjs` L107-118 |
| mountEl UI | `plugins/agent/packages/demo-hello/ui/index.mjs`：视图按钮 → `ctx.lo.health.stats()`；面板按钮 → `ctx.executeCommand('demo-hello.hello')` | `plugins/agent/packages/demo-hello/ui/index.mjs` |
| config | `greeting`（默认 `Hello from demo plugin`） | `plugins/agent/packages/demo-hello/plugin.json` |

## 实现方式

- `activate(ctx)` 内：读 `ctx.config('greeting')` → 经 `ctx.lo.health.stats()` 取状态快照
  （失败仅 warn 不阻塞）→ 注册命令/视图/面板/编辑器/服务 → 记录 `_activationResult`。
- 视图/面板/编辑器为**主进程 HTML 快照**渲染（render 返回字符串）；同一扩展点 id 同时有
  `ui/index.mjs` 对应实现，lo-agent 渲染层优先走 mountEl。
- 命令 handler 签名 `async (args, ctx) => result`；写命令透传到 Core 需 manifest 声明。

## 验证方式

- lo-agent 测试：`getUiModule('demo-hello')` 返回含 `export const views` 的源码 + worldId；
  `invokePluginUiCtx` 走 `ctx.lo.health.stats()` / `operations.execute`（写权限放行）。
- 真实链路冒烟（Electron 窗口）：`getUi → mount → render → 点击按钮 → ctx.lo.health.stats()
  往返返回「资源: 3 · 关系: 1」→ dispose 清空容器」。
- 人工：lo-agent 插件面板打开视图/面板/编辑器，命令面板执行 `demo-hello.hello`。
