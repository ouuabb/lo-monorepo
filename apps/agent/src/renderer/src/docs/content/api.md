# API 参考

渲染进程通过 `window.loAgent`（preload `contextBridge`）访问主进程能力。

## window.loAgent

```js
{
  version: '0.1.0',
  loCore: {
    getConfig(): Promise<object>,
    configure(config): Promise<{ ok: true, config } | { ok: false, ... }>,
    login(params): Promise<{ ok: true, token, fingerprint } | { ok: false, ... }>,
    getStatus(): Promise<{ ok: true, stats } | { ok: false, ... }>,
    listNotes(query): Promise<{ ok: true, total, data } | { ok: false, ... }>,
    logout(): Promise<{ ok: true }>,
  },
}
```

## 方法明细

### getConfig()

- IPC：`lo-core:config`
- 返回持久化的仓库配置（`userData/lo-agent.json`），未配置时 `{}`。

### configure(config)

- IPC：`lo-core:configure`
- `config`: `{ host?, port?, protocol?, timeout? }`
- 归一化：`host` 默认 `127.0.0.1`，`port` 默认 `8765`，`protocol` 默认 `http`，`timeout` 默认 `15000`。
- 成功：`{ ok: true, config }`。

### login(params)

- IPC：`lo-core:login`
- `params`: `{ privateKeyPath? }`（由 SDK 自动做 SSH 挑战-应答签名）
- 成功：`{ ok: true, token, fingerprint }`。
- 失败结构见下。

### getStatus()

- IPC：`lo-core:status`
- 成功：`{ ok: true, stats }`（对应 serve `GET /api/stats`）。

### listNotes(query)

- IPC：`lo-core:list-notes`
- `query`: `{ type?, schema?, limit?, offset? }`
- 成功：`{ ok: true, total, data }`。

### logout()

- IPC：`lo-core:logout`
- 清除本地 token，返回 `{ ok: true }`。

## 失败结构

主进程统一把异常转成可序列化错误（不抛 Error 对象）：

```js
{ ok: false, error: 'api'|'http'|'unknown', message, [status]|[code] }
```

- `api` → `LoApiError`（业务失败，含 `status`）
- `http` → `LoHttpError`（网络失败，含 `code`）
- `unknown` → 其他异常

未配置时调用 login/status/listNotes 会返回
`{ ok: false, error: 'unknown', message: '请先配置仓库地址（configure）' }`。