# 项目进度

> 文档基线：[`.baseline`](.baseline)。功能矩阵反映**当前代码**状态；更新本文件时同步更新基线。

## 功能矩阵

| 功能 | 状态 | 代码位置 | 验证方式 |
|---|---|---|---|
| 插件打包/分发（tar.gz + index.json + sha256） | ✅ 已实现 | `scripts/build.cjs` | `yarn run build` 冒烟（CI 无） |
| 打包内容规则（INCLUDE_ENTRIES 含 `ui`） | ✅ 已实现 | `scripts/build.cjs` L27-31 | build 输出包含 `ui/` |
| demo-hello：命令（含写操作示例） | ✅ 已实现 | `plugins/agent/packages/demo-hello/index.cjs` L47-69 | lo-agent E2E（`lo-agent` 测试） |
| demo-hello：视图（HTML 快照） | ✅ 已实现 | `plugins/agent/packages/demo-hello/index.cjs` L71-85 | lo-agent renderView 测试 |
| demo-hello：面板 / 编辑器 | ✅ 已实现 | `plugins/agent/packages/demo-hello/index.cjs` L88-105 | lo-agent renderPanel/Editor 测试 |
| demo-hello：服务提供（`status-service`） | ✅ 已实现 | `plugins/agent/packages/demo-hello/index.cjs` L107-118 | lo-agent 跨插件服务测试 |
| demo-hello：mountEl UI（isolated world） | ✅ 已实现 | `plugins/agent/packages/demo-hello/ui/index.mjs` | lo-agent getUiModule + 真实链路冒烟 |
| demo-hello：config 默认值 | ✅ 已实现 | `plugins/agent/packages/demo-hello/plugin.json` | ctx.config 测试 |
| demo-hello：写权限声明（operations.write） | ✅ 已实现 | `plugins/agent/packages/demo-hello/plugin.json` | lo-agent 权限测试 |
| demo-consumer：服务消费 + 优雅降级 | ✅ 已实现 | `plugins/agent/packages/demo-consumer/index.cjs` | lo-agent E2E |
| demo-consumer：dependsOn 依赖声明 | ✅ 已实现 | `plugins/agent/packages/demo-consumer/plugin.json` | lo-agent 拓扑激活测试 |
| 单元测试（本仓库内） | ❌ 未实现 | — | `package.json` 的 `test` 仅为 build 冒烟 |
| CI（GitHub Actions） | ❌ 未实现 | — | 无 `.github/workflows/` |
| 插件市场 / 更多正式插件 | ❌ 未来 | — | 生态总纲 Phase D 标注未来 |

## 里程碑

| commit | 内容 |
|---|---|
| `7694487` | 初始化 lo-agent 插件分发仓库（demo-hello + build 打包脚本） |
| `5b7b645` | demo-hello 注册状态服务（services 扩展点示例） |
| `5fd8a6b` | 新增 demo-consumer 插件（服务消费方闭环示例） |
| `c78e19f` | demo-consumer 声明 dependsOn demo-hello |
| `e231a57` | demo-hello 注册侧栏面板与笔记编辑器示例 |
| `b3c3be8` | demo-hello 渲染端 mountEl UI（isolated world 交互式面板） |

## 未实现 / 未来

- **本仓库单元测试**：当前 `test` 脚本仅触发 build；契约级测试位于 lo-agent（消费方）。
- **CI**：本仓库无 GitHub Actions；`docs:check` 可作后续 CI 步骤。
- **插件市场与正式插件**（如 epub 阅读器）：属 lo Core 侧插件系统，另见
  `lo-plugins` 仓库。
- **文档 prose 逐插件覆盖**：当前仅 demo-hello / demo-consumer 有深度说明；新增插件
  不强求 prose（目录由 manifest 自动生成）。

## 验证现状

- 构建：`yarn run build` 成功产出 `dist/<id>-<version>.tar.gz` + `index.json`。
- 文档系统：`npm run docs:check` 通过（含 dist 一致性校验）。
- 宿主侧闭环：lo-agent 测试（含真实 demo 插件 E2E、mountEl 真实链路冒烟）全绿。
