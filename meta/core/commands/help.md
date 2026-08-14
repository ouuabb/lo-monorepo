## help — 查看帮助

**用法:** `lo help`

显示简洁的命令列表和分类概览。命令信息自动从 `docs/commands/*.md` 文件中提取——MD 是文档的唯一真相源。

与 `lo manual` 的区别在于 help 提供简短的一行描述，manual 提供完整的手册。两者读取的是同一份 MD 文件。

### 示例

```
lo help
```

### 注意事项

- `lo help` 输出简洁分类概览，适合快速查找命令名
- `lo manual <命令名>` 输出详细用法、选项、示例和注意事项
- `lo manual`（无参数）输出与 `lo help` 类似的概览

### 相关命令

- [manual](manual.md) — 命令参考手册（详细版）
- lo docs — 项目功能详解
