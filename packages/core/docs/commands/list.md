## list — 列出所有资源（资源视图）

**用法:** `lo list [--type <类型>] [--status] [--tag <标签>] [--category <分类>] [--limit <数量>] [--format <格式>]`

以数据库为唯一真相来源，显示所有 Resource。

**与 lo files 的区别:**

| 命令 | 说明 |
|------|------|
| `lo list` | 资源视图，显示所有 Resource（含容器、虚拟资源等非文件资源） |
| `lo files` | 文件视图，仅显示 resources/ 目录下的可操作文件 |

**显示内容:**
- **File Resource:** 在 resources/ 目录下有对应文件的资源，显示状态标识
- **Container Resource:** 以 [容器] 标记，拥有 container capability 的资源
- **Virtual Resource:** 以 [虚拟] 标记，无对应文件的纯数据资源（未来扩展）

**状态标识:**

| 状态 | 说明 |
|------|------|
| 新增 | 暂存区新增 |
| 修改 | 未暂存修改（文件 hash 与 DB 记录不一致） |
| 删除 | 已暂存或已删除 |
| 未跟踪 | 文件系统中存在但未入库（含插件扩展类型，如安装 epub-reader 后 `.epub` 文件会显示为未跟踪） |

### 选项

| 选项 | 说明 |
|------|------|
| `--type` | 按资源类型过滤 (note, image, project 等) |
| `--status` | 仅显示有状态变更的资源（暂存新增/修改/删除、未跟踪等；布尔开关） |
| `--tag` | 按标签过滤 |
| `--category` | 按分类目录过滤 |
| `--limit` | 限制输出数量（默认: 20） |
| `--format` | 输出格式: table（默认）、json、list |

### 示例

```bash
lo list                          # 列出所有 Resource
lo list --type project           # 只列出项目容器
lo list --status                 # 仅显示有状态变更的
lo list --format json            # JSON 格式输出
```

### 相关命令

- [files](./files.md) — 文件视图
- [show](./show.md) — 查看资源内容
