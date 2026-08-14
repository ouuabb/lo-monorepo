# lo-agent

lo（lo Core）知识库的 **Electron 桌面端 + 客户端插件宿主**。

- **App**：经主进程 `LoCoreService` + `@lo/client` 连接 lo Core（HTTP/SSH）。
- **插件宿主**：加载 `{userData}/plugins/` 下客户端插件（命令/视图/面板/编辑器/服务 + mountEl UI）。

```
renderer → window.loAgent（preload 白名单）→ 主进程 → @lo/client → lo Core
Plugin → ctx.lo(契约) → Host Adapter → @lo/client → lo Core
```

## 常用命令

```bash
pnpm --filter lo-agent dev        # Vite(5173) + Electron HMR
pnpm --filter lo-agent build      # Vite 构建到 dist/
pnpm --filter lo-agent start      # 构建后启动
pnpm --filter lo-agent test       # Jest（勿裸跑 npx jest）
```

## 文档

正式架构/契约文档统一在 **lo 生态文档中心**（唯一 Source of Truth）：

- 架构：`meta/architecture/agent.md`
- IPC 通道目录：`meta/api/ipc-channels.md`（自动生成）
- 总纲/边界：`meta/AGENTS.md`（§1.5b / §2.6 / §12）

## 开发规范

见 [`AGENTS.md`](AGENTS.md)（薄入口）与生态总纲 `meta/AGENTS.md`。
