# 边界与铁律

> 文档基线：[`.baseline`](.baseline)。契约口径最终以生态总纲
> （`lo-meta/ecosystem/AGENTS.md` §1/§2.6/§12）与 SDK `manifest-spec.md` 为准。

## 1. IPC 白名单铁律

- renderer → main **只能经 preload 白名单通道**（`window.loAgent.*` / `window.pluginUi`）；
  每个通道绑定主进程**具体方法**。
- **禁止**：透传任意 IPC 调用、任意处理函数、`PluginManager` / `LoClient` / `@lo/client`
  原始实例给渲染进程。
- 插件能力接入 UI 只新增 `agent-plugins:*` **具体方法**通道，不建 `runtime:*` 协议套件。
- 白名单一致性由 `npm run docs:check` 强制（preload 只引用主进程已注册通道）。

## 2. 安全基线（Electron）

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；渲染进程不接触
  Node/网络，一律经 `contextBridge` 暴露的受控接口。
- 外部链接交给系统浏览器（`setWindowOpenHandler` deny）。
- 不向渲染进程暴露任意 IPC 处理函数。

## 3. 插件宿主边界

- 插件**只经 SDK 契约**（`ctx.lo` / `ctx.extensions`）；禁止裸 `repo`、
  `ctx.getRepository()`、插件内嵌 `@lo/client`、硬编码端口。
- `ctx.lo` 权限默认只读，写操作需 `manifest.permissions.lo` 声明；过滤在主进程
  `context.lo` facade（Phase B）执行。
- `dependsOn` 硬依赖强制先激活被依赖方；`activationEvents` 懒激活（仅
  onCommand/onView/onPanel/onEditor 触发）。
- 服务消费：`getService` 同步语义，提供者须已激活；消费方判空降级。
- `plugins-demo/` 是 `lo-agent-plugins/packages/` 的同步副本——改插件需双份同步（人工）。

## 4. mountEl / G2 安全模型

- 插件 UI 在渲染进程 **isolated world** 执行，**技术上不可触达**
  `window.loAgent.loCore` / App 内部对象；`ctx` 是唯一能力入口。
- **无 iframe / WebView / 自定义协议（lo-plugin://）/ postMessage**。
- **G2 只保证 JS 执行上下文隔离，不保证 DOM 内容隔离**（共享 document）。
- 插件 UI 拒绝远程 `import()`；worldId 由 Host 分配；dispose 在 world 内执行，
  主 world 不持跨 world 函数引用；Blob URL import 后 revoke。
- `ctx.lo → agent-plugins:ctx → 主进程 context.lo facade → @lo/client → Core`，权限不变。

## 5. 渲染模型

- 未声明 `ui` 的插件走 HTML 快照（主进程 `render(context, ctx) → string`，渲染进程承载）。
- 声明 `ui` 的插件走 mountEl（isolated world 真实 DOM）；快照保留为兼容路径。

## 6. 提交与发布纪律

- Conventional Commits（type 英文小写 + subject 中文，header ≤ 72）；husky `pre-commit`
  跑测试、`commit-msg` 校验。
- 不提交 `node_modules/`、`dist/`、`out/`、`coverage/`、secrets。
- 改 SDK 契约后需在 lo-agent 重新安装同步 `node_modules/@lo/agent-plugins-sdk`
  （`file:` 拷贝），否则宿主拿到旧契约。

## 7. 文档系统边界

- `docs/reference/ipc-channels.md` 由脚本生成，**勿手改**；`docs-check` 只校验机器事实
  （生成幂等/白名单一致/引用路径），不校验语义。
- 不重复生态总纲与 SDK manifest-spec，只引用。
