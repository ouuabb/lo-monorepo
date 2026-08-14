## rm — 暂存文件删除

**用法:** `lo rm <路径>`

将文件标记为待删除，添加到暂存区的 deleted 列表。

**与 delete 的区别:**

| 命令 | 说明 |
|------|------|
| `lo rm` | 暂存删除操作，需配合 lo commit 才能生效 |
| `lo delete` | 直接对数据库执行删除（跳过暂存区） |

### 示例

```bash
lo rm "resources/旧笔记.md"          # 暂存删除
lo rm resources/2024-01-01-笔记.md   # 暂存删除
```

### 相关命令

- [add](./add.md) — 添加文件到暂存区
- [commit](./commit.md) — 提交暂存区
- [reset](./reset.md) — 取消暂存
- [delete](./delete.md) — 直接删除资源
