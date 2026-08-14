# 连接配置

「仓库地址」表单配置 lo serve 的位置。

## 字段

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `protocol` | `http` | `http` 或 `https` |
| `host` | `127.0.0.1` | serve 监听地址 |
| `port` | `8765` | serve 监听端口 |

## 内部行为

- 前端点击「连接」后调用 `loCore.configure(config)`（IPC `lo-core:configure`）。
- 主进程 `LoCoreService.configure()` 用这些值创建 `LoClient` 实例，
  并归一化 `port` / `timeout`（默认 15000ms）。
- 成功返回 `{ ok: true, config }`。

## 持久化

- 配置不写入仓库，而是存在应用自己的 `userData/lo-agent.json`。
- 由 `ConfigStore`（`src/main/config-store.cjs`）负责读写。
- 每次启动时 renderer 会先调用 `loCore.getConfig()`（IPC `lo-core:config`）
  回填上次的 host / port / privateKeyPath。

> 注意：`privateKeyPath` 只用于登录签名，密钥不离开本机；配置文件中保存的是**路径**，
> 不是私钥内容。

## 已登录状态

- 登录成功后 `LoClient` 持有 session token 与 fingerprint，
  后续 `getStatus` / `listNotes` 自动带上 `Authorization: Bearer <token>`。
- 点击「登出」调用 `logout()` 清除本地 token。