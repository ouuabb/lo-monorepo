# AGENTS.md — lo-agent-plugins（客户端插件仓库）

本文件是 **薄入口**。lo 生态唯一权威总纲已由 **opencode 全局配置自动加载**
（`~/.config/opencode/opencode.jsonc` → `instructions`）；工作区布局下亦可读
`../meta/AGENTS.md`。
（含：契约铁律 §1、不可触犯边界 §12、开发流程 §3、测试 §4、文档 §5、审查 §6、陷阱 §7、
边界速查 §8、各仓库速查 §2）。**开始任何改动前，先读总纲。**

## 本仓库定位

`lo-agent-plugins` 是 **lo-agent 客户端插件源码 + 分发仓库**：存放插件源码
（`packages/<id>/`，含 `plugin.json` manifest + 入口），`scripts/build.cjs` 打包
`dist/<id>-<version>.tar.gz` + `index.json` 分发清单。**本身不是运行环境**——插件运行
发生在 lo-agent 内（宿主 PluginManager）。

## 插件

| 包 | 说明 |
|---|---|
| `packages/demo-hello` | 最小示例：命令 + 视图 + 面板 + 编辑器 + **服务提供者** + mountEl UI + 经 `ctx.lo` 访问 Core |
| `packages/demo-consumer` | 服务消费方：经 `ctx.extensions.getService` 消费 demo-hello 状态服务（+ `dependsOn`） |

## 技术栈与命令

- 纯 CommonJS；Node >= 20；Yarn。
- `yarn run build`：打包分发产物（tar.gz + index.json，含 sha256）。
- `yarn test`：构建冒烟（build.cjs --plugin demo-hello）。

## 契约铁律（插件收敛，速记）

- 插件只 `require('@lo/agent-plugins-sdk')`，永不 require lo-agent 内部文件。
- 访问 Core 只经 `ctx.lo`（权限白名单过滤）；注册能力经 `ctx.extensions`。
- 权限默认只读；写操作（`operations.write` 等）声明于 `manifest.permissions.lo`。
- manifest 必填 `id/name/version/main`；id 用 kebab-case。

## 提交要点

- Conventional Commits（type 英文小写 + subject 中文，header ≤ 72 字符）。
- 不提交 `dist/`、`node_modules/`、`coverage/`。

## 完整细节

打包规则、契约铁律 → 见总纲 **§2.8**；插件目录由 `meta/plugins/agent.md` 生成。
正式文档唯一在 `meta/`（`doc-rules.md`）；本模块不维护独立 docs 体系。
