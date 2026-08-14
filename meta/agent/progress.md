# 项目进度

> 文档基线：[`.baseline`](.baseline)。功能矩阵反映**当前代码**状态；更新本文件时同步更新基线。

## 功能矩阵

| 功能 | 状态 | 代码位置 | 验证方式 |
|---|---|---|---|
| LoCoreService（configure/login/getStatus/listNotes/getNote/updateNote/relations/operations/events） | ✅ 已实现 | `src/main/lo-core.cjs` | `test/main/lo-core.test.cjs` |
| 配置持久化（userData/lo-agent.json） | ✅ 已实现 | `src/main/config-store.cjs` | `test/main/config-store.test.cjs` |
| lo-core:* 白名单 IPC | ✅ 已实现 | `src/main/ipc.cjs` | `test/main/ipc.test.cjs` |
| 插件发现/加载/校验（manifest + createPlugin） | ✅ 已实现 | `src/main/plugin/plugin-loader.cjs` | `test/main/plugin-loader.test.cjs` |
| 插件生命周期（activate/dependsOn 拓扑/懒激活） | ✅ 已实现 | `src/main/plugin/plugin-manager.cjs`、`activation-order.cjs` | `test/main/plugin-manager.test.cjs`、`activation-order.test.cjs` |
| 扩展点注册表（commands/views/panels/editors/services） | ✅ 已实现 | `src/main/plugin/extension-registry.cjs` | `test/main/extension-registry.test.cjs` |
| ctx.lo Host Adapter（权限白名单 → @lo/client） | ✅ 已实现 | `src/main/plugin/lo-adapter.cjs` | 权限测试（plugin-manager） |
| 插件安装（fetch/checksum/解压） | ✅ 已实现 | `src/main/plugin/plugin-installer.cjs` | `test/main/plugin-installer.test.cjs` |
| 插件配置/私有设置持久化 | ✅ 已实现 | `src/main/plugin/plugin-store.cjs` | `test/main/plugin-store.test.cjs` |
| 插件能力白名单 IPC（agent-plugins:*） | ✅ 已实现 | `src/main/plugin/plugin-ipc.cjs` | `test/main/plugin-ipc.test.cjs` |
| mountEl UI（isolated world，ctx 经 agent-plugins:ctx） | ✅ 已实现 | `src/preload/index.cjs`、`src/renderer/src/plugin/` | 真实链路冒烟 + `test/preload/index.test.cjs` |
| 渲染进程插件面板（命令/视图/面板/编辑器/管理/服务） | ✅ 已实现 | `src/renderer/src/App.jsx` | 手动（应用内） |
| 应用内用户文档查看器 | ✅ 已实现 | `src/renderer/src/docs/` | `test/renderer/docs-nav.test.cjs` |
| renderer 挂载层自动化测试（jsdom） | ❌ 未实现 | — | 目前靠真实链路冒烟 + 手动 |
| 插件市场（marketplace） | ❌ 未来 | — | 生态 Phase D，spec 标注未来 |

## 里程碑

| commit | 内容 |
|---|---|
| （基线 `2a5a125` 之前） | 主进程↔核心、IPC 白名单、插件宿主各模块、mountEl UI、管理面板等 |
| `2a5a125` | （含 AGENTS 薄入口 + opencode references 等近期文档收敛） |

> 详细提交历史见 `git log`。功能矩阵为当前代码状态的如实快照。

## 未实现 / 未来

- **renderer 挂载层自动化测试**：当前渲染进程交互依赖真实链路冒烟 + 手动验证，
  未引入 jsdom 测试基建（与生态「不为单一功能大规模引入 renderer 测试基建」一致）。
- **插件市场（marketplace）**：生态 Phase D 标注未来，当前仅支持 registry（index.json）安装。
- **其他客户端形态**：当前为 Electron 单窗口；多窗口/WebView 等不在当前范围。

## 验证现状

- `npm test` 全绿（13 suites / 180+ 用例）。
- `npm run lint` 干净；`npm run build`（Vite）成功。
- 真实链路冒烟（Electron 窗口 + 真实 preload + 真实 demo 插件）：getUi → mount → render →
  ctx.lo 往返 → dispose 全链路通过。
- `npm run docs:check` 通过（含 IPC 白名单一致性）。
