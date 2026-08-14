# @lo/plugins-sdk API（packages/plugins-sdk）

> 核对基线：见 `meta/setup/.baseline`。签名以 `packages/plugins-sdk/types/index.d.ts` 与源码为准。

## 导出

`src/index.cjs`：`Plugin / PluginContext / ResourceProvider / ResourceBuilder /
RelationBuilder / EventApi / Logger`。

## Plugin（基类）

```js
const { Plugin } = require('@lo/plugins-sdk');
class HelloPlugin extends Plugin {
  manifest() { return { id, name, version, description, role, dependencies, contributes }; }
  register(ctx) { ctx.extensions.register(id, type, key, { run() {} }); }
  async initialize() {}
  async enable() { await super.enable(); }
  async disable() { await super.disable(); }
  async dispose() { await super.dispose(); }
}
```

## PluginContext（契约面）

| 面 | 说明 |
|---|---|
| `ctx.config(key, default)` | 读配置 |
| `ctx.logger` | 日志（debug/info/warn/error） |
| `ctx.extensions.register(...)` | 注册扩展点（commands 等） |
| `ctx.hooks.register(name, fn)` | 注册 Hook（如 beforeResourceCreate） |
| `ctx.events.on(event, handler)` | 事件订阅 |
| `ctx.resources.create(built)` / `ctx.relations.create(built)` | Facade 资源/关系操作 |

## 构建器

- `ResourceBuilder.note().name('x').build()`：链式构建 Resource Candidate，`build()` 提前校验。
- `RelationBuilder.contains(parentRid, childRid).build()`：链式构建 Relation。

## ResourceProvider（基类）

外部数据适配基类：一个输入源产出多个 Resource + Relation（如 EPUB 解析器）。

## EventApi / Logger

- `EventApi`：事件发布/订阅契约。
- `Logger`：日志接口（console/silent/fromHost 实现）。

> 完整示例见 `meta/specs/` 与旧仓库素材（epub/git 等）；插件运行契约详见
> `meta/specs/008-core-plugin-system-audit.md`、`013-plugin-system-architecture-audit.md`。
