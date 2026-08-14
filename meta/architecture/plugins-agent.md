# lo-agent-plugins（plugins/agent）架构

> 核对基线：见 `meta/setup/.baseline`。以当前代码为准；`@lo/agent-plugins-sdk` 为 devDep（workspace）。

`plugins/agent` 是 **lo-agent 客户端插件源码 + 分发仓库**：存放插件源码
（`plugins/agent/packages/` 下 `<id>/`，含 `plugin.json` manifest + 入口 + 可选 `ui/`），
`plugins/agent/scripts/build.cjs` 打包 tar.gz + `index.json` 分发清单。**本身不是运行环境**
——插件运行发生在 lo-agent 内（宿主 PluginManager）。

## 插件

| 插件 | 说明 |
|---|---|
| `plugins/agent/packages/demo-hello` | 最小示例：命令 + 视图 + 面板 + 编辑器 + 服务提供者 + mountEl UI + 经 `ctx.lo` 访问 Core |
| `plugins/agent/packages/demo-consumer` | 服务消费方：经 `ctx.extensions.getService` 消费 demo-hello 状态服务（+ `dependsOn`） |

（插件目录清单由 `meta/scripts/docs-gen.cjs` 从 plugin.json 生成，见 `meta/plugins/agent.md`。）

## 分发

- `plugins/agent/scripts/build.cjs`：打包 `dist/<id>-<version>.tar.gz` + `index.json`（含 sha256）。
- 顶层条目：`plugin.json / src / extension / ui / package.json`。

## 契约铁律（插件收敛）

- 插件只 `require('@lo/agent-plugins-sdk')`，永不 require lo-agent 内部文件。
- 访问 Core 只经 `ctx.lo`（权限白名单过滤）；注册能力经 `ctx.extensions`。
- 权限默认只读；写操作（`operations.write` 等）声明于 `manifest.permissions.lo`。
- manifest 必填 `id/name/version/main`；id kebab-case。

## 边界

- 跨包依赖走 workspace（`@lo/agent-plugins-sdk` devDep；运行时由 apps/agent 提供）。
- `manifest.ui`（mountEl）：渲染进程 isolated world 执行，G2 安全模型
  （见 `meta/design/adr-001-mountel-g2.md`）。
- 正式文档唯一在 `meta/`（本文件 + 生成的插件目录）。
