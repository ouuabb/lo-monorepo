# ADR-002 · 插件依赖拓扑激活（dependsOn）

- **状态**：✅ 已实施
- **背景**：插件间存在提供者/消费者关系，需保证提供者先于消费者激活（尤其服务消费）。
- **决策**：`manifest.dependsOn` 声明依赖插件 ID；`activateAll` 按依赖拓扑排序（Kahn）；
  **硬依赖强制先激活被依赖方**（即使对方声明延迟激活）；循环依赖稳定兜底 + warn。
- **相关代码**：`apps/agent/src/main/plugin/activation-order.cjs`、
  `apps/agent/src/main/plugin/plugin-manager.cjs`（`_ensureDepsActivated`）。
- **验证**：`test/main/activation-order.test.cjs`、plugin-manager 拓扑测试。
