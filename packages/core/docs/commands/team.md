## team — Agent 团队协作

**用法:** `lo team <list|run> [选项...]`

管理多智能体团队协作。团队协作系统提供消息模型、团队管理、任务分配和共享记忆，支持多个 Agent 协同完成复杂任务。

### 子命令

- `list` — 列出 Agent 团队（含策略类型、成员数）
- `run <id> <goal>` — 执行团队协作任务

### 示例

```
lo team list                                      # 列出团队
lo team run research-team "分析知识库完整性"       # 执行协作
```

### 工作机制

- **团队组成**: 每个团队包含多个不同能力的 Agent，由策略引擎协调
- **策略类型**: 团队可配置不同协作策略（如 round-robin、task-delegation）
- **任务分配**: 根据 Agent 能力和当前负载自动分配子任务
- **共享记忆**: 团队成员间共享上下文，支持消息传递
- **消息模型**: Agent 间通过 request/response 消息通信

### 注意事项

- 团队协作需要先初始化协作系统（`initCollaborationSystem`）
- 团队执行任务时自动分解为子任务分配给各成员
- 可通过 `lo agent messages` 查看 Agent 间的消息流

### 相关命令

- [agent](agent.md) — 知识智能体管理
- lo docs collaboration
