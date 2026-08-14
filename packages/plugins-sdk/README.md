# @lo/plugins-sdk

lo Core 插件开发工具包 —— lo Core 与插件之间的**稳定契约层**。纯 CommonJS、零运行时依赖。

## 使用

```js
const { Plugin, PluginContext, ResourceProvider, ResourceBuilder, RelationBuilder, EventApi, Logger } = require('@lo/plugins-sdk');
class MyPlugin extends Plugin {
  manifest() { return { id: 'my-plugin', name: 'My Plugin', version: '1.0.0' }; }
  register(ctx) { /* 经 ctx 与 lo Core 交互 */ }
}
```

## 文档

正式架构/API 文档统一在 lo 生态文档中心（唯一 Source of Truth）：

- 架构：`meta/architecture/plugins-sdk.md`
- API：`meta/api/plugins-sdk.md`
- 类型：`packages/plugins-sdk/types/index.d.ts`

## 开发

```bash
pnpm --filter @lo/plugins-sdk test
```

## 边界

- SDK 只定义契约，不实现业务调用；真实 `PluginContext` 由 lo Core 加载时注入。
- 不依赖 lo Core 内部、不 require lo-agent、不封装 `@lo/client`、不定义二次协议。

## License

MIT
