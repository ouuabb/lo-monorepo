## runtime — Knowledge Runtime

**用法:** `lo runtime <子命令>`

Phase 6.10 Knowledge Runtime — Knowledge OS 的长期运行核心。将所有子系统整合为一个自治运行系统。

### 运行时架构

```
Knowledge Runtime
      │
      ├── RuntimeKernel    — 系统核心（启动/停止/生命周期）
      ├── RuntimeState     — 状态管理（created→starting→running→paused→stopping→stopped）
      ├── RuntimeLoop      — 主循环（Observe→Analyze→React→Execute→Learn→Repeat）
      ├── RuntimeScheduler — 统一调度（startup/interval/cron/event）
      ├── RuntimeRegistry  — 对象注册中心（Resource/Agent/Workflow/Plugin）
      ├── RuntimeStore     — 状态持久化
      ├── RuntimeMonitor   — 运行监控
      ├── RuntimeContext   — 统一上下文（整合所有子系统引用）
      ├── ResourceRuntime  — 资源运行时（静态→Runtime Object，带生命周期）
      ├── KnowledgeRuntime — 知识生命周期（Birth→Growth→Connection→Usage→Evolution）
      └── RuntimeEvolution — 运行时演化（检测→建议→应用）
```

### 子命令

#### status — 查看状态

```
lo runtime status
```

显示 Runtime 运行状态，包括资源数、Agent 数、工作流数、事件数、运行时间。

#### start — 启动

```
lo runtime start
```

启动 Knowledge Runtime，初始化所有子系统，启动主循环和调度器。

#### stop — 停止

```
lo runtime stop
```

停止 Knowledge Runtime，关闭主循环和调度器。

#### monitor — 监控面板

```
lo runtime monitor
```

显示实时监控数据、趋势分析和最近快照。

#### evolve — 知识演化

```
lo runtime evolve
```

分析知识状态，检测孤立资源、未分析资源、演化停滞等问题，生成改进建议。

### 数据库表

V23 迁移新增 3 张表：

| 表名 | 用途 |
|------|------|
| `runtime_instances` | Runtime 实例（id/type/state） |
| `runtime_events` | Runtime 事件（runtime_id/event/payload） |
| `runtime_state` | 全局状态存储（key/value） |

### 调度任务

Runtime 内置两个默认任务：

| 任务 | 频率 | 作用 |
|------|------|------|
| `runtime:snapshot` | 30 秒 | 定期快照系统状态 |
| `runtime:evolution` | 60 秒 | 检测知识改进机会 |

### 生命周期状态

```
created → starting → running ↔ paused
                         ↓
                      stopping
                         ↓
                       stopped → starting (restart)
```

### 示例

```
# 启动
lo runtime start

# 查看状态
lo runtime status

# 监控
lo runtime monitor

# 演化建议
lo runtime evolve

# 停止
lo runtime stop
```

### 注意事项

- Runtime 需在仓库上下文中运行（`lo init` 后）
- 停止后主循环和调度器会关闭，但数据保留
- restart 会完整停止再启动，状态会重置

### 相关命令

- [evolution](evolution.md) — 自演化系统（Phase 6.8）
- [security](security.md) — 安全系统（Phase 6.9）
- [agent](agent.md) — Agent 系统（Phase 6.5）
- [workflow](workflow.md) — Workflow 过程模型系统
