# lo-agent 文档中心

> lo Agent 桌面端内置文档。本文档描述本应用「当前实现」的功能、架构与开发规范。

## 这是什么

**lo-agent** 是 lo 知识库的 Electron 桌面端。它本身不直接读写笔记仓库，而是通过
`@lo/client` 连接已经启动的 lo 核心（`lo serve` 提供的 HTTP API），让你在图形界面里：

- 配置仓库地址（host / port / protocol）
- 使用 SSH 挑战-应答登录
- 查看仓库状态与统计
- 浏览资源列表

它采用「前端（renderer） ↔ preload ↔ 主进程（main） ↔ lo 核心」的链路，
渲染进程不接触任何 Node API，所有能力都通过受控 IPC 通道暴露。

## 快速导航

| 章节 | 内容 |
| --- | --- |
| [快速开始](quickstart.md) | 安装、启动 lo serve、运行本应用 |
| [功能特性](intro.md) | 连接 / 认证 / 状态 / 资源浏览 |
| [架构总览](architecture.md) | main / preload / renderer 分层 |
| [连接配置](connect.md) | 仓库地址与配置持久化 |
| [认证](auth.md) | SSH 挑战-应答流程 |
| [状态与资源](content.md) | 仓库状态与资源列表 |
| [安全基线](security.md) | Electron 安全设计 |
| [开发指南](develop.md) | 测试、Lint、提交规范 |
| [API 参考](api.md) | `window.loAgent` 方法一览 |

## 使用前提

1. 已安装 Node.js ≥ 20 与 npm
2. 已安装 lo 并被 **lo 核心 CLI**
3. lo 仓库中已注册 SSH 公钥（`lo auth add`）
4. 已启动 `lo serve`

详见 [快速开始](quickstart.md)。