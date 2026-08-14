## undo — 撤销容器操作

**用法:** `lo undo <operation>`

撤销一次容器操作（如 member 的 rename / remove / restore / move / copy 等），将容器成员恢复到操作前的状态。

> `undo` 是 `lo container member ...` 系列操作的逆操作。操作 ID 可通过 `lo container member history <path>` 或 `lo container history` 查看。

### 示例

```
lo undo op_xxx                          # 撤销指定操作
lo container member history res_xxx     # 先查看操作历史，获取操作 ID
```

### 工作机制

- 撤销通过**逆操作**实现：系统根据原操作的类型生成一条反向操作并执行（如 `rename` 的反向是改回原名、`remove` 的反向是 `restore`）
- 撤销成功后会记录一条新的操作记录（`undo.*` 类型），同样可在历史中查看
- 撤销结果会打印原操作 ID 与生成的撤销操作 ID

### 注意事项

- 需要先指定操作 ID，未指定时报错
- 某些操作可能无法撤销（如操作已失效、目标状态不再满足或属于不可逆删除），此时命令报错退出
- 撤销由 OperationEngine 统一执行：所有经 `operationRegistry` 注册的操作类型（`member.*` / `relation.*` / `resource.*` / `schema.*` / `view.*` / `automation.*` / `workflow.transition`）都自带 `undo` 逆操作
- **可撤销**：`resource.create`（软删除）、`resource.update`、`resource.move`、`schema.create`、`schema.update`、`view.create`、`view.update`、`automation.create`、`automation.update`、`workflow.transition`
- **不可撤销**（引用已级联或属于硬删除，会显式报错）：`schema.delete`、`view.delete`、`automation.remove`

### 相关命令

- [container](container.md) — 容器管理（member history / transaction undo）
- [operation](operation.md) — 查看已注册的操作类型
- [log](log.md) — 查看提交历史
