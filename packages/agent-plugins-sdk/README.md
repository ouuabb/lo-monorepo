# @lo/agent-plugins-sdk

lo-agent 客户端插件开发工具包 —— 定义客户端插件如何写。纯 CommonJS、零运行时依赖
（`@lo/client` 为可选 peer，由宿主注入）。

## 使用

```js
const { AgentPlugin } = require('@lo/agent-plugins-sdk');
class MyPlugin extends AgentPlugin {
  manifest() { return { id: 'my-plugin', name: 'My Plugin', version: '0.1.0', main: 'index.cjs' }; }
  async activate(ctx) { ctx.extensions.registerCommands([{ id: 'my-plugin.hello', title: 'Hello', handler: async () => 'hi' }]); }
}
```

## 文档

正式架构/API 文档统一在 lo 生态文档中心（唯一 Source of Truth）：

- 架构：`meta/architecture/agent-plugins-sdk.md`
- API：`meta/api/agent-plugins-sdk.md`
- Manifest 规范：`meta/specs/manifest-spec.md`
- 类型：`packages/agent-plugins-sdk/types/index.d.ts`

## 开发

```bash
pnpm --filter @lo/agent-plugins-sdk test
pnpm --filter @lo/agent-plugins-sdk lint
```

## 边界

- 插件只经 `ctx.lo` / `ctx.extensions` 契约访问能力；禁止 require lo-agent 内部。
- 权限默认只读，写操作需 `manifest.permissions.lo` 显式声明。

## License

MIT
