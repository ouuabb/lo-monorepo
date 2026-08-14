# 快速开始

本指南带你从零开始在本机连上 lo 仓库并浏览笔记。

## 1. 准备 lo 核心

确保已安装 lo CLI，并已在某个目录初始化为 lo 仓库：

```bash
lo init                        # 在空目录初始化仓库
lo new "第一篇笔记"             # 添加一条资源
```

在仓库中注册本机 SSH 公钥（serve 的认证依赖已注册的密钥）：

```bash
ssh-keygen -t ed25519          # 若还没有密钥：~/.ssh/id_ed25519
lo auth add -k ~/.ssh/id_ed25519 -l "笔记本"
```

## 2. 启动 lo serve

在仓库目录启动 HTTP 服务（默认监听 `127.0.0.1:8765`）：

```bash
lo serve
```

如需更换端口：`lo serve --port 9000`。启动后，`http://127.0.0.1:8765` 即为本应用的默认仓库地址。

## 3. 安装并运行本应用

```bash
npm install
npm run dev     # 开发模式：Vite(5173) + Electron(HMR)
npm start       # 生产模式：先构建 renderer 再启动 Electron
```

## 4. 连接并登录

1. 保持上方「仓库地址」为 `http://127.0.0.1:8765`，点击「连接」。
2. 在「SSH 私钥路径」填入 `~/.ssh/id_ed25519`，点击「登录」。
3. 登录成功后自动刷新状态与资源列表。

## 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 登录失败「仓库未注册任何 SSH 公钥」 | serve 检测到无已注册公钥 | 在仓库执行 `lo auth add` |
| 连接失败 ECONNREFUSED | lo serve 未启动 | 检查端口与 serve 状态 |
| https 端口可用但证书自签 | 自签证书未受信任 | 换回 `http://127.0.0.1:8765` |