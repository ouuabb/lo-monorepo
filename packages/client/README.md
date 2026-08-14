# @lo/client

lo 知识库 API 客户端 SDK —— 面向 `lo serve` HTTP 协议的类型化客户端。纯 CommonJS、**零运行时依赖**。

## 使用

```js
const { LoClient } = require('@lo/client');
const client = new LoClient({ host: '127.0.0.1', port: 8765 });
await client.login({ privateKeyPath: '~/.ssh/id_ed25519' });
const list = await client.notes.list({ limit: 20 });
```

配置项：`host(127.0.0.1) / port(8765) / protocol(http) / timeout(15000) / signer / transport`（可注入 transport 便于测试/代理）。

## 文档

正式架构/API 文档统一在 lo 生态文档中心（唯一 Source of Truth）：

- 架构：`meta/architecture/client.md`
- API：`meta/api/client.md`
- 类型：`packages/client/types/index.d.ts`

## 开发

```bash
pnpm --filter @lo/client test
pnpm --filter @lo/client lint
pnpm --filter @lo/client format
```

## 边界

- 不加第三方依赖；新 HTTP 特性直接在 `src/http.cjs` 实现。
- 与 `@lo/plugins-sdk` 互补：本包面向 API 消费者（桌面/脚本），SDK 面向插件作者。

## License

MIT
