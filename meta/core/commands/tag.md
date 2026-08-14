## tag — 管理标签

**用法:** `lo tag <add|rm|list> <rid|路径> [标签]`

对资源进行标签的添加、移除和查询操作。

标签变更走暂存区工作流，添加/移除后需 `lo commit` 提交才生效。多次操作会累积在暂存区，`lo tag list` 会显示暂存中未提交的变更。

### 子命令

| 子命令 | 说明 |
|--------|------|
| `add` | 暂存标签添加（需 commit） |
| `rm` | 暂存标签移除（需 commit） |
| `list` | 列出资源的所有标签（含暂存提示） |

### 示例

```
lo tag add res_abc "前端"                       # 暂存标签添加
lo tag rm res_abc "前端"                        # 暂存标签移除
lo tag list res_abc                             # 列出所有标签
lo commit -m "更新标签"                          # 提交元数据变更
```

### 注意事项

- 标签变更属于元数据变更，走暂存区工作流
- 多个标签用逗号分隔（创建时）或空格分隔（tag 命令中）
- `lo tag list` 不带 rid 可查看仓库中所有标签
- 提交后标签变更才会写入数据库

### 相关命令

- [category](category.md) — 管理分类
- [move](move.md) — 移动资源
