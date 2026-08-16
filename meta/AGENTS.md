# AGENTS.md — lo 生态总纲（唯一权威）

本文件是 **lo 生态唯一正式文档 Source of Truth** 的核心：全生态统一规范、契约铁律与
不可触犯边界。它**完全自包含、不依赖任何本地目录名/绝对路径/外部文档**。

- **来源**：由原独立仓库时代的生态总纲 + 各仓库规范合并重组而成，**不删任何一点**。
- **位置**：`meta/AGENTS.md`（lo-monorepo `meta/` 知识层）；工作区根 `AGENTS.md`、
  各模块 `AGENTS.md` 均为薄入口，指向本文件。
- **契约以真实代码为准**：文档与代码冲突时，以代码为准并回报。
- **不可触犯边界**：见 **§12**，改动前必读。

---

## 0. 生态地图：Monorepo 结构

lo 生态统一为 **一个代码工作区（Turborepo + pnpm）+ 一个文档源（meta）+ 一个站点入口（docs）**。

```
lo-monorepo/
├── packages/
│   ├── core/                  @lo/core —— lo Core（世界模型 + 能力中心，CLI `lo` / `lo serve`，端口 8765）
│   ├── client/                @lo/client —— Core 协议客户端（所有外部消费者统一通道）
│   ├── plugins-sdk/           @lo/plugins-sdk —— Core 插件开发契约（进程内）
│   └── agent-plugins-sdk/     @lo/agent-plugins-sdk —— 客户端插件开发契约（lo-agent 内）
├── apps/
│   └── agent/                 lo-agent —— Electron 桌面端 + 客户端插件宿主
├── plugins/
│   ├── core/                  lo-plugins —— Core 插件源码 + 分发（内层 packages/<plugin>/ 为分发单元）
│   └── agent/                 lo-agent-plugins —— 客户端插件源码 + 分发
├── meta/                      唯一正式文档 Source of Truth（本总纲 + 架构/specs/setup/guides/api/design）
├── docs/                      VitePress 展示壳（srcDir → ../meta）
├── pnpm-workspace.yaml / turbo.json / package.json
```

**分层图（不可破坏）**：

```
                        lo Core（世界模型 / Resource / Relation / Operation / Workflow）
                                  ▲
                                  │ HTTP（lo serve，默认 127.0.0.1:8765）
                         @lo/client（packages/client）
                                  ▲
                ┌─────────────────┼──────────────────┐
                │                                     │
           lo-agent（apps/agent）                其他客户端（未来）
                │
        @lo/agent-plugins-sdk（packages/agent-plugins-sdk）
                ▼
          Agent Plugin（plugins/agent，扩展客户端交互）

lo Core 进程内：@lo/plugins-sdk（packages/plugins-sdk）──► Core Plugin（plugins/core）
```

**关键定位区分（永不混淆）**：
- `@lo/client` = **通信能力层**；`@lo/agent-plugins-sdk` = **客户端扩展契约层**；
  两者不合并、不互相包含。
- 跨包依赖一律 `workspace:*`；**禁止** `file:` / sibling path / moduleNameMapper /
  sdkResolver 等跨目录 hack。

---

## 1. 契约铁律（Contract Rules）—— 违反即破坏

### 1.1 世界模型唯一性
- **lo Core 是唯一世界模型持有者**。Resource / Relation / Operation / Event / Workflow
  只由 Core 定义与落库。
- 任何其他包**不得**自行维护业务模型副本、绕过 Core 直接读写仓库数据。

### 1.2 访问路径唯一
- 外部消费者访问 Core 一律经 **`@lo/client`（HTTP 协议）**。
- **禁止**：直接 require lo Core 内部文件、绕过 SDK 裸拼 HTTP、插件内嵌 `@lo/client`。
- 插件访问 Core 只允许经 **`ctx.lo`**（契约门面），禁止触碰 `LoClient` 原始实例 /
  HTTP 传输层 / Core 内部对象。

### 1.3 插件三层契约（Core Plugin 收敛）
- lo Core 插件只经 `PluginContext` facade：`ctx.resources / ctx.relations / ctx.config /
  ctx.repoPath / ctx.logger`。
- **禁止**：`ctx.getRepository()`、裸 `repo`、`resourceService`/`relationService` 直连、
  硬编码端口（阅读器端口须经配置下发）。
- 命令行插件命令 handler 签名：`async run(args, ctx)`。

