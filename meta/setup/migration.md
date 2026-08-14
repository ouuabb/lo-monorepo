# 迁移映射：原独立仓库 → monorepo

lo 生态于 2026-08 由 8 个独立仓库统一迁移到 **lo-monorepo**（Turborepo + pnpm）。
原仓库**保留完整 Git 历史**，作为只读历史档案（archive / read-only），不删除、不参与未来开发。

## 映射表

| 原仓库（GitHub） | monorepo 路径 | 包名 | 迁移时间 |
|---|---|---|---|
| `ouuabb/lo` | `packages/core` | `@lo/core`（CLI `lo`） | 2026-08 |
| `ouuabb/lo-client-sdk` | `packages/client` | `@lo/client` | 2026-08 |
| `ouuabb/lo-plugins-sdk` | `packages/plugins-sdk` | `@lo/plugins-sdk` | 2026-08 |
| `ouuabb/lo-agent-plugins-sdk` | `packages/agent-plugins-sdk` | `@lo/agent-plugins-sdk` | 2026-08 |
| `ouuabb/lo-agent` | `apps/agent` | `lo-agent` | 2026-08 |
| `ouuabb/lo-plugins` | `plugins/core` | `lo-plugins` | 2026-08 |
| `ouuabb/lo-agent-plugins` | `plugins/agent` | `lo-agent-plugins` | 2026-08 |
| `ouuabb/lo-meta` | `meta/` + `docs/` | `lo-meta` | 2026-08 |

## 迁移要点（历史溯源）

- **新 monorepo 为新 Git 历史**；不做 git-filter-repo / subtree 历史合并。
- 代码迁移为普通复制 + 结构调整（见 §各模块）。跨包依赖统一为 `workspace:*`，
  删除 `file:` / sibling path / `moduleNameMapper` / `sdkResolver` 跨仓库 hack。
- 正式文档统一迁入 `meta/`（唯一 SoT）；各代码包不再维护独立文档体系。
- 原仓库冻结 → archive / read-only；历史查询走原仓库。

## 复核

若某模块在 monorepo 内与映射不符（路径/包名），以代码为准并回报。
