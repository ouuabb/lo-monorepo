# @lo/core

lo Core —— 世界模型 + 能力中心（AI 原生知识管理 CLI `lo` / `lo serve`，端口 8765）。
本地优先 · 端到端加密 · Git 风格版本控制 · 知识图谱 · 智能体协作 · 自演化。

## 使用

```bash
pnpm --filter @lo/core start            # 等价 `lo`
lo init
lo new "我的第一篇笔记"
lo edit "我的第一篇笔记"
lo serve                               # HTTP 服务（默认 127.0.0.1:8765）
```

命令参考：`lo help` / `lo manual`（读取 `packages/core/docs/`，CLI 功能数据）。

## 文档

正式架构/契约文档统一在 **lo 生态文档中心**（唯一 Source of Truth）：

- 架构：`meta/architecture/core.md`
- 总纲/边界：`meta/AGENTS.md`
- 规格：`meta/specs/`（002 能力协议 / 008 插件系统 / 013 审计 等）

## 开发

```bash
pnpm --filter @lo/core test      # jest（3638+ 用例）
pnpm --filter @lo/core lint
pnpm --filter @lo/core format
```

## 许可证

MIT
