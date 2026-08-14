## stats — 显示统计信息

**用法:** `lo stats [--today] [--week]`

显示资源仓库的统计数据，包括资源总数、各类型数量、标签分布等。

### 选项

| 选项 | 说明 |
|------|------|
| `--today` | 只统计今天（预留选项，当前版本暂未生效） |
| `--week` | 只统计本周（预留选项，当前版本暂未生效） |

### 示例

```
lo stats
lo stats --today        # 预留：统计今天
lo stats --week         # 预留：统计本周
```

### 输出内容

统计内容包括但不限于:
- 资源总数
- 各类型资源数量（note、image、pdf 等）
- 标签分布情况
- 最近活动时间

### 相关命令

- [index](index.md) — 生成仓库索引文件
- lo serve — 提供 HTTP API 统计端点（GET /api/stats）
