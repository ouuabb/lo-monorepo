# ADR-003 · 延迟激活（activationEvents）

- **状态**：✅ 已实施
- **背景**：避免启动时全量激活所有插件，按需激活。
- **决策**：`manifest.activationEvents` 仅 `onCommand/onView/onPanel/onEditor:<id>` 触发
  **懒激活**；`onStartup`/`*` 或未声明 → 启动激活；非法触发点（如 `onService:<id>`）
  manifest 校验报错。能力缺失时 `_activateForTrigger(prefix, id)` 激活后重试。
- **相关代码**：`apps/agent/src/main/plugin/plugin-manager.cjs`（`_isLazy`/`_activateForTrigger`/
  `_findOrTrigger`）。
- **验证**：plugin-manager 懒激活测试（onCommand/onView + dependsOn 强制）。
