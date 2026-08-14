## 知识智能体（Phase 6.5）

### 一、概述

Knowledge Agent 是 lo 中的自治智能体，具备独立的状态机、记忆系统和规划/执行/反思循环，能够自主完成知识管理任务。每个 Agent 是一个独立的运行时实例，由 AgentEngine 统一管理。

**核心组件：**

| 组件 | 说明 |
|------|------|
| AgentEngine | Agent 引擎，统一管理所有 Agent 的启动/停止/执行/触发 |
| AgentRuntime | Agent 运行时，封装单个 Agent 的执行上下文 |
| AgentExecutor | 任务执行器，调用 WorkflowEngine/Repository 执行操作 |
| AgentMemory | 三层记忆系统（工作/短期/长期） |
| AgentStateMachine | 状态机，管理 idle → planning → executing → reflecting 循环 |
| AgentRegistry | Agent 注册表，存储所有已注册的 Agent 定义 |
| AgentStore | Agent 持久化存储 |

### 二、Agent 类型

预定义 Agent 类型，每种类型有独特的工具集和状态机行为：

| 类型 | 说明 |
|------|------|
| researcher | 研究员：探索知识关联、发现新知 |
| curator | 策展人：整理分类、优化标签 |
| analyst | 分析师：统计分析、生成报告 |
| monitor | 监控员：监控知识库健康状态 |
| assistant | 助手：回答知识相关问题 |

每种 Agent 类型有独特的：
- **状态机**（idle → planning → executing → reflecting）
- **记忆结构**（短期/长期/工作记忆）
- **工具集**（可调用的操作）

### 三、状态机

每个 Agent 遵循以下状态机循环：

```
idle ──→ planning ──→ executing ──→ reflecting
  ↑                                      │
  └──────────────────────────────────────┘
```

1. **idle**：等待任务或事件触发
2. **planning**：分析目标，制定执行计划
3. **executing**：按计划逐步执行操作
4. **reflecting**：评估结果，更新记忆，决定下一步（回到 idle 或重新 planning）

> **重要提示**：Agent 可以通过 `AgentEngine.trigger(event)` 响应全局事件。当事件发生时，匹配事件的 Agent 会被自动唤醒执行。

**事件到目标的映射：**

| 事件类型 | 触发目标 |
|----------|----------|
| `resource.created` | auto_tag |
| `resource.updated` | review_graph |
| `relation.created` | review_graph |
| `relation.deleted` | review_graph |
| `sync.completed` | review_graph |
| `ai.suggestion.created` | expand_knowledge |
| `knowledge.analyzed` | cleanup_forgotten |

### 四、记忆系统

Agent 记忆分为三层：

| 记忆层 | 容量 | 持久化 | 用途 |
|--------|------|--------|------|
| 工作记忆 | 小（5-7条） | 否 | 当前任务上下文 |
| 短期记忆 | 中（100条） | 是 | 近期经验 |
| 长期记忆 | 大（无限制） | 是 | 历史知识和模式 |

**记忆类型：**
- **episodic**（情景记忆）：具体事件记录
- **semantic**（语义记忆）：概念和关系理解
- **procedural**（程序记忆）：操作流程经验

与 AI 的语义记忆/概念记忆的区别：

> **Agent 记忆** — 个体经验（事件、对话、任务历史），持久化到 `agent_memory` 表
> **语义记忆（SemanticMemory）** — 对知识库的理解（概念向量、关系强度、主题聚类），持久化到 `ai_memory` 表
> **概念记忆（ConceptMemory）** — 知识本体（类型、约束、领域模型），持久化到 `ai_concepts` 表

### 五、Agent 间通信

Agent 之间通过消息系统通信：

```bash
lo agent send <from> <to> <message>
```

**消息支持：**
- 点对点消息（Agent → Agent）
- 广播消息（Agent → 所有）
- 任务委派（Agent → Agent + 任务）

### 六、CLI 命令

```bash
lo agent list              # 列出所有 Agent
lo agent info <id>         # 查看 Agent 详情
lo agent run <id>          # 运行一个 Agent
lo agent memory <id>       # 查看 Agent 记忆
lo agent messages <id>     # 查看 Agent 消息
lo agent send <from> <to>  # 发送消息
```

---

**相关文档：**

- [多智能体协作](collaboration.md) — Agent 团队协作
- [AI 知识操作系统](ai-os.md) — AI 核心层
- [Workflow 状态机](workflow.md) — Agent 通过合法转换参与有规则的世界
- [知识系统自演化](evolution.md) — Agent 参与的自演化循环
