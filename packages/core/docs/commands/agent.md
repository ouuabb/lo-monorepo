## agent — 知识智能体

**用法:** `lo agent <list|info|run|memory|messages|send> [选项...]`

管理知识智能体（Knowledge Agent）。智能体系统支持多种 Agent 类型、独立状态机、记忆系统和规划/执行/反思循环。

### 子命令

- `list` — 列出所有 Agent（含类型、能力数、状态）
- `info <id>` — Agent 详情（名称、类型、状态、能力、最近记忆）
- `run <id>` — 执行 Agent 任务
- `memory <id>` — 查看 Agent 记忆（observation / decision / action / plan）
- `messages` — 查看 Agent 间消息
- `send <from> <to> <msg>` — 发送 Agent 消息

### 选项

**run:**
- `--goal <目标>` — 执行目标

**memory:**
- `--limit <数量>` — 记忆数量限制（默认: 10）

**messages:**
- `--agentId <agent>` — 按 Agent 过滤
- `--limit <数量>` — 数量限制（默认: 15）

### 示例

```
lo agent list                                 # 列出 Agent
lo agent info researcher                      # 查看详情
lo agent run researcher --goal "分析知识结构"   # 执行任务
lo agent memory researcher --limit 20         # 查看记忆
lo agent messages                             # 查看消息
lo agent send user researcher "请分析这个主题"  # 发送消息
```

### 工作机制

- **Agent 类型**: 支持多种类型（如 researcher、analyst、curator），每种有特定的能力集
- **状态机**: 每个 Agent 有独立状态机（initialized → running → waiting → completed / disabled）
- **记忆系统**: Agent 记忆分为 observation（观察）、decision（决策）、action（行动）和 plan（计划）四类
- **规划/执行/反思循环**: Agent 执行任务时经历：制定计划 → 执行步骤 → 反思结果 → 调整计划

### 注意事项

- Agent 系统需要先初始化（`initAgentSystem`）
- Agent 记忆仅限当次会话，重置后清空
- 多 Agent 协作通过 team 命令和消息系统实现

### 相关命令

- [team](team.md) — 多智能体团队协作
- [ai](ai.md) — AI 原生知识操作系统
- lo docs agent
