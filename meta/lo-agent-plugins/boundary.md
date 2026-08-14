# 边界与铁律

> 文档基线：[`.baseline`](.baseline)。契约口径最终以 **SDK `docs/manifest-spec.md`** 与
> **生态总纲 `docs/ecosystem/AGENTS.md`** 为准，本文件只陈述本仓库相关的边界。

## 1. 契约收敛（插件必须遵守）

- 插件代码**只 `require('@lo/agent-plugins-sdk')`**，禁止 require lo-agent 内部文件、
  `@lo/client` 或裸拼 HTTP。
- 访问 Core **只经 `ctx.lo`**（Host Adapter 注入的契约门面），禁止触碰
  `LoClient` 原始实例 / 传输层。
- manifest 必填 `id/name/version/main`；`id` 用 kebab-case；`version` 用 x.y.z。
- 主进程入口为 CJS（`index.cjs`）；渲染端入口为**单文件自包含 ESM**（`ui/index.mjs`，
  不 import 任何包，宿主在 isolated world 中以 `import(blob:)` 加载）。

## 2. 权限边界

- 插件默认只读；写操作（`operations.write` 等）必须显式声明于
  `manifest.permissions.lo`（demo-hello 的 `demo-hello.touch` 即此示例）。
- `ctx.lo` 按 `permissions.lo` 白名单过滤，未授权调用抛「被拒绝」——过滤由 lo-agent
  主进程的 `context.lo` facade 执行（Phase B），本仓库插件**不做**任何权限判断。
- 服务消费：`getService` 为同步语义，提供者需已激活；消费方必须对 `null` 判空降级。

## 3. 渲染安全（mountEl / G2）

- 声明 `ui` 的插件 UI 运行在渲染进程 **isolated world**，与 App 主 world **JS 上下文隔离**：
  插件 UI **不可访问** `window.loAgent.loCore` / App 内部对象；`ctx` 是唯一能力入口。
- **G2 只保证 JS 执行上下文隔离，不保证 DOM 内容隔离**——插件 UI 与 App 共享同一
  document，可读取页面 DOM。
- 插件 UI 拒绝远程 `import()`；worldId 由宿主统一分配，插件不得自行指定。
- 未声明 `ui` 的插件走 HTML 快照渲染（主进程 `render(context, ctx) → string`），无交互。

## 4. 依赖与激活

- `dependsOn` 声明硬依赖，宿主按依赖拓扑激活（提供者先激活）；被依赖方即使声明延迟
  激活也会被强制先激活。
- `activationEvents` 仅含 `onCommand/onView/onPanel/onEditor:<id>` 时插件延迟激活；
  `onStartup`/`*` 或未声明 → 启动激活。

## 5. 发布纪律

- **不提交** `dist/`、`node_modules/`、`coverage/`（见 `.gitignore`）；`dist/` 由
  `yarn run build` 生成，属发布产物。
- 版本：semver；改插件后 bump `plugin.json` 的 version → 重建 → 重传 dist
  （`index.json` 的 checksum 会随之更新）。
- 插件 id 全仓唯一；manifest 与目录名一致（`docs:check` 强制）。

## 6. 文档系统边界

- 机器事实（插件目录）由 `scripts/docs-gen.cjs` 生成，人工**不手改**
  `docs/plugins/index.md`。
- 人工文档（architecture/boundary/progress 等）负责语义解释；`docs:check` 只校验
  机器可确定的事实（manifest 格式、id 唯一、生成幂等、orphan 文档、引用路径、dist 一致），
  **不校验语义陈述**。
- 本仓库文档不重复生态契约文档（SDK `manifest-spec.md`、生态总纲），只引用。
