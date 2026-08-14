# Knowledge Runtime

Phase 6.10: Knowledge Runtime — Knowledge OS 的长期运行核心

## 核心架构

```
Knowledge Runtime
      │
      ├── RuntimeKernel    — 启动/停止/重启/暂停/恢复
      ├── RuntimeState     — 状态机（6 种状态）
      ├── RuntimeLoop      — 主循环（Observe→Analyze→React→Execute→Learn）
      ├── RuntimeScheduler — 统一调度器
      ├── RuntimeRegistry  — 对象注册中心
      ├── RuntimeStore     — 状态持久化
      ├── RuntimeMonitor   — 运行监控 + 趋势分析
      ├── RuntimeContext   — 统一上下文
      ├── ResourceRuntime  — 资源运行时
      ├── KnowledgeRuntime — 知识生命周期
      └── RuntimeEvolution — 运行时演化
```

## 生命周期状态

```
created → starting → running ↔ paused
                         ↓
                      stopping
                         ↓
                       stopped → starting (restart)
```

## 主循环

每次 tick（默认 1 秒）：

1. **Observe** — 收集系统快照
2. **Analyze** — 分析待处理事件/任务
3. **React** — 决定响应策略
4. **Execute** — 执行操作
5. **Learn** — 记录结果用于学习

## 统一调度器

内置两个默认任务：

| 任务 | 频率 | 作用 |
|------|------|------|
| `runtime:snapshot` | 30 秒 | 定期快照系统状态 |
| `runtime:evolution` | 60 秒 | 检测知识改进机会 |

## ResourceRuntime

静态 Resource → 动态 Runtime Object：

```
Created → Indexed → Linked → Analyzed → Evolved
```

每个阶段可注册自定义行为（behavior）：

```javascript
const resource = kernel.promote('note:123', 'markdown', { title: 'My Note' });
resource.registerBehavior('analyze', async (self) => { /* 自定义分析 */ });
await resource.executeBehavior('analyze');
```

## RuntimeMonitor

监控能力：

- `status()` — 当前状态（资源数/Agent 数/事件数/错误数/运行时间）
- `snapshot()` — 创建快照
- `history(n)` — 最近 n 次快照
- `trends()` — 趋势分析（资源变化/事件变化/任务变化）

## RuntimeEvolution

运行时演化检测：

1. **孤立资源检测** — 发现未连接的知识孤岛
2. **未分析资源** — 超过 70% 资源未分析时告警
3. **演化停滞** — 已分析但未演化的资源

## CLI

```
lo runtime status     — 查看状态
lo runtime start      — 启动
lo runtime stop       — 停止
lo runtime monitor    — 监控面板
lo runtime evolve     — 演化建议
```

## 数据库

V23 迁移：`runtime_instances` / `runtime_events` / `runtime_state`
