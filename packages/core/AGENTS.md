# AGENTS.md — lo（lo Core）

本文件是 **薄入口**。lo 生态唯一权威总纲已由 **opencode 全局配置自动加载**
（`~/.config/opencode/opencode.jsonc` → `instructions`）；工作区布局下亦可读
`../meta/AGENTS.md`。
（含：契约铁律 §1、不可触犯边界 §12、开发流程 §3、测试 §4、文档 §5、审查 §6、陷阱 §7、
边界速查 §8、各仓库速查 §2）。**开始任何改动前，先读总纲。**

## 本仓库定位

lo Core 是 lo 生态的**世界模型 + 能力中心**：CLI（`lo`，`bin/note.cjs`）+ `lo serve`
（HTTP 服务，默认端口 **8765**）。世界模型唯一持有者：Resource / Relation / Operation /
Event / Workflow 全部由本仓库定义与落库。对外出口：`lo serve` 的 HTTP 协议。

## 常用命令

```bash
npm start          # node bin/note.cjs
npm test           # jest --passWithNoTests --forceExit（3646+ 用例）
npm run lint       # eslint src/**/*.cjs test/**/*.cjs
npm run format     # prettier --write src/**/*.cjs
npm run docs:build # vitepress build docs
```

## 提交要点

- Conventional Commits（type 英文小写 + subject 中文，header ≤ 72 字符）；husky 强制。
- 不提交 `node_modules/`、`coverage/`、`.repo/`、secrets。

## 完整细节

架构目录、契约铁律（Core 内部）、测试、变更前必读 → 见总纲 **§2.2**。
