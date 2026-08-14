## 事件总线（Phase 6.2）

### 一、概述

lo 事件总线基于发布-订阅（Pub/Sub）模式，是系统各组件之间松耦合通信的核心基础设施。所有资源变更、同步操作、插件事件等都通过事件总线广播。

**核心组件：**

| 组件 | 说明 |
|------|------|
| EventBus | 事件发布与订阅核心，支持通配符监听 |
| EventStore | 事件持久化存储（SQLite events 表） |
| MiddlewareChain | 中间件链，事件处理管道（beforeEmit → beforeHandler → afterHandler → afterEmit） |
| EventRegistry | 事件类型注册表 |

### 二、事件类型

系统事件分为以下几个层级：

**资源层事件：**
- `resource.created` — 资源创建
- `resource.updated` — 资源更新
- `resource.deleted` — 资源删除
- `resource.tagged` — 标签变更

**关系层事件：**
- `relation.created` — 关系建立
- `relation.deleted` — 关系解除

**同步层事件：**
- `sync.before-push` — 推送前
- `sync.after-push` — 推送后
- `sync.before-pull` — 拉取前
- `sync.after-pull` — 拉取后

**系统层事件：**
- `repo.opened` — 仓库打开
- `repo.closing` — 仓库关闭
- `plugin.loaded` — 插件加载
- `plugin.unloaded` — 插件卸载

### 三、中间件管道

事件处理管道支持中间件链，在事件到达订阅者之前进行预处理：

```
事件发布
  │
  ▼
中间件1 → 中间件2 → ... → 中间件N
  │
  ▼
事件存储（持久化）
  │
  ▼
订阅者回调
```

**中间件生命周期：**

1. **beforeEmit**：在事件持久化之前运行，可以修改事件内容或阻止事件发布（返回 null/false）
2. **beforeHandler**：在每个 handler 执行前运行，可以阻止特定 handler 执行
3. **afterHandler**：在每个 handler 执行后运行
4. **afterEmit**：在所有 handler 执行完毕后运行

**内置中间件：**
- 日志中间件：记录所有事件
- 限流中间件：防止高频事件风暴
- 校验中间件：验证事件格式

### 四、事件持久化

事件默认持久化到 SQLite `events` 表，支持：

- 事件历史查询
- 事件重放（replay）
- 事件统计（按类型/来源聚合）

**events 表结构：**

| 字段 | 说明 |
|------|------|
| id | 事件唯一 ID |
| type | 事件类型（如 `resource.created`） |
| payload | 事件负载（JSON） |
| source | 事件来源 |
| timestamp | 时间戳 |
| metadata | 附加元数据 |

### 五、高级特性

**通配符监听：**

EventBus 支持通配符模式匹配：
- `resource.*` — 匹配所有资源层事件（`resource.created`、`resource.updated`、`resource.deleted` 等）
- `*` — 匹配所有事件类型

**一次性监听（once）：**

```bash
lo event once resource.created
```

监听器在触发一次后自动移除。

**错误隔离：**

- 单个 handler 失败不影响其他 handler 执行
- 所有 handler 异步执行（fire-and-forget）
- handler 错误被捕获并记录，不会传播到调用方

---

**相关文档：**

- [插件系统](plugin.md) — 插件通过事件总线通信
- [Workflow 状态机](workflow.md) — 状态转换产生事件供消费
- [知识智能体](agent.md) — Agent 响应事件自动执行
