## 多智能体协作（Phase 6.6）

### 一、概述

多智能体协作系统允许多个 Agent 组成团队，协同完成复杂的知识管理任务。团队中的 Agent 可以分工协作、共享信息和联合决策。

**核心组件：**

| 组件 | 说明 |
|------|------|
| CollaborationEngine | 协作引擎，管理团队创建、任务规划、分发和执行 |
| TeamRegistry | 团队注册表，存储所有团队定义 |
| MessageBus | 消息总线，团队内部消息传递 |
| TaskPlanner | 任务规划器，将目标分解为子任务 |
| TaskDispatcher | 任务分发器，根据 Agent 能力分配任务 |
| SharedMemory | 团队共享记忆，存储决策记录和经验（持久化到 `shared_memory` 表）|
| CollaborationMemory | 团队/任务持久化存储 |

### 二、团队模型

团队结构：

```
┌─────────────────────────────────────────┐
│  Team                                    │
│  ├── Leader (Agent)                      │
│  ├── Members (Agent[])                   │
│  ├── SharedMemory                        │
│  ├── TaskQueue                           │
│  └── CollaborationRules                  │
└─────────────────────────────────────────┘
```

**角色分工：**
- **Leader**：负责任务分解、分配和协调
- **Member**：执行具体子任务，向 Leader 汇报

**协作模式：**

| 模式 | 说明 |
|------|------|
| 层级协作（hierarchy） | Leader 分配任务，成员执行 |
| 共识协作（consensus） | 成员共同讨论达成共识 |
| 流水线（pipeline） | 成员按顺序处理任务的不同阶段 |
| 广播（broadcast） | 对全局事件进行响应，适合监控类团队 |

内置团队：`knowledge-research-team`（知识研究团队），采用流水线策略，包含 `research-agent` 和 `knowledge-assistant`。

### 三、消息模型

团队内部消息传递通过 MessageBus 实现：

| 消息类型 | 说明 |
|----------|------|
| task_assign | Leader 向成员分配任务 |
| task_report | 成员向 Leader 汇报进度 |
| info_share | 成员间共享信息 |
| help_request | 成员请求帮助 |
| consensus_propose | 共识提案 |
| consensus_vote | 共识投票 |

### 四、任务系统

团队任务的生命周期：

```
created → assigned → in_progress → completed
                    ↘ blocked → retry
                    ↘ failed
```

**任务属性：**
- 优先级（high/medium/low）
- 依赖关系（任务间依赖）
- 截止时间
- 所需能力（匹配 Agent 类型）

**任务执行流程（executeTeam）：**

1. 创建 CollaborationContext（共享记忆 + 消息总线）
2. TaskPlanner 将目标分解为子任务
3. TaskDispatcher 根据成员列表分配子任务
4. 顺序执行每个子任务（通过 AgentEngine.execute）
5. 每个子任务结果写入共享记忆
6. 汇总所有子任务结果，标记团队任务状态

### 五、共享记忆

团队共享记忆是团队成员共同维护的知识库：

**存储内容：**
- 团队决策记录
- 成功经验（最佳实践）
- 失败教训
- 上下文信息（当前任务状态）

**记忆隔离：**

> **共享记忆**：团队所有成员可读写（scope = `team:<teamId>`，visibility = `team`）
> **个人记忆**：仅 Agent 自己可访问

### 六、CLI 命令

```bash
lo team list                          # 列出团队
lo team run <teamId> <goal>           # 运行团队协作
lo team create <id> --members ...     # 创建团队
lo collaborator send <from> <to>      # 发送消息
lo collaborator messages <agentId>    # 查看消息
```

### 七、事件触发

团队可通过 `triggerByEvent()` 响应全局事件。`broadcast` 策略的团队对全局事件自动响应。

```
事件 → CollaborationEngine.triggerByEvent()
        → 匹配 broadcast 策略团队
        → executeTeam(teamId, handle_<eventType>)
```

---

**相关文档：**

- [知识智能体](agent.md) — 单个 Agent 管理
- [事件总线](event.md) — 事件驱动协作
- [Workflow 状态机](workflow.md) — 任务状态变化的规则基础
- [知识系统自演化](evolution.md) — 团队参与的自演化
