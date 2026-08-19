# AGENTS.md — lo monorepo 工作区入口

本文件是 **薄入口**。lo 生态唯一权威总纲见 **`meta/AGENTS.md`**
（含：契约铁律 §1、不可触犯边界 §12、开发流程 §3、测试 §4、文档 §5、审查 §6、陷阱 §7、
边界速查 §8、各模块速查 §2）。**开始任何改动前，先读总纲。**

## 本仓库定位

lo 生态**统一代码工作区**（Turborepo + pnpm）：
- `packages/core` = `@lo/core`（lo Core，世界模型 + 能力中心，CLI `lo`）
- `packages/client` = `@lo/client`（Core 协议客户端）
- `packages/plugins-sdk` = `@lo/plugins-sdk`（Core 插件契约）
- `packages/agent-plugins-sdk` = `@lo/agent-plugins-sdk`（客户端插件契约）
- `apps/agent` = lo-agent（Electron 桌面端 + 插件宿主）
- `plugins/core` = lo-plugins（Core 插件源码 + 分发）
- `plugins/agent` = lo-agent-plugins（客户端插件源码 + 分发）
- `meta` = **唯一正式文档 Source of Truth**（知识层）；`docs/` 为 VitePress 展示壳

## 铁律速记

- 插件只经 `ctx.lo` / `ctx.extensions` / `ctx.resources` 等契约门面访问能力；禁止裸 `repo`、
  `ctx.getRepository()`、插件内嵌 `@lo/client`、硬编码端口。
- lo Core 是唯一世界模型持有者；外部访问一律经 `@lo/client`。
- 依赖单向：Plugin → 契约 → Host Adapter → `@lo/client` → lo Core；跨包一律 `workspace:*`，
  **禁止 `file:` / sibling path / moduleNameMapper 跨仓库 hack**。
- SDK 不依赖宿主、不封装 `@lo/client`、不定义二次协议。
- 插件权限默认只读，写操作需显式声明于 `manifest.permissions.lo`。
- mountEl 插件 UI 在 isolated world 执行，只持 `ctx`，不可触达 `window.loAgent.loCore`。
- **没有用户明确指令，禁止使用任何 git 命令；使用任何 git 命令前必须先向用户确认。**

完整规范见 **`meta/AGENTS.md`**（§12 为不可触犯边界）。

## 常用命令

```bash
pnpm install          # 一次安装全部 workspace
pnpm build            # turbo run build
pnpm test             # turbo run test
pnpm lint             # turbo run lint
pnpm docs             # turbo run docs（meta 站点构建）
pnpm dev              # turbo run dev --parallel
```
