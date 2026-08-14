## event — 事件总线

**用法:** `lo event <list|history|listeners|replay> [选项...]`

查看和管理 lo 事件总线系统。事件总线基于发布-订阅模式，支持中间件链和事件持久化。所有资源变更、同步操作等都通过事件总线广播。

### 子命令

- `list` — 列出事件（可按 type/source 过滤）
- `history` — 事件统计（按类型聚合计数）
- `listeners [type]` — 查看事件监听器
- `replay [id]` — 事件回放

### 选项

**list:**
- `--type <事件类型>` — 按事件类型过滤
- `--source <来源>` — 按来源过滤
- `--limit <数量>` — 数量限制（默认: 20）

**replay:**
- `--limit <数量>` — 回放数量限制（默认: 20）
- `id` — 从指定事件开始回放（不指定则回放全部）

### 示例

```
lo event list                          # 查看最近事件
lo event list --type resource.created  # 按类型过滤
lo event history                       # 事件统计
lo event listeners                     # 查看所有监听器
lo event listeners resource.updated    # 按事件类型查看监听器
lo event replay                        # 回放最近事件
lo event replay evt_001                # 从指定事件开始回放
```

### 工作机制

- **发布-订阅模式**: 系统各模块通过事件总线通信，解耦组件
- **中间件链**: 事件在发布和订阅之间经过中间件链处理
- **事件持久化**: 事件存储在数据库中，支持回溯查询和回放
- **事件类型规范**: 使用 `namespace.action` 命名约定（如 `resource.created`、`resource.updated`）

### 注意事项

- 事件总线是 Phase 6 扩展系统的核心基础设施
- 插件、工作流等通过事件总线实现松耦合
- 事件回放仅展示历史，不会触发副作用

### 相关命令

- [plugin](plugin.md) — 插件系统管理
- lo docs event
