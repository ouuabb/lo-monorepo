# AGENTS.md — lo-agent-plugins-sdk

本文件是 **薄入口**。lo 生态唯一权威总纲已由 **opencode 全局配置自动加载**
（`~/.config/opencode/opencode.jsonc` → `instructions`）；工作区布局下亦可读
`../meta/AGENTS.md`。
（含：契约铁律 §1、不可触犯边界 §12、开发流程 §3、测试 §4、文档 §5、审查 §6、陷阱 §7、
边界速查 §8、各仓库速查 §2）。**开始任何改动前，先读总纲。**

## 本仓库定位

`@lo/agent-plugins-sdk` 是 **lo-agent 插件开发工具包**。与 lo Core 的嵌入式插件系统
（`@lo/plugins-sdk`，跑在核心进程内）不同，本 SDK 的插件**直接运行在 lo-agent 桌面端**，
通过 `@lo/client`（lo Core 的 HTTP 客户端）访问仓库能力。

## 技术栈与约束

- 纯 CommonJS（`.cjs`）；**无强制运行时依赖**：`@lo/client` 是可选 `peerDependencies`，
  由宿主（lo-agent）注入；未注入时 `ctx.lo` 返回 noop（调用抛错提示）。
- Node >= 20；双空格、单引号、分号、100 列上限。

## 常用命令

```bash
npm test       # Jest（覆盖率默认开启）
npm run lint   # ESLint
npm run format # Prettier
npm run docs:build # 文档占位校验（scripts/docs-check.cjs）
```

## 依赖方向（速记）

```
Plugin → ctx.lo(契约) → Host Adapter(实现) → @lo/client → lo Core
Plugin → ctx.extensions(契约) → Host ExtensionRegistry(实现) → 命令执行 Runtime
```

- **SDK 不依赖 lo-agent**（无反向依赖）；**不替代 @lo/client**（不 require、不封装 HTTP/协议）；
  **不定义二次协议**（不新增 operations/events/relations 之外的方法）。

## 提交要点

- Conventional Commits（type 英文小写 + subject 中文）；husky pre-commit 跑测试。
- 修改公开契约会直接影响宿主（lo-agent）与已发布插件，需同步 README/AGENTS/types。

## 完整细节

架构（src/ 文件清单 + docs/manifest-spec）、关键约定（noop/事件点号/生命周期）、
变更前必读 → 见总纲 **§2.7**。
