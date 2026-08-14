# 认证：SSH 挑战-应答

lo 核心使用 SSH 挑战-应答协议做登录（与 `lo auth` 注册的公钥配套）。本应用复用了
`@lo/client` 的 `AuthClient` 实现，无需手写签名流程。

## 协议流程

```
renderer ─login({ privateKeyPath })→ main ──@lo/client──▶ serve
1. POST /api/auth/challenge   → { nonce, namespace: 'lo-cli', registeredKeys }
2. ssh-keygen -Y sign -f <privateKeyPath> -n lo-cli <nonce>
3. POST /api/auth/login { nonce, fingerprint, signature } → { token }
```

- 挑战环节由客户端自动完成（SDK 内部），不再向 UI 暴露 nonce / signature。
- 登录成功后返回 `{ ok: true, token, fingerprint }`。

## 私钥路径

表单「SSH 私钥路径」对应 `login({ privateKeyPath })`：

```bash
~/.ssh/id_ed25519
```

支持 `~` 展开。若该路径无对应公钥注册（`lo auth list` 查不到），serve 会拒绝登录。

## 失败分类

主进程 `_toError` 把异常转成统一结构：

| `error` 值 | 来源 | 典型场景 |
| --- | --- | --- |
| `api` | `LoApiError` | 仓库未注册公钥、签名不匹配、401 |
| `http` | `LoHttpError` | ECONNREFUSED、超时、证书错误 |
| `unknown` | 其他 | 非预期异常 |

前端据此展示「登录失败：<message>」。

## 前置条件

- 仓库已 `lo init`，且已 `lo auth add -k <公钥> -l <标签>`。
- 否则 serve 在 challenge 阶段返回「仓库未注册任何 SSH 公钥,无需认证」。