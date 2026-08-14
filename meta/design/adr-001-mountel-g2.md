# ADR-001 · mountEl UI（G2 访问隔离）

- **状态**：✅ 已实施
- **背景**：插件 UI 需要交互式挂载，但须保证插件**技术上不可触达** `window.loAgent.loCore`；
  同 world 无法移除 contextBridge 暴露（深冻结），「同 world 信任边界文档化」被判定为约束降级、否决。
- **决策**：插件 `manifest.ui`（自包含 ESM）在渲染进程 **isolated world** 执行；
  **无 iframe / WebView / 自定义协议（lo-plugin://）/ postMessage**；worldId 由 Host 分配
  （`PluginManager.getUiWorldId`）；`ctx` 是唯一能力入口；
  `ctx.lo → agent-plugins:ctx → 主进程 context.lo facade 裁决 → @lo/client → lo Core`。
- **边界**：G2 只保证 JS 上下文隔离，**不保证 DOM 内容隔离**（共享 document）；插件 UI
  拒绝远程 `import()`；dispose 在 world 内执行；Blob URL import 后 revoke；不修改 `@lo/client`。
- **相关代码**：`apps/agent/src/preload/index.cjs`、`apps/agent/src/renderer/src/plugin/`、
  `apps/agent/src/main/plugin/plugin-manager.cjs`、`plugins/agent/packages/demo-hello/ui/index.mjs`。
- **验证**：真实链路冒烟（getUi→mount→render→ctx.lo→dispose）+ 总纲 §12.3。