### 1.4 SDK 边界
- **SDK 不依赖宿主**（无反向依赖）；**SDK 不封装 `@lo/client`**；**SDK 不定义二次协议**。
- SDK 只定义契约（方法白名单 + noop 默认），实现由宿主注入。
- 新公开 API 必须同步 `types/index.d.ts`、README、meta 文档、测试。

### 1.5 依赖方向（单向）
```
Plugin → ctx.lo（契约）→ Host Adapter（实现）→ @lo/client → lo Core
Plugin → ctx.extensions（契约）→ Host ExtensionRegistry（实现）→ 命令执行 Runtime
```
- 插件只从自己的 SDK `require`，永不 require 宿主内部文件。
- 跨包依赖走 workspace；渲染进程不接触 Node/网络，一律经 preload 白名单 IPC。

### 1.5b IPC 白名单铁律（lo-agent）
- **渲染进程 → 主进程只能经 preload 白名单通道**（`window.loAgent.*` →
  `ipcRenderer.invoke(白名单通道)`），通道逐一绑定主进程具体方法。
- **禁止**：透传任意调用/处理函数/`PluginManager`/`@lo/client` 原始实例。
- 插件能力接入 UI 只新增 `agent-plugins:*` 具体方法通道（`agent-plugins:ctx`、
  `agent-plugins:get-ui-module` 等），不建 `runtime:*` 协议套件。
- **插件 UI（mountEl）**：`manifest.ui` 模块在渲染进程 **isolated world** 执行，
  **不可访问** `window.loAgent.loCore` / App 内部对象；只持 `ctx`；worldId 由 Host 分配。

### 1.6 权限模型（最小权限）
- 插件默认**只读**；写操作必须显式声明于 `manifest.permissions.lo`。
- `ctx.lo` 门面按白名单过滤，未授权调用抛错；权限在激活期由宿主经
  `resolvePermissions(manifest.permissions)` 解析。

---

## 2. 各模块速查（技术栈与命令）

### 2.1 通用约束
- **JavaScript CommonJS（`.cjs`）**；无 TS 源码（仅 `types/index.d.ts` 声明）。
- Node >= 20；双空格、单引号、分号、100 列上限。
- 包管理器 **pnpm**（`pnpm install` 一次装全部）；任务编排 **Turborepo**
  （`pnpm build/test/lint/docs` → `turbo run ...`）。
- 不修改生成目录（`node_modules/`、`dist/`、`coverage/`、`.repo/`、`out/`）。
- 提交：Conventional Commits（type 英文小写 + subject 中文或英文，header ≤ 72；机器约束以 commitlint 为准，subject 语言建议中文，历史以英文为主——两语言均可接受）；husky 根钩子。

### 2.2 packages/core（@lo/core）
- 命令：`pnpm --filter @lo/core start/test/lint/format`；`npm test` 等价（3638+ 用例）。
- 结构：`src/cli.cjs`（CLI + 插件分发）、`src/repo/`（世界模型，SQLite）、`src/plugin/`
  （插件系统 + PluginContext facade）、`src/operations/`、`src/event/`、`src/workflow/`、
  `src/automation/`、`src/agent/`、`src/collaboration/`、`src/security/`、
  `src/evolution/`、`src/runtime/`、`src/commands/serve.cjs`（HTTP 8765）、
  `src/repo/{modeRegistry,viewerRegistry,usageResolver}.cjs`（Usage 层：Mode/Viewer/Session）。
- 契约要点：插件命令分发注入 `PluginContext` facade，不注入裸 Repository；
  `getRepository()` 仅旧版兼容、**新代码禁用**；写操作一律经 `operationEngine`。
- **`docs/` 为 CLI 功能数据**（`lo help/manual/docs/docs-serve` 读取的命令参考 Markdown），
  属运行功能、非正式文档源；正式文档一律在 `meta/`。

### 2.3 packages/client（@lo/client）
- 纯 CJS、**零运行时依赖**；API 返回 `res.body`；错误转 `LoApiError`/`LoHttpError`；
  命名空间：notes/search/schemas/views/workflows/automations/evolution/admin/relations/
  operations/events/health；**不加第三方依赖**。

### 2.4 packages/plugins-sdk（@lo/plugins-sdk）
- SDK 只定义契约（`Plugin` 基类、`PluginContext`、`ResourceBuilder`/`RelationBuilder`、
  `EventApi`、`Logger`）；`@lo/core` 为 optional peer（workspace）。

### 2.5 packages/agent-plugins-sdk（@lo/agent-plugins-sdk）
- 契约：`AgentPlugin`、`AgentPluginContext`（`ctx.lo`/`ctx.extensions`/`ctx.config`/
  `ctx.events`/`ctx.settings`）、`createLoFacade`/`LO_PERMISSION_MAP`、
  `createExtensionsFacade`、`validateManifest`/`manifestSchema`、`createPlugin`。
