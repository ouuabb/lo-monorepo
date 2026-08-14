# lo 生态文档中心

lo 生态**唯一正式文档 Source of Truth**。知识组织层：总纲、架构、规格、API、开发指南、
设计决策、复现指南。展示层为 `docs/`（VitePress），构建后发布到 GitHub Pages。

```
代码（packages/apps/plugins）
        ↓ 被描述
     meta/（唯一文档源）
        ↓
     docs/（VitePress 展示壳）
        ↓
     GitHub Pages
```

## 文档地图

| 文档 | 内容 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **生态总纲**（唯一权威）：契约铁律 §1、模块速查 §2、开发流程 §3、测试 §4、文档 §5、审查 §6、陷阱 §7、边界速查 §8、版本 §9、概念 §10、快速开始 §11、**不可触犯边界 §12** |
| [`architecture/`](architecture/index.md) | 整体架构 + 各模块架构（core/client/agent/plugins/插件系统） |
| [`core/`](core/README.md) | **@lo/core 详细文档**（资源模型/Schema/RID/加密/安全/运维/知识图谱/自动化/子系统/命令参考） |
| [`plugins-sdk/`](plugins-sdk/README.md) | **@lo/plugins-sdk 详细文档**（Plugin/PluginContext/Builder/EventApi/Logger API + 示例） |
| [`lo-plugins/`](lo-plugins/README.md) | **lo-plugins 详细文档**（插件开发指南 + 各插件说明） |
| [`agent/`](agent/index.md) | **lo-agent 详细文档**（架构/边界/进度/发布/IPC 通道） |
| [`lo-agent-plugins/`](lo-agent-plugins/index.md) | **lo-agent-plugins 详细文档**（架构/边界/进度/发布/插件说明） |
| [`agent-plugins-sdk/`](agent-plugins-sdk/index.md) | **@lo/agent-plugins-sdk 文档**（SDK 概览） |
| [`specs/`](specs/001-execution-context-protocol) | 生态规格 001–013（能力协议 / 边界审计 / 插件系统 / 收敛计划） |
| [`api/`](api/index.md) | 模块与 API 说明（@lo/client、@lo/plugins-sdk、@lo/agent-plugins-sdk） |
| [`guides/`](guides/index.md) | 快速开始 / 开发指南 / 权限 / 插件体系 / Agent 体系 |
| [`design/`](design/index.md) | 设计决策（ADR）：G2 安全模型、mountEl、dependsOn、monorepo 迁移等 |
| [`setup/`](setup/README.md) | 环境复现 / 迁移历史映射 |
| [`doc-rules.md`](doc-rules.md) | 文档系统 5 原则 + 更新方法 |

## 使用

```bash
pnpm install
pnpm --filter lo-meta docs:dev      # 本地预览 http://localhost:5173/lo-monorepo/
pnpm --filter lo-meta docs:build    # 构建到 docs/dist
pnpm --filter lo-meta check         # 文档一致性校验
```

> 各代码模块只保留极简 README / description / 注释；正式文档一律在 `meta/`。
