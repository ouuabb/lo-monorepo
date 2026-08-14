# 环境复现与迁移溯源（setup）

> 本目录覆盖：从零复现 monorepo 工作区 / opencode 配置，以及原独立仓库 → monorepo 的迁移映射。

## 复现 monorepo 工作区

```bash
git clone git@github.com:ouuabb/lo-monorepo.git
cd lo-monorepo
pnpm install                # 一次安装全部 workspace（sqlite3/esbuild/electron 构建已审批）
pnpm test                   # turbo run test（全包）
pnpm lint
pnpm build                  # turbo run build
pnpm --filter lo-meta docs:build   # 文档站点
```

前置：Node ≥ 20（推荐 22）、pnpm ≥ 10。openode 全局配置见 [`opencode.md`](opencode.md)。

## 文档与站点

- 文档源：`meta/`（唯一 SoT）；展示壳：`docs/`（VitePress）。
- 本地预览：`pnpm --filter lo-meta docs:dev` → `http://localhost:5173/lo-monorepo/`。
- 线上：GitHub Pages（见 [`pages.md`](pages.md)）。

## opencode 配置

本机 opencode 全局配置（`~/.config/opencode/opencode.jsonc`）的 `instructions` 指向
`<workspace>/lo-monorepo/meta/AGENTS.md`；各模块 `opencode.json` references 指向
`ouuabb/lo-monorepo`。详见 [`opencode.md`](opencode.md)。

## 迁移溯源

原 8 个独立仓库 → monorepo 的映射见 [`migration.md`](migration.md)；旧仓库为只读历史档案。