- 零运行时依赖；`@lo/client` 为 optional peer（workspace）；所有能力有 noop 默认。

### 2.6 apps/agent（lo-agent）
- Electron 主进程/preload/renderer；React 19 + Vite。
- 安全基线：`contextIsolation:true`、`nodeIntegration:false`、`sandbox:true`。
- 插件宿主：`PluginManager/Loader/LoAdapter/ExtensionRegistry/Installer/Store`；
  服务（registerService/getService）、依赖拓扑（dependsOn）、懒激活（activationEvents）、
  mountEl UI（isolated world）。
- 依赖：`@lo/client`、`@lo/agent-plugins-sdk` 为 `workspace:*`。

### 2.7 plugins/core（lo-plugins）
- Core 插件源码 + 分发（epub-reader/epub-library/chrome-translate）；`scripts/build.cjs`
  打 tar.gz + index.json；测试 mock SDK facade 形状；`@lo/plugins-sdk` 为 devDep。

### 2.8 plugins/agent（lo-agent-plugins）
- 客户端插件源码 + 分发（demo-hello/demo-consumer）；`scripts/build.cjs`；运行时由
  apps/agent 提供 SDK。

### 2.9 meta（唯一文档源）+ docs（展示壳）
- `meta/` 是唯一正式文档 Source of Truth（本总纲/architecture/specs/setup/guides/api/
  design/doc-rules）；各模块只保留极简 README/description/注释。
- `docs/` 仅 VitePress 壳（srcDir → ../meta）；`pnpm --filter lo-meta docs:build` 构建站点。

---

## 3. 开发流程（AI 必须遵守）

### 3.1 动手前
1. **定位模块**：改动涉及哪个 package/app/plugin？先读本总纲（meta/AGENTS.md）。
2. **摸清现状**：搜代码确认现状，不做无依据假设；契约以真实代码为准。

### 3.2 修改中
1. **遵守单一职责**：只改目标文件，不顺手重构无关代码。
2. **遵守边界**：见 §1 契约铁律与 §12 不可触犯边界。
3. **测试同步**：改逻辑必补/改测试；新公开 API 必补用例。
4. **文档同步**：按 §3.5 判定本次改动是否属公开契约/行为；是 → 修改中同步更新
   `meta/` 对应文档（唯一文档源）；否 → 明确无需动文档，提交时不用提及。

### 3.3 提交前（自查清单）
- [ ] **文档同步判定**：按 §3.5 判定。需更新 → 已改 `meta/` 源并跑通
      `pnpm --filter lo-meta check`；无需更新 → 此项跳过
- [ ] 相关包 `pnpm --filter <pkg> test` 全绿；跨包改动跑 `pnpm test`
- [ ] `pnpm lint` 无 error（warning 尽量清零）
- [ ] 已审查 `git status` / `git diff`：只暂存目标文件，未混入无关改动
- [ ] 提交信息 ≤72 字符、Conventional Commits（type 英文小写 + subject 中文或英文）
- [ ] 未误提交 `node_modules/`、`dist/`、`coverage/`、锁文件（除非有意）
- [ ] 未提交 secrets
- [ ] 未跨包混提（一个包一个 commit；跨包联动各自提交）

### 3.4 提交后
- push 前确认远程无冲突（`git fetch` + 状态检查）；push 成功后确认 CI 通过。
- 跨包联动（如 SDK 改契约 + 宿主消费）先推依赖方再推消费方（workspace 内即同步生效）。

### 3.5 文档更新判定（明确什么算"公开契约/行为"）
**必须更新 `meta/` 文档**（改代码前先定位对应文档）：
- 对外接口：CLI 命令/参数/输出、HTTP API、IPC 白名单通道、`@lo/client` 命名空间。
- 插件契约：manifest 字段、`ctx.*` 门面、权限模型、SDK 类型（`types/index.d.ts`）。
- 协议与配置：协议语义、配置项、端口、存储结构。
- 用户可感知的功能迁移：功能入口/位置/交互方式变化（如弹窗改为 tab、按钮迁移），
  需同步对应使用指南（如 `meta/guides/lo-agent-usage.md`）。

**明确无需更新**：
- 纯内部实现重构（外部行为不变）。
- UI 视觉样式/图标/文案（无功能语义变化）。
- 测试与 bug 修复（行为回到文档已描述状态）。

