# @lo/client 架构（packages/client）

> 核对基线：见 `meta/setup/.baseline`。以当前代码为准。

`@lo/client` 是 lo 生态的**通信能力层**：消费 `lo serve` 的 REST/JSON 协议，
供桌面端/脚本等进程内消费者使用。**零运行时依赖**、纯 CommonJS。

## 入口与文件

- `packages/client/src/index.cjs`：导出 `LoClient / LoApiError / LoHttpError /
  signWithSshKeygen / AuthClient / http`。
- `packages/client/src/client.cjs`：`LoClient` 主客户端（request 管线 + 各资源命名空间）。
- `packages/client/src/http.cjs`：底层请求（URL 拼接/query/超时/重定向/JSON 解析/错误转换）。
- `packages/client/src/auth.cjs`：`AuthClient`（SSH 挑战-应答）+ `signWithSshKeygen`。
- `packages/client/test/`：client/http/auth 测试；`packages/client/types/index.d.ts`：类型声明。

## 请求管线

- **transport 可注入**（构造 `transport` 选项，签名 `(ctx) => Promise<{status, body, headers}>`），
  测试免真实网络。
- 登录后 token 自动以 `Authorization: Bearer` 附加；`setAdminToken` 的 admin token 优先。
- 所有 API 返回 **`res.body`**（业务数据），不抛业务异常；错误统一转换。

## 错误模型

- `LoApiError`：服务端业务错误（非 2xx），带 `status/code/body`。
- `LoHttpError`：连接/超时/重定向超限等传输错误。
- 转换在 `src/http.cjs` 完成。

## 命名空间

`LoClient` 聚合命名空间（`src/client.cjs`）：`notes / search / schemas / views /
workflows / automations / evolution / admin / sync / health / relations / operations /
events`，另有 `client.auth`（认证域）。

## 边界

- **不加第三方依赖**；新 HTTP 特性直接在 `http.cjs` 实现。
- `/api/auth/*` 端点走 `skipAuth`（不注入 token）。
- 类型/签名以 `packages/client/types/index.d.ts` 为准；正式 API 说明见 `meta/api/client.md`。
- 依赖方向：`消费方 → @lo/client → lo Core(HTTP)`。
