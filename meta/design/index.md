# 设计决策（Design / ADR）

本目录记录 lo 生态的关键设计决策（Architecture Decision Records）。每条注明状态、背景与结论。

## 决策清单

| ADR | 标题 | 状态 |
|---|---|---|
| 001 | **mountEl UI（G2 访问隔离）**：插件 UI 在渲染进程 isolated world 执行，技术上不可触达 `window.loAgent.loCore`；无 iframe/WebView/自定义协议/postMessage；`ctx` 唯一能力入口，经 `agent-plugins:ctx` 代理到主进程 `context.lo` facade 裁决。**G2 只保证 JS 上下文隔离，不保证 DOM 内容隔离**。 | ✅ 已实施 |
| 002 | **插件依赖拓扑激活**：`manifest.dependsOn` 提供者先于消费者激活；硬依赖强制先激活被依赖方；循环依赖稳定兜底 + warn。 | ✅ 已实施 |
| 003 | **延迟激活**：`manifest.activationEvents` 仅 `onCommand/onView/onPanel/onEditor:<id>` 触发懒激活；`onStartup`/`*` 或未声明 → 启动激活。 | ✅ 已实施 |
| 004 | **插件服务**：`registerService`/`getService`/`listServices` 插件间通信；`getService` 同步语义，提供者须已激活，消费判空降级。 | ✅ 已实施 |
| 005 | **Monorepo 统一**：代码统一到 lo-monorepo（Turborepo + pnpm），跨包 `workspace:*`；文档统一到 `meta/`（唯一 SoT）；展示层 `docs/`（VitePress）。原 8 仓库为只读历史档案。 | ✅ 本次迁移 |
| 006 | **文档系统 5 原则**：来源导向 / 生成式目录 / 一致性校验 / 分层不重复 / 进度如实。 | ✅ 已实施 |
| 007 | **图片候选上传/插入闭环**：上传只建 Image Resource（不动 Markdown、不建 embed），用户主动插入才经 `insertImage` 在光标处写 `![alt](res_xxx)`、保存后建 embed；renderer 用 Uint8Array/Blob URL 不依赖 Node Buffer；Viewer 下拉切换。 | ✅ 已实施（dc5f45a + ecd9408） |

## 记录格式建议

新增决策时：标题 + 背景（问题/约束）+ 选项对比 + 结论 + 状态 + 相关代码位置。

## 关键约束（写代码前对照）

- G2 安全模型（ADR-001）是最强边界：插件 UI 不可触达 `window.loAgent.loCore`。
- 权限最小化：写操作必须显式声明于 `manifest.permissions.lo`。
- 跨包依赖一律 `workspace:*`，禁止跨目录 hack。