判定为"无需更新"时无需在提交中说明；判定为"必须更新"而遗漏属流程违规。

---

## 4. 测试全覆盖要求

- 新公开 API / 权限边界 / 命令与扩展点 / 跨平台路径 → 单测；CI 覆盖 ubuntu + windows。
- **lo-agent 必须用 `pnpm --filter lo-agent test`**（含 `--experimental-vm-modules`），
  勿裸跑 `npx jest`。
- Windows PowerShell 下 `&&` 不可用，用 `cmd1; if ($?) { cmd2 }`。

---

## 5. 文档管理

- **meta/ 是唯一正式文档 Source of Truth**；正式文档（总纲/架构/specs/API/指南/设计决策）
  一律进 `meta/`，不放在各代码包。
- 文档系统遵循 5 原则（见 `meta/doc-rules.md`）：来源导向 / 生成式目录 / 一致性校验 /
  分层不重复 / 进度如实。
- 更新流程：改 `meta/` 源 → `pnpm --filter lo-meta check`（一致性校验）→
  `pnpm --filter lo-meta docs:build`（站点）→ 提交。
- **CLI 运行数据镜像**：`packages/core/docs/` 是运行功能数据（`lo help/manual/docs/docs-serve`
  读取），内容必须与唯一正式源 `meta/core/` 一致——改 `meta/core/` 后运行
  `pnpm --filter lo-meta docs:sync`（幂等单向同步）；`docs-check` 强制两者一致，漂移即报错。
- 历史溯源：原独立仓库 → monorepo 的迁移映射见 `meta/setup/`。

---

## 6. 写完审查代码（Self-Review Checklist）

- [ ] **边界**：是否出现裸 `repo`、`ctx.getRepository()`、`@lo/client` 进插件、绕过 facade？
- [ ] **权限**：新写操作是否要求插件显式声明权限？默认只读是否保持？
- [ ] **单向依赖**：SDK 是否 require 了宿主？插件是否 require 了宿主内部？跨包是否走 workspace？
- [ ] **noop 契约**：SDK 新门面是否都有未注入时的安全默认？
- [ ] **错误处理**：异步是否有 catch？错误信息是否含足够上下文？
- [ ] **安全**：无 secrets、无任意 IPC 透传、renderer 不接触 Node。
- [ ] **可测性**：是否补了测试？测试是否覆盖拒绝/边界路径？

---

## 7. 常见陷阱速查

| 陷阱 | 后果 | 规避 |
|---|---|---|
| 插件内 `ctx.getRepository()` 或裸 `repo` | 破坏 facade 收敛 | 用 `ctx.resources/ctx.relations/ctx.config/ctx.repoPath` |
| 插件硬编码端口 | 配置不可下发 | 经 `ctx.config(...)` 下发 |
| SDK require 宿主 / 插件 require 宿主内部 | 反向依赖 | SDK 只定义契约，宿主注入实现 |
| 跨包用 `file:`/sibling path/moduleNameMapper | 破坏 monorepo 统一 | 一律 `workspace:*` |
| `ctx.lo` 全量透传不校验权限 | 越权 | `resolvePermissions` + `LO_PERMISSION_MAP` |
| lo-agent 裸跑 `npx jest` | ESM 测试失败 | 用 `pnpm --filter lo-agent test` |
| 提交信息 >72 字符 | commitlint 拒绝 | 精简 subject |
| 正式文档放代码包内 | 破坏「meta 唯一文档源」 | 全部进 `meta/` |
| 硬编码盘符路径 | Linux CI 失败 | 用 `__dirname`/`os.tmpdir()` |

---

## 8. 边界速查表

| 边界 | 允许 | 禁止 |
|---|---|---|
| 插件 → Core | 经 `ctx.lo`（契约门面） | 直接 require `@lo/client` / 直接 HTTP / `ctx.getRepository()` |
| 插件 → 宿主 | 经 `ctx.extensions` / `ctx.events` / `ctx.config` / `ctx.settings` | require 宿主内部文件 |
| 插件 ↔ 插件 | 经事件总线 / 共享 service | 直接 require 彼此文件 |
| 外部消费者 → Core | 经 `@lo/client` | 拼裸 HTTP / 直接读仓库数据 |
| lo-agent renderer → main | 经 preload 白名单通道 | 透传任意调用/实例 / 接触 Node·网络 API |
| 插件 UI 能力 | 经 `agent-plugins:ctx`（代理到 `context.lo` facade） | 访问 `window.loAgent.loCore` |

---

## 9. 版本节奏（不提前设计）

