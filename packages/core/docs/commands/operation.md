## operation — 操作管理

**用法:** `lo operation <types>`

查看仓库注册的操作类型清单。

### 子命令

- `types` — 列出所有已注册的操作类型（新增、修改、删除、重命名、提升、降级、撤销等）

### 示例

```
lo operation types
```

### 工作机制

操作类型来自 `src/operations/` 目录自动加载的 handler（`loadOperations` 注册到仓库的 `operationRegistry`，见 `src/operations/index.cjs`），涵盖容器成员操作（`member.*`）、关系操作（`relation.*`）、资源生命周期操作（`resource.create/update/delete/move`）、Schema / View / Automation 定义操作（`schema.*` / `view.*` / `automation.*`）与工作流状态转换（`workflow.transition`）。

每个 handler 由 `execute`（正向执行）与 `undo`（逆向恢复）组成，所有变更经 OperationEngine 记录到 `container_operations` 审计表，可被 `lo undo <operation>` 或 `lo container transaction undo` 回滚。

### 相关命令

- [container](container.md) — 容器管理（member 操作 / transaction）
- [undo](undo.md) — 撤销容器操作
