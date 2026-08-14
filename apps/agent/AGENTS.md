# AGENTS.md — lo-agent

本文件是 **薄入口**。lo 生态唯一权威总纲已由 **opencode 全局配置自动加载**
（`~/.config/opencode/opencode.jsonc` → `instructions`）；工作区布局下亦可读
`../meta/AGENTS.md`。
（含：契约铁律 §1、不可触犯边界 §12、开发流程 §3、测试 §4、文档 §5、审查 §6、陷阱 §7、
边界速查 §8、各仓库速查 §2）。**开始任何改动前，先读总纲。**

## 本仓库定位

lo Agent 是 lo（lo Core）知识库的 **Electron 桌面端 + 客户端插件宿主**。通过 Electron
主进程 + `@lo/client`（本地 SDK）连接 lo 核心的 HTTP/SSH 协议：配置仓库地址、SSH 挑战-应答
登录、获取仓库状态与资源列表。

## 技术栈与安全基线

- 主进程/preload：CommonJS（`.cjs`）；渲染进程：React 19 + JSX + Vite。
- **安全基线**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；
  渲染进程不接触 Node API，一律经 preload 的 `contextBridge` 暴露受控接口。

## 常用命令

```bash
npm run dev     # 并行启动 Vite dev server（端口 5173）与 Electron（HMR）
npm run build   # Vite 构建渲染进程到 dist/
npm start       # 构建后启动 Electron 生产模式
npm test        # 单元测试（Jest，覆盖率默认开启；勿裸跑 npx jest）
npm run lint    # ESLint
npm run format  # Prettier
```

## 提交要点

- Conventional Commits（type 英文小写 + subject 中文）；husky `pre-commit` 跑测试。
- 不提交 `node_modules/`、`dist/`、`out/` 等生成目录。

## 完整细节

主进程 ↔ 核心（LoCoreService/ipc/config-store）、IPC 白名单铁律、插件宿主（服务/依赖/懒激活/
mountEl）、开发说明 → 见总纲 **§1.5b / §2.6**。
