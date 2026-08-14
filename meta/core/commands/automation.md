## automation — Automation 行为编排

**用法:**

```
lo automation list
lo automation show <id>
lo automation create <id> [选项]
lo automation enable <id>
lo automation disable <id>
lo automation run [id]
lo automation history [id]
```

Automation 是 lo 的行为编排层：描述"在什么条件下，由什么触发，自动执行什么行为"。它不直接修改资源，所有变化经由已有系统（ResourceService / OperationEngine / Workflow / Suggestion）执行。

### 子命令

| 命令 | 说明 |
| --- | --- |
| `lo automation list` | 列出所有自动化（含内置与用户定义） |
| `lo automation show <id>` | 查看自动化详情（trigger / condition / actions / policy） |
| `lo automation create <id>` | 创建自动化定义 |
| `lo automation enable <id>` | 启用自动化 |
| `lo automation disable <id>` | 停用自动化 |
| `lo automation run [id]` | 手动运行自动化（缺省运行内置知识维护） |
| `lo automation history [id]` | 查看执行历史 |

### 创建选项

| 选项 | 说明 |
| --- | --- |
| `--name <name>` | 显示名称 |
| `--description <desc>` | 描述 |
| `--trigger <json>` | Trigger JSON，如 `{"type":"schedule","schedule":{"cadence":"daily","time":"22:00"}}` |
| `--type <type>` | 默认 Action 类型（缺省 `knowledge.maintenance`） |
| `--actions <json>` | Actions JSON 数组 |
| `--condition <expr>` | 条件表达式，如 `resource.type == "book"` |
| `--source <src>` | 来源：`builtin` / `user` / `agent` / `plugin` |
| `--risk <low\|high>` | 风险级别 |
| `--require-approval` | 高风险动作是否需要批准（走 Suggestion Pipeline） |

### Trigger 类型

- **schedule** — 定时触发：`{ "type": "schedule", "schedule": { "cadence": "daily"|"weekly"|"monthly", "time": "HH:MM", "cron": "分 时 日 月 周" } }`
- **event** — 事件触发：`{ "type": "event", "event": "resource.created" }`，可用 `match` 按 `resourceType` / `workflow` / `to` 过滤
- **external** — 外部显式触发（CLI / 插件 / Agent）

### Action 类型

- `resource.query` / `resource.link` / `resource.tag` / `resource.updateMetadata` / `resource.create` / `resource.update`
- `resource.delete` / `resource.move` / `resource.merge` — 高风险动作，`--require-approval` 时转为 Suggestion 等待批准
- `workflow.attach` / `workflow.detach` / `workflow.transition`
- `suggestion.create`
- `plugin.invoke`
- `agent.execute`
- `knowledge.maintenance` / `knowledge.scan` / `knowledge.health` / `knowledge.report` / `knowledge.repair`

### 示例

```
# 列出所有自动化
lo automation list

# 创建每日 22:00 的知识维护自动化
lo automation create knowledge.nightly --trigger '{"type":"schedule","schedule":{"cadence":"daily","time":"22:00"}}'

# 创建资源创建事件触发的自动化
lo automation create on.new --trigger '{"type":"event","event":"resource.created"}' --type resource.query

# 运行内置知识维护
lo automation run

# 查看执行历史
lo automation history
```

### 内置自动化

仓库初始化时自动注册并启用 `knowledge.maintenance.daily`：

- 每天 03:00 运行知识维护（扫描遗忘资源、检测知识健康、生成维护建议）
- 等价旧 `lo automation run` 完整管线
- 可直接通过 `lo automation run knowledge.maintenance.daily` 手动触发

### 执行模型

```
Trigger发生 → 加载 Automation Definition → 检查 Condition
→ 生成 Execution Context → 执行 Action → 记录 Execution Event → 完成
```

- 调度：`RuntimeScheduler`（何时运行）→ `AutomationScheduler`（哪些自动化）→ `AutomationEngine`（怎么执行）
- 执行历史记录于 `automation_runs` 表（trigger_source / execution_context / actions_result）
- 条件为空时直接执行；条件不满足则记录 `skipped`
- 单步失败隔离，除非 `failFast`；高风险动作在 `requireApproval` 策略下不直接执行

### 相关命令

- [knowledge](knowledge.md) — 知识智能分析套件
- [suggestion](suggestion.md) — AI 建议管理
- [workflow](workflow.md) — Workflow 过程模型系统
- [event](event.md) — 事件总线
- lo docs knowledge
