## new — 创建新资源

**用法:** `lo new <标题> [--type <类型>] [--tags <标签>] [--category <分类>] [--template <模板>] [--encrypt]`

创建新的资源文件（不入库，入库在 lo add + lo commit 时完成）。

**rid 一等公民:** 创建时不生成 rid，rid 在首次 commit 时分配。所有后续操作以 rid 为第一主键，支持 rid / name / path 三级查找。

**同名处理:** 如果已有同名活跃资源（layer=0），新文件将自动入栈（layer>=1）。使用 lo stack 命令管理栈中副本。

**文件命名:** YYYY-MM-DD-标题-随机8位.md（防止磁盘同名冲突）

**存储位置:** resources/ 目录

**加密行为:** 默认明文创建，文件可直接编辑。使用 `--encrypt` 选项加密当前文件；全仓库加密模式（`lo init --encrypt`）下自动加密。

**默认分类:**
- 笔记类型（note）自动归入默认分类，默认为 "未分类"
- 非笔记类型（图片、PDF 等）自动归入 "其他资源"
- 可通过 lo config add category.defaultNote "名称" 自定义默认分类
- --category 显式指定时始终优先于默认值

### 选项

| 选项 | 说明 |
|------|------|
| `--type` | 资源类型（默认: note），可选: note, pdf, image, video, audio, html, text |
| `--tags` | 标签，多个标签用逗号分隔 |
| `--category` | 分类名，支持多级路径如 编程/Python/爬虫 |
| `--template` | 模板名，读取 `templates/<模板>.md.template` 生成内容（替换 `{{title}}` / `{{date}}` 占位符；模板不存在时回退默认内容） |
| `--encrypt` | 加密当前文件（默认为明文创建） |

### 示例

```bash
lo new "理解闭包"                                # 明文笔记（默认）
lo new "密码清单" --encrypt                       # 加密笔记
lo new "架构图" --type image                     # 创建图片（自动"其他资源"）
lo new "React笔记" --tags "前端,React"            # 带标签
lo new "爬虫技巧" --category 编程/Python/爬虫     # 多级分类
lo new "周一计划" --category "工作/周报"           # 指定分类
lo new "周报" --template weekly                  # 使用 templates/weekly.md.template
```

> 初始化（`lo init`）会预置 `templates/default.md.template` 与 `templates/daily.md.template` 两个模板，模板为纯文本并支持 `{{title}}` / `{{date}}` 占位符。

### 注意事项

创建后文件在磁盘但不入库，lo add + lo commit 时才分配 rid 并入栈。

### 相关命令

- [add](./add.md) — 添加文件到暂存区
- [commit](./commit.md) — 提交暂存区
- [stack](./stack.md) — 管理资源栈
- [config](./config.md) — 管理配置
- [category](./category.md) — 管理分类
