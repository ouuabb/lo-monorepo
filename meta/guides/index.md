# 开发指南（Guides）

## 快速开始

```bash
git clone git@github.com:ouuabb/lo-monorepo.git && cd lo-monorepo
pnpm install
pnpm test
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm test` | turbo run test（全包） |
| `pnpm --filter @lo/core test` | 只跑 core |
| `pnpm lint` / `pnpm build` | 全包 lint / build |
| `pnpm --filter lo-agent dev` | 启动 Electron 桌面端（dev） |
| `pnpm --filter lo-meta docs:dev` | 文档站点本地预览 |
| `pnpm --filter lo-meta docs:build` | 构建文档站点 |

## 开发指南

- **core**：插件系统改动读 `packages/core/src/plugin/` 文件头注释 + `specs/008/013`。
- **client**：新增资源在 `client.cjs` 建命名空间 + 补 `types/index.d.ts` + 测试；不加依赖。
- **agent**：主进程 `src/main`，渲染层经 `window.loAgent` 白名单；改 SDK 契约后
  workspace 即时生效（无需重装）。
- **插件（core/agent）**：只经 SDK facade；`build.cjs` 打包分发。
- **文档**：正式文档一律进 `meta/`（见 `doc-rules.md`）。

## 权限速查

- 插件默认只读；写操作需 `manifest.permissions.lo` 显式声明。
- `ctx.lo` 白名单由主进程 facade 裁决；未授权抛「被拒绝」。
