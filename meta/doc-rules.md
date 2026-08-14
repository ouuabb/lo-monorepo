# 文档系统规则（doc-rules）

> lo 生态文档管理遵循 5 原则，确保文档**如实反映代码**。本文件是文档系统的规则层。

## 原则

1. **来源导向**：每个结论可回溯到 `file:line` + 契约文档链接；文档头部标注
   「核对基线 commit/日期」（`meta/setup/.baseline` 或迁移映射）。
2. **生成式目录**：机器事实（如插件清单、IPC 通道）由脚本从代码/manifest 生成，
   杜绝手写漂移；人工只写 prose。
3. **一致性校验**：`pnpm --filter lo-meta check` 校验机器可确定事实（必需文件、
   引用路径存在、生成结果幂等），**不校验语义**。
4. **分层不重复**：`meta/` 是唯一文档源；各代码包只保留极简 README/description/注释；
   不重复本总纲与规格，只引用。
   - **例外**：`packages/core/docs/` 是 CLI 功能数据（`lo help/manual/docs/docs-serve`
     命令读取的命令参考 Markdown），属运行功能，不属正式文档源。
5. **进度如实**：功能/能力清单明确 **已实现/部分/未实现** + 代码位置 + 验证方式；
   未实现项显式写出。

## 文档源与展示层

- **内容源**：`meta/`（唯一 Source of Truth，知识组织层）。
- **展示层**：`docs/`（VitePress 壳，`srcDir → ../meta`；不存放独立 Markdown 内容）。
- **不建立第二套文档来源**：各 package/app/plugin 不维护独立 `docs/`、VitePress、
  docs generator / docs check。

## 更新方法

1. 改 `meta/` 源文档（内容重组，不机械复制旧仓库结构）。
2. `pnpm --filter lo-meta check` 一致性校验。
3. `pnpm --filter lo-meta docs:build` 构建站点验证。
4. 提交；若涉及公开契约变更，同步 `types/index.d.ts` 与相关模块 README。

## 历史与溯源

- 原 8 个独立仓库 → monorepo 的迁移映射（`旧仓库 → monorepo 路径 → 迁移时间`）
  见 [`setup/migration.md`](setup/migration.md)。
- 旧仓库为只读历史档案，不作为文档源。
