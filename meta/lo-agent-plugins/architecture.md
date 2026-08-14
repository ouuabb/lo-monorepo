# 实现方式（架构）

> 文档基线：[`.baseline`](.baseline)。本文解释「代码怎么工作」，事实以代码为准。

## 1. 仓库角色

`lo-agent-plugins` **不运行插件**，只做两件事：

1. **源码**：`packages/` 下 `<id>/` 每个插件（`plugin.json` manifest + 主进程入口 `index.cjs`，
   可选渲染端入口 `ui/index.mjs`）。
2. **打包分发**：`scripts/build.cjs` 产出 `dist/`（tar.gz + index.json），供 lo-agent 的
   `PluginInstaller` 拉取安装。

## 2. 打包实现（scripts/build.cjs）

- **打包内容**：`INCLUDE_ENTRIES = ['plugin.json', 'src', 'extension', 'ui', 'package.json']`
  （`build.cjs` 中常量）；main 指向的顶层文件也会带上。`test/`、`node_modules/`、`*.md` 不打包。
- **manifest 校验**：`REQUIRED_MANIFEST = ['id', 'name', 'version', 'main']`，缺失即构建失败。
- **产物**：每个插件 → `dist/<id>-<version>.tar.gz`；整体 → `dist/index.json`，条目含
  `{ id, name, version, description, author, main, downloadUrl, checksum, size }`，
  `checksum` 为 tar.gz 的 sha256。
- **单包构建**：`node scripts/build.cjs --plugin <id>` 只构建指定插件。
- **幂等清空**：每次构建清空并重写 `dist/`（`index.json` 按 id 排序）。

## 3. 分发 → 安装 → 运行链路

```
dist/index.json + tar.gz
   │ lo-agent PluginInstaller：fetch index.json → 下载 tar.gz → 校验 sha256 → 解压
   ▼
{userData}/plugins/<id>/（plugin.json + index.cjs [+ ui/]）
   │ PluginLoader：validateManifest（@lo/agent-plugins-sdk）→ require main（CJS）→ createPlugin
   ▼
PluginManager：initialize → activateAll（dependsOn 拓扑排序 + activationEvents 懒激活）
   ▼ 插件 activate(ctx)
   ├─ ctx.lo → lo-adapter（权限白名单 facade）→ LoCoreService → @lo/client → lo Core
   ├─ ctx.extensions.registerCommands/registerView/registerPanel/registerEditor/registerService
   │     → ExtensionRegistry（命令执行 / 视图、面板、编辑器渲染 / 插件间服务）
   └─ ui/index.mjs → 渲染进程 isolated world（mountEl 真实 DOM）
         能力经 agent-plugins:ctx → 主进程插件 context.lo（同一 facade 裁决）
```

> 本仓库只到「被打包的分发源」；加载/激活/渲染均发生在 lo-agent。宿主侧实现细节见
> `lo-agent` 仓库与生态总纲 §2.6。

## 4. 扩展点运行时（本仓库两个插件的演示面）

| 扩展点 | 声明（manifest.contributes） | 运行时注册（activate 内 ctx.extensions.*） | 宿主消费 |
|---|---|---|---|
| commands | `{ id, title }` | `registerCommands([...])` | `PluginManager.executeCommand` |
| views | `{ id, title, type }` | `registerView([...])`（render 返回 HTML 字符串） | `renderView` → 渲染进程承载 |
| panels | `{ id, title }` | `registerPanel({ id, area, render })` | `renderPanel` |
| editors | `{ id, title, resourceType }` | `registerEditor({ id, resourceType, render })` | `renderEditor` |
| services | `{ id, title }` | `registerService([{ id, version, api }])` | 其他插件 `ctx.extensions.getService(id)` |

demo-hello 覆盖全部 5 类 + mountEl UI；demo-consumer 演示服务消费（跨插件）。

## 5. 服务链路（demo-hello ↔ demo-consumer）

```
demo-hello.activate：ctx.extensions.registerService([{ id:'demo-hello.status-service', api }])
   → ExtensionRegistry._services
demo-consumer.activate：ctx.extensions.getService('demo-hello.status-service') → api
   → svc.getStatus() / svc.getGreeting()
```

- 提供者停用/禁用时服务从注册表清理，消费者 `getService` 返回 `null`（demo-consumer
  优雅降级为 `{ available:false, reason }`）。
- 消费者只按服务 ID 取 api，不持有注册表 key；`getService` 为**同步**语义，提供者需已激活
  （demo-consumer 通过 `dependsOn` 保证激活顺序）。

## 6. mountEl UI（ui/index.mjs）

- `manifest.ui` 指向**单文件自包含 ESM**（如 `plugins/agent/packages/demo-hello/ui/index.mjs`）。
- 运行于渲染进程 **isolated world**（worldId 由 lo-agent `PluginManager.getUiWorldId` 分配），
  导出 `{ views?, panels?, editors? }`，`render(mountEl, ctx)` 挂载真实 DOM。
- `ctx` 为插件作用域能力入口（`lo/config/executeCommand/notify`）；`ctx.lo` 经
  `agent-plugins:ctx` 代理到主进程插件既有 `context.lo`（Phase B facade 权限裁决）。
- 安全模型见 [`boundary.md`](boundary.md) §3（G2：JS 上下文隔离，非 DOM 隔离）。

## 7. dev 副本同步（双份现状，需如实注意）

`lo-agent/plugins-demo/demo-hello`、`demo-consumer` 是本仓库 `packages/` 对应插件的
**同步副本**（lo-agent 测试以它为真实载体）。需保持一致的三个文件：

- `index.cjs`、`plugin.json`、`ui/index.mjs`

**当前为人工同步**：改动本仓库 packages 后需手动复制到 `lo-agent/plugins-demo/`。这是
已知维护负担，尚无自动化脚本或符号链接。

## 8. 未纳入本仓库的实现

- 插件契约定义（manifest/ctx/extensions）→ `@lo/agent-plugins-sdk`
  （`docs/manifest-spec.md` 为其契约规范）。
- 宿主加载/激活/渲染/权限/服务注册表 → `lo-agent` 仓库。
- Core 侧嵌入式插件（epub 等）→ `lo-plugins` 仓库（不同运行环境，不属本仓库范围）。
