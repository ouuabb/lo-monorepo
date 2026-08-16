# AGENTS.md — lo-plugins-sdk（@lo/plugins-sdk）

本文件是 **薄入口**。lo 生态唯一权威总纲已由 **opencode 全局配置自动加载**
（`~/.config/opencode/opencode.jsonc` → `instructions`）；工作区布局下亦可读
`../meta/AGENTS.md`。
（含：契约铁律 §1、不可触犯边界 §12、开发流程 §3、测试 §4、文档 §5、审查 §6、陷阱 §7、
边界速查 §8、各仓库速查 §2）。**开始任何改动前，先读总纲。**

## 本仓库定位

`@lo/plugins-sdk` 是 **lo Core 插件开发 SDK**（契约层）。定义 Core Plugin 与 Core 之间的契约，
插件经它接入 Core 的 PluginManager，**运行在 lo Core 进程内**。
与 `@lo/agent-plugins-sdk`（客户端插件 SDK，扩展客户端交互）互补不冲突。

## 技术栈与约束

- 纯 CommonJS（`.cjs`）；Node >= 20；双空格、单引号、分号、100 列上限。
- **零运行时依赖**；`@lo/client` 不在此处 require。

## 常用命令

```bash
npm test              # Jest（sdk.test.cjs / edge.test.cjs / setup.cjs）
```

## 契约铁律（速记）

- SDK 只定义契约，不实现业务调用；真实 `PluginContext` 由 Core PluginManager 加载时注入。
- **不依赖 lo Core 内部实现**、不 require lo-agent、不封装 `@lo/client`、不定义二次协议。
- 插件代码只从 `@lo/plugins-sdk` require。

## 提交要点

- Conventional Commits（type 英文小写 + subject 中文，header ≤ 72 字符）；husky 强制。
- 不提交 `node_modules/`、`coverage/`。

## 完整细节

结构（src/ 文件清单）、契约铁律、提交规范 → 见总纲 **§2.4**。
