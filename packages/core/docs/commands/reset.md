## reset — 取消暂存

**用法:** `lo reset [路径]`

取消文件的暂存状态，或清空整个暂存区。

**用法:**
- `lo reset <路径>` — 取消指定文件的暂存
- `lo reset HEAD` — 清空整个暂存区

### 示例

```bash
lo reset "resources/笔记.md"    # 取消单个文件暂存
lo reset HEAD                   # 清空所有暂存
```

### 相关命令

- [add](./add.md) — 添加文件到暂存区
- [commit](./commit.md) — 提交暂存区
