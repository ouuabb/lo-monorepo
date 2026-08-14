# AGENTS.md — lo-client-sdk

本文件是 **薄入口**。lo 生态唯一权威总纲已由 **opencode 全局配置自动加载**
（`~/.config/opencode/opencode.jsonc` → `instructions`）；工作区布局下亦可读
`../meta/AGENTS.md`。
（含：契约铁律 §1、不可触犯边界 §12、开发流程 §3、测试 §4、文档 §5、审查 §6、陷阱 §7、
边界速查 §8、各仓库速查 §2）。**开始任何改动前，先读总纲。**

## 本仓库定位

`@lo/client` 是 **lo 知识库 API 的 HTTP 客户端 SDK**。它消费 `lo serve` 提供的 REST/JSON
协议，供桌面端/脚本等进程内消费者使用，与面向插件作者的 `@lo/plugins-sdk` 互补。

## 技术栈与约束

- 纯 CommonJS（`.cjs`）；**零运行时依赖**（dependencies/peerDependencies 为空）。
- Node >= 20；双空格、单引号、分号、100 列上限。

## 常用命令

```bash
npm test       # Jest（覆盖率默认开启）
npm run lint   # ESLint
npm run format # Prettier
```

## 提交要点

- Conventional Commits（type 英文小写 + subject 中文）；husky pre-commit 跑测试/commitlint。
- 不要加第三方依赖；新 HTTP 特性直接在 `http.cjs` 实现。

## 完整细节

架构（client/http/auth）、关键约定（res.body / LoApiError/LoHttpError / token 注入）、
变更前必读（`/api/auth/*` skipAuth、新增资源流程）→ 见总纲 **§2.3**。
