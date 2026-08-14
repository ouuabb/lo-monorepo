## link — 建立资源链接

**用法:** `lo link <源> <目标> [--type <类型>]`

在两个资源之间建立双向引用关系。

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
lo link res_abc res_xyz                       # 建立引用
lo link res_abc res_xyz --type reference
```

### 注意事项

- 链接是双向的，建立后双方都会记录关系
- 关系存储在 relations 表中
- 与 [[wikilink]] 的区别：lo link 是按 RID 精确指定，适合跨类型资源关联；wikilink 写在 .md 文件中按标题匹配

### 相关命令

- [unlink](unlink.md) — 解除资源链接
- [sync](sync.md) — 同步 wikilink 关系
