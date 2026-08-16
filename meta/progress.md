# 全局进度（progress）

> 核对基线：见 `meta/setup/.baseline`。功能矩阵反映**当前代码**状态；状态严格区分
> ✅已实现 / 🟡部分 / ❌未实现，并给出代码位置与验证依据。

## 功能矩阵（按模块）

### packages/core（@lo/core）
| 功能 | 状态 | 代码位置 | 验证 |
|---|---|---|---|
| 世界模型（Resource/Relation/Operation/Event/Workflow） | ✅ | `src/repo/`、`src/operations/`、`src/event/` | `test/repo/`、`test/operations/` 等（282 suites） |
| CLI（`lo` 40+ 子命令） | ✅ | `src/cli.cjs`、`src/commands/` | `test/commands/` |
| HTTP 服务（`lo serve`，8765） | ✅ | `src/commands/serve.cjs` | `test/commands/protocolHttp.test.cjs` 等 |
| 插件系统（PluginContext facade + 分发） | ✅ | `src/plugin/` | `test/plugin/` |
| 工作流 / 自动化 / Agent / AI / 协作 / 安全 / 演化 | ✅ | `src/workflow/` `src/automation/` `src/agent/` `src/ai/` `src/collaboration/` `src/security/` `src/evolution/` | 对应 `test/` |
| Usage 层（S0–U4 闭环）：Mode/Viewer 注册表 + 解析、插件贡献（annotating/metadata/viewer.epub-reader）、epub 命令域 | ✅ | `src/repo/{modeRegistry,viewerRegistry,usageResolver}.cjs`、`src/repo/repository.cjs`、migrations/001（62 表基线） | `test/repo/{usageResolver,modeRegistration}.test.cjs`、`test/commands/modesHttp.test.cjs` |
| sdkResolver（旧跨仓库 hook） | ❌ 已移除（monorepo workspace 取代） | — | — |

### packages/client（@lo/client）
| 功能 | 状态 | 代码位置 | 验证 |
|---|---|---|---|
| HTTP 客户端 + 命名空间（notes/search/schemas/views/workflows/automations/evolution/admin/sync/health/relations/operations/events/modes/viewers） | ✅ | `src/client.cjs` | `test/client.test.cjs`（101） |
| SSH 挑战-应答认证 | ✅ | `src/auth.cjs` | `test/auth.test.cjs` |
| 错误模型（LoApiError/LoHttpError） | ✅ | `src/http.cjs` | `test/http.test.cjs` |

### packages/plugins-sdk（@lo/plugins-sdk）
| 功能 | 状态 | 代码位置 | 验证 |
|---|---|---|---|
| Plugin/PluginContext/ResourceProvider/Builder/EventApi/Logger 契约 | ✅ | `src/` | `test/`（sdk/edge） |

### packages/agent-plugins-sdk（@lo/agent-plugins-sdk）
| 功能 | 状态 | 代码位置 | 验证 |
|---|---|---|---|
| AgentPlugin/AgentPluginContext/lo-facade/extensions-facade/manifest/lifecycle/事件/日志 | ✅ | `src/` | `test/`（契约测试） |
| manifest 校验 + manifestSchema | ✅ | `src/manifest.cjs` | `test/validateManifest.test.cjs` |
| Usage Viewer 扩展点（contributes.viewers / ctx.extensions.registerViewer） | ✅ | `src/manifest.cjs`、`src/extensions-facade.cjs` | `test/validateManifest.test.cjs`、`test/extensions-facade.test.cjs` |
| mountEl 渲染端契约（manifest.ui） | ✅ | `types/index.d.ts` | 契约测试 |

### apps/agent（lo-agent）
| 功能 | 状态 | 代码位置 | 验证 |
|---|---|---|---|
| 主进程↔Core（LoCoreService + IPC 白名单） | ✅ | `src/main/lo-core.cjs`、`src/main/ipc.cjs` | `test/main/` |
| 插件宿主（加载/生命周期/扩展点/服务/依赖/懒激活/mountEl） | ✅ | `src/main/plugin/` | `test/main/plugin-manager.test.cjs` 等 |
| Session 模型 + readOnly 迁移（U2）：openResource → modes.resolve → viewers.list → Session；viewer 渲染注册表 | ✅ | `src/renderer/src/services/SessionService.mjs`、`viewerRegistry.js`、`App.jsx` | `test/renderer/sessionService.test.cjs`（9） |
| 插件 Usage Viewer 渲染桥（U3：render-viewer 快照 + 注册表合并） | ✅ | `src/main/plugin/{plugin-manager,plugin-ipc,extension-registry}.cjs`、`src/preload/index.cjs`、`src/renderer/src/services/viewerRegistry.js` | `test/main/`、`test/preload/` |
| mountEl UI（isolated world + G2） | ✅ | `src/preload/index.cjs`、`src/renderer/src/plugin/` | 真实链路冒烟 + `test/preload/` |
| renderer 挂载层自动化测试（jsdom） | ❌ 未实现 | — | 靠真实链路冒烟 + 手动 |
| 插件市场（marketplace） | ❌ 未来 | — | 生态 Phase D |

### plugins/core（lo-plugins）与 plugins/agent（lo-agent-plugins）
| 功能 | 状态 | 代码位置 | 验证 |
|---|---|---|---|
| 插件源码 + 分发（build.cjs → tar.gz + index.json） | ✅ | `scripts/build.cjs` | `pnpm --filter lo-plugins test` / build 冒烟 |
| 插件目录（机器生成） | ✅ | `meta/plugins/core.md` / `meta/plugins/agent.md` | `docs-check` 生成幂等 |

## 未实现 / 未来

- **lo-agent renderer 挂载层自动化测试**（jsdom）：当前依赖真实链路冒烟 + 手动验证。
- **插件市场（marketplace）**：生态 Phase D 标注未来；当前仅 registry（index.json）安装。
- **多客户端形态 / Sandbox / Agent 多进程**：总纲 §9 明确不提前设计。

## 验证现状

- `pnpm test` 全绿（core 282 suites/3745、client 101、plugins-sdk 134、agent-plugins-sdk 94、agent 226、plugins 213 等）。
- `pnpm lint` 通过；`pnpm --filter lo-meta docs:build` 构建站点；`check` 校验通过（含 core/docs 镜像一致性）。
- 文档同步：改 `meta/core/` 后运行 `pnpm --filter lo-meta docs:sync` 推送 CLI 运行数据镜像。
