# ADR-004 · 插件服务（registerService / getService）

- **状态**：✅ 已实施
- **背景**：插件间需要能力共享（如状态服务），但禁止直接 require 彼此文件。
- **决策**：`ctx.extensions.registerService([{ id, title?, version?, api }])` 注册；
  其他插件经 `ctx.extensions.getService(id)` / `listServices()` 消费；提供者停用/禁用时
  服务从注册表清理；`getService` 为**同步**语义，提供者须已激活，消费方判空降级。
- **相关代码**：`apps/agent/src/main/plugin/extension-registry.cjs`、
  `apps/agent/src/main/plugin/plugin-manager.cjs`、`plugins/agent/packages/demo-hello`、
  `plugins/agent/packages/demo-consumer`。
- **验证**：跨插件服务测试 + E2E。
