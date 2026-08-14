# ADR-006 · 文档系统 5 原则

- **状态**：✅ 已实施
- **决策**：文档管理遵循 5 原则——①来源导向（file:line + 核对基线）②生成式目录（机器事实由脚本生成）
  ③一致性校验（只验机器事实，不验语义）④分层不重复（meta 唯一 SoT，各包只留极简 README）
  ⑤进度如实（已实现/部分/未实现 + 代码位置 + 验证）。
- **相关代码**：`meta/doc-rules.md`、`meta/scripts/docs-gen.cjs`、`meta/scripts/docs-check.cjs`、
  `meta/AGENTS.md` §5。
- **例外**：`packages/core/docs/` 为 CLI 功能数据（`lo help/manual/docs` 读取），非正式文档源。
