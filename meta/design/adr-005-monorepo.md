# ADR-005 · Monorepo 统一（Turborepo + pnpm）

- **状态**：✅ 已实施（本次迁移）
- **背景**：原 8 个独立仓库靠 `file:` / sibling path / `moduleNameMapper` / `sdkResolver`
  跨仓库解析，脆弱且文档分散。
- **决策**：代码统一到 lo-monorepo（`packages/* apps/* plugins/* meta`），跨包依赖一律
  `workspace:*`；文档统一到 `meta/`（唯一 Source of Truth），展示层 `docs/`（VitePress）；
  原 8 仓库为只读历史档案（新 Git 历史，不合并）。迁移映射见 `meta/setup/migration.md`。
- **相关代码**：根 `package.json`、`pnpm-workspace.yaml`、`turbo.json`、`meta/`。
- **验证**：`pnpm test/lint/build/docs` 全绿；`meta/scripts/docs-check.cjs`。