当前为**契约建立期**：Core 能力稳定 > client-sdk 协议稳定 > lo-agent 基础客户端完善 >
Plugin 生态完善。**不提前设计**：Agent Runtime、Agent Plugin Runtime、Sandbox、
Agent 多进程；涉及需先确认不在冻结范围再动。

---

## 10. 协议概念速查

| 概念 | 含义 | 对应代码 |
|---|---|---|
| Operation 语义 | 可追踪事实：`type+params+context(actor)` | `packages/core/src/operations/` |
| Event 语义 | 领域事实广播（`resource.created`） | `packages/core/src/event/` |
| Mode 语义 | 资源使用方式（`rules.writable/interactive`）；builtin=editing/reading/preview | `packages/core/src/repo/modeRegistry.cjs` + `usageResolver.cjs` |
| Viewer 语义 | 单资源处理/呈现入口；`supports.modes` 双向解耦，无 Mode→Viewer 映射表 | `packages/core/src/repo/viewerRegistry.cjs` |
| Session 语义 | 一次使用实例（纯运行时，不落库）；`state.readOnly = !rules.writable \|\| overrides` | `apps/agent` renderer `SessionService.mjs` |
| PluginContext facade | Core 插件的受限能力面 | `packages/core/src/plugin/pluginContext.cjs` |
| ctx.lo 门面 | 客户端插件经 `@lo/client` 访问 Core 的白名单契约 | `packages/agent-plugins-sdk` + `apps/agent` lo-adapter |
| 最小权限 | 插件默认只读，写需声明 | `manifest.permissions.lo`；`resolvePermissions` |
| mountEl UI | 插件渲染端 UI，isolated world 挂载真实 DOM | `manifest.ui`；`agent-plugins:ctx`；preload `pluginUi` |

> 若发现某概念与真实代码不符，以代码为准，并回报差异。

---

## 11. 快速开始（AI 首次进入）

1. 读本文件（已完成）。
2. `pnpm install` → `pnpm test` 验证环境。
3. 定位目标模块（§0/§2）→ 按 §3 流程实施 → §4/§5 补测试与文档 → §6 自查 → §7 避坑 → 提交。

---

## 12. 不可触犯边界（7 类）

### 12.1 生态契约铁律
- 插件只经契约门面访问能力；禁止裸 `repo`/`ctx.getRepository()`/插件内嵌 `@lo/client`/硬编码端口。
- lo Core 唯一世界模型；外部访问一律经 `@lo/client`；依赖单向；SDK 不依赖宿主/不封装/不定义二次协议；
  权限默认只读。

### 12.2 IPC 白名单铁律
- renderer→main 只能经 preload 白名单通道；禁止透传任意调用/处理函数/宿主实例；
  新能力只加 `agent-plugins:*` 具体方法通道。

### 12.3 mountEl / G2 安全模型（最高优先）
- **G2 而非 G1**：插件 UI **技术上不可触达** `window.loAgent.loCore`；「同 world 信任边界文档化」
  是约束降级，已被否决。
- **无 iframe / WebView / 自定义协议 / postMessage**；插件 UI 在渲染进程 isolated world 执行，
  worldId 由 Host 分配；`ctx` 唯一能力入口；
  `ctx.lo → agent-plugins:ctx → 主进程 context.lo facade → @lo/client → lo Core`。
- G2 只保证 JS 上下文隔离，不保证 DOM 内容隔离；插件 UI 拒绝远程 `import()`；
  dispose 在 world 内执行；Blob URL import 后 revoke；不修改 `@lo/client`。

### 12.4 生命周期收敛
- `dependsOn` 拓扑激活（硬依赖强制先激活被依赖方）；`activationEvents` 懒激活
  （仅 onCommand/onView/onPanel/onEditor）；服务 `getService` 同步语义、消费判空降级。

### 12.5 流程纪律
- 先推依赖方再推消费方；改架构边界先停下审计；Conventional Commits；不提交生成目录与 secrets；
  插件 id kebab-case 且与目录名一致。

### 12.6 文档系统收敛
- **meta/ 是唯一正式文档 Source of Truth**；各代码包不维护正式文档体系。
- 文档系统 5 原则见 `meta/doc-rules.md`；机器事实层生成、一致性校验只验机器事实、不强制逐模块 prose。

### 12.7 纠偏记录
- 服务消费权限守卫不是 spec 要求（早期误列已收回）；文档与代码冲突以代码为准并回报。

---

> 若发现本总纲某条与真实代码不符，以代码为准，并回报差异以便修正本总纲。
