## unlink — 解除资源链接

**用法:** `lo unlink <源> <目标> [--type <类型>]`

解除两个资源之间的双向引用关系。

### 链接类型

| 类型 | 说明 |
|------|------|
| `reference` | 引用关系（默认） |

### 选项

| 选项 | 说明 |
|------|------|
| `--type` | 链接类型（默认: reference） |

### 示例

```
lo unlink res_abc res_xyz                     # 解除引用
lo unlink res_abc res_xyz --type reference
```

### 注意事项

- 解除链接是双向操作，双方的关联关系都会被移除

### 相关命令

- [link](link.md) — 建立资源链接
