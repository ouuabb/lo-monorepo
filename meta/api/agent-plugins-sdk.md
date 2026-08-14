# @lo/agent-plugins-sdk API（packages/agent-plugins-sdk）

> 核对基线：见 `meta/setup/.baseline`。签名以 `packages/agent-plugins-sdk/types/index.d.ts` 与源码为准。

## 导出

`src/index.cjs`：`AgentPlugin / AgentPluginContext / createLoFacade / LO_CAPABILITIES /
LO_PERMISSION_MAP / createExtensionsFacade / EXTENSIONS_METHODS / validateManifest /
manifestSchema / createPlugin / AgentEventEmitter / Logger / ConsoleLogger / SilentLogger /
fromHost / lifecycle 常量 / 权限类型 / contributes 工具`。

## AgentPlugin（基类）

```js
const { AgentPlugin } = require('@lo/agent-plugins-sdk');
class P extends AgentPlugin {
  manifest() { return { id: 'demo', name: 'Demo', version: '0.1.0', main: 'index.cjs' }; }
  async activate(ctx) { /* 注册命令/视图/服务等 */ }
  async deactivate() {}
}
```

## AgentPluginContext（ctx）

| 面 | 说明 |
|---|---|
| `ctx.pluginId` / `ctx.logger` / `ctx.events`（AgentEventEmitter） | 基础 |
| `ctx.lo` | 能力门面：`operations / relations / events / resources / health`（Host 注入，权限过滤） |
| `ctx.extensions` | 注册面：`registerCommands / registerView / registerPanel / registerEditor / registerService / getService / listServices` |
| `ctx.config(key?, def?)` | 配置（默认值 + 用户配置合并） |
| `ctx.settings` | 插件私有设置（get/set，Host 注入时可用） |

## ctx.lo 命名空间

| 命名空间 | 方法 |
|---|---|
| `operations` | `execute / list / get / undo` |
| `relations` | `list / get / create / update / remove` |
| `events` | `subscribe / history` |
| `resources` | `list / get / search` |
| `health` | `stats` |

> 权限：`manifest.permissions.lo` 白名单（`LO_PERMISSION_MAP`），默认只读；
> 未授权调用经 `createLoFacade` 抛「被拒绝」。

## 生命周期

`installed → loaded → activated → enabled → disabled → deactivated → disposed`
（`lifecycle.cjs` 定义枚举 + 转移表，Host 按契约驱动）。

## Manifest

- 必填：`id / name / version / main`；`id` kebab-case；`version` x.y.z。
- 可选：`contributes`（commands/views/panels/editors/services）、`permissions.lo`、
  `dependsOn`、`activationEvents`、`ui`（mountEl）、`config`。
- 完整规范：`meta/specs/manifest-spec.md`；机器可读 schema：`manifestSchema`。

## mountEl（渲染端 UI）

- `manifest.ui`：自包含 ESM，渲染进程 isolated world 执行；`render(mountEl, ctx)`。
- `ctx` 为插件作用域能力入口；能力经 `agent-plugins:ctx` 代理到主进程 `context.lo` facade。
- 安全模型（G2）见 `meta/design/adr-001-mountel-g2.md` 与 `meta/AGENTS.md` §12.3。
