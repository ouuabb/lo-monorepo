# demo-consumer 插件

> 文档基线：[`.baseline`](../.baseline)。manifest 事实见 [`index.md`](index.md)（自动生成）。

## 定位

**服务消费方闭环验证**——经 `ctx.extensions.getService` 消费 demo-hello 的
`status-service`，验证跨插件服务链路（提供者 registerService → ExtensionRegistry →
消费者 getService → 调用 api）。同时演示 `dependsOn` 依赖声明。

## 演示功能

| 能力 | 内容 | 代码位置 |
|---|---|---|
| 服务消费 | 激活时 `ctx.extensions.getService('demo-hello.status-service')`，调 `getGreeting()/getStatus()` | `plugins/agent/packages/demo-consumer/index.cjs` L28-39 |
| 优雅降级 | 提供者不可用时返回 `{ available:false, reason }`（不崩溃） | `plugins/agent/packages/demo-consumer/index.cjs` L30-33 |
| 命令·实时消费 | `demo-consumer.consume`：命令面板实时重跑服务消费 | `plugins/agent/packages/demo-consumer/index.cjs` L44-55 |
| 依赖声明 | `dependsOn: ["demo-hello"]` → 宿主按依赖拓扑先激活提供者 | `plugins/agent/packages/demo-consumer/plugin.json` |

## 实现方式

- 不注册任何扩展点以外的能力；`_consume(ctx)` 为消费逻辑（判空 + 调用 api）。
- `getService` 为**同步**语义：提供者必须已激活，故声明 `dependsOn` 保证激活顺序；
  若提供者停用，`getService` 返回 `null`，插件记录原因并继续注册命令。

## 边界

- 消费者只经 `ctx.extensions`（SDK 契约）取服务 api，不触碰 Host 注册表；
  不持有注册表 key，只按服务 ID 调用。

## 验证方式

- lo-agent E2E：真实 demo 加载 → demo-hello 先激活 → consumer `result.available === true`；
  `disable('demo-hello')` 后 `consume` 降级为 `available:false`。
- 依赖拓扑测试：`dependsOn` 保证提供者先于消费者激活（即使消费者字母序在前）。
