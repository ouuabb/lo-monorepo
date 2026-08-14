## ai — AI 原生知识操作系统

**用法:** `lo ai <status|ask|analyze|insights|memory> [选项...]`

AI 原生知识操作系统，提供语义理解、推理和对话能力。包括 AI 请求/响应模型、推理引擎、语义记忆、概念记忆和学习引擎。

### 子命令

- `status` — 查看 AI OS 状态（运行状态、语义记忆统计、概念记忆统计、学习记录数）
- `ask <question>` — 向 AI 提问
- `analyze` — 分析知识图谱（语义分析 + 行动建议）
- `insights` — 查看 AI 洞察
- `memory` — 查看 AI 记忆详情（语义记忆 + 概念记忆）

### 选项

**ask:**
- `--mode <模式>` — 模式: `chat`（对话）、`analysis`（分析）、`research`（研究）、`creation`（创作）、`automation`（自动化），默认: `chat`

### 示例

```
lo ai status                                   # 查看状态
lo ai ask "知识库有哪些薄弱环节？"                # 提问
lo ai ask "总结核心概念" --mode analysis         # 分析模式
lo ai analyze                                  # 图谱分析
lo ai insights                                 # AI 洞察
lo ai memory                                   # AI 记忆
```

### 工作机制

- **推理引擎**: 基于语义理解和知识图谱的推理能力，支持多步推理（reasoning.thoughts）
- **语义记忆**: 存储知识的语义表示，按类型分类（fact、concept、relationship 等）
- **概念记忆**: 维护概念库，追踪概念置信度（avg confidence）
- **学习引擎**: 记录学习过程，持续改进理解能力
- **请求/响应模型**: 每次 AI 交互返回 confidence（置信度）、content（内容）、reasoning（推理过程）和 actions（执行动作）

### 注意事项

- AI 功能需要 AI 后端支持（初始化 `initAIOS`）
- 不同 mode 下 AI 采用不同的推理策略
- AI 记忆随使用持续积累

### 相关命令

- [agent](agent.md) — 知识智能体
- [evolution](evolution.md) — 知识系统自演化
- [knowledge](knowledge.md) — 知识智能分析
- lo docs ai-os
