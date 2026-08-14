## files — 列出可操作文件（文件视图）

**用法:** `lo files [--type <类型>] [--status] [--tag <标签>] [--limit <数量>] [--format <格式>]`

仅显示 resources/ 目录下 lo 接管的文件资源及其版本状态。

**与 lo list 的区别:**

| 命令 | 说明 |
|------|------|
| `lo list` | 资源视图，从数据库获取所有 Resource |
| `lo files` | 文件视图，扫描 resources/ 目录，只显示有实际文件的资源 |

不显示: Container Resource、Virtual Resource 等非文件资源。

**状态标识:** 新增 / 修改 / 删除 / 未跟踪 / 已提交

### 选项

| 选项 | 说明 |
|------|------|
| `--type` | 按资源类型过滤 |
| `--status` | 仅显示有状态变更的文件 |
| `--tag` | 按标签过滤 |
| `--category` | 按分类目录过滤 |
| `--limit` | 限制输出数量（默认: 20） |
| `--format` | 输出格式: table（默认）、json、list |

### 示例

```bash
lo files                         # 列出所有文件
lo files --status                # 仅显示有变更的文件
lo files --type image            # 只列出图片文件
```

### 相关命令

- [list](./list.md) — 资源视图
- [add](./add.md) — 添加文件到暂存区
- [status](./status.md) — 查看工作区状态
