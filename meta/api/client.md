# @lo/client API（packages/client）

> 核对基线：见 `meta/setup/.baseline`。方法签名以 `packages/client/types/index.d.ts` 与源码为准。

## 入口

```js
const { LoClient, LoApiError, LoHttpError, signWithSshKeygen } = require('@lo/client');
const client = new LoClient({ host: '127.0.0.1', port: 8765, timeout: 15000 });
await client.login({ privateKeyPath: '~/.ssh/id_ed25519' });
```

## 认证（client.auth）

- `client.login(params)`：SSH 挑战-应答登录（`privateKeyPath` 或手动 `nonce/signature`）。
- `client.logout()`、`client.setAdminToken(token)`、`configured` 等。
- `signWithSshKeygen(nonce, keyPath)`：系统 ssh-keygen 签名。

## 命名空间与方法（完整清单）

| 命名空间 | 方法 |
|---|---|---|
| `health` | `ping / stats / tags` |
| `repository` | `info / resolveLocation(rid)`（Repository Identity + Resolver 三态） |
| `resources` | `import({buffer, filename, metadata, type}) / binary(rid)`（二进制资源导入与 Core 侧解密读取） |
| `modes` | `list / resolve(rid)`（U1：Usage Mode 解析） |
| `viewers` | `list(query) / resolve(modeId)`（U1：Usage Viewer 解析，?mode=） |
| `notes` | `list / get / create / update / remove / upload` |
| `search` | `search` |
| `schemas` | `list / get / create / update / remove / attach / detach` |
| `views` | `list / get / create / update / remove / run / export / importDef` |
| `workflows` | `list / get / create / update / remove / versions / attach / detach / resume / transition / can / instances / instance / history` |
| `automations` | `list / get / create / update / remove / enable / disable / run / history` |
| `evolution` | `status / observe / health / detect / plan / execute / history / rollback` |
| `sync` | `sync / push / pull` |
| `operations` | `execute / list / get / undo / beginTransaction / executeInTransaction / commit / rollback` |
| `relations` | `list / get / create / update / remove` |
| `events` | `history / subscribe(SSE)` |
| `admin` | `stats / resources / link / tags / graph / containers / relations / audit / import / commit / suggestions / types / categories / tags` |

> 命名空间由 `src/client.cjs` 的 `create*Api(this)` 构造；完整签名见
> `packages/client/types/index.d.ts`。

## notes.upload（导入文件）

- `notes.upload(files, { title?, tags? })`：multipart/form-data 请求 `POST /api/notes/upload`；
  multipart 构造（boundary/part 头）完全封装在 SDK 内部。
- `files`：`[{ name, data: Buffer|Uint8Array|ArrayBuffer, contentType? }]`；`title/tags`
  应用到全部文件；返回 `{ uploaded, data }`（data 为各文件创建的资源结果）。

## 错误

```js
try {
  const res = await client.notes.get('res_x');
} catch (e) {
  if (e instanceof LoApiError) { /* status/code/body */ }
  if (e instanceof LoHttpError) { /* code */ }
}
```

## 约定

- 返回 `res.body`；`/api/auth/*` 走 `skipAuth`；`transport` 可注入。
