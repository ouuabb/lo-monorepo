# 功能特性

本应用面向「连上已运行的 lo 核心，用图形界面做日常读取与浏览」。目前实现包含四块能力，
全部经由 `@lo/client` 提供。

## 仓库地址配置

- 通过 `host` / `port` / `protocol` 三元组定位 lo serve。
- 支持 http / https。默认 `127.0.0.1:8765`。
- 配置会被持久化到应用的用户数据目录（见 [连接配置](connect.md)）。

## SSH 挑战-应答登录

- 内部执行 lo 标准的 SSH 挑战-应答（challenge → sign → login）。
- 支持直接提供 **SSH 私钥路径**（`login({ privateKeyPath })`），
  内部通过 `@lo/client` 完成签名。
- 登录成功后持有 session token 与 fingerprint，供后续请求使用。

## 仓库状态（统计）

- 拉取 `lo-client-sdk` 的 `health.stats()`，即 serve 的 `GET /api/stats`。
- 展示资源数、关系数等仓库级统计。

## 资源列表

- `notes.list()` 拉取 `GET /api/notes`，支持 `type / schema / limit / offset` 查询。
- 渲染字段：`rid`、标题（`metadata.title ?? name`）、`type`。

## 登出

- 清除本地 token 缓存，重启会话需要重新登录。

## 下一步

- 详细流程见 [架构总览](architecture.md)，每个 API 见 [API 参考](api.md)。