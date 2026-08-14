## 标签与分类

lo 提供两种互补的组织方式：标签（Tags）和分类（Category）。

### 标签 vs 分类

| 维度 | 标签（tag）| 分类（category）|
|------|----------|---------------|
| 数量 | 多条（数组）| 一条（唯一）|
| 含义 | 交叉维度、自由标注 | 归属、文件夹式层级分类 |
| 类比 | Gmail 标签 | 文件路径（父/子/孙）|
| 命令 | `lo tag add/rm/list` | `lo category set/rm/list/tree` |

### 分类系统

#### 多级分类

分类支持用 `/` 分隔的层级路径：

```
单级: 编程
多级: 编程/Python/爬虫
```

分类在数据库中是路径式字符串（存在 `metadata.category` 字段），不是文件夹结构。`lo category tree` 以树形图展示父子层级关系。

> **标签与分类的存储差异**：分类（category）存储在 `metadata` JSON 列中；标签（tags）自 V24 起已独立为 `resource_tags` 表，不再存在 metadata JSON 中。

#### 默认分类

创建资源时自动分配默认分类：

- 笔记类型（note）→ 默认为"未分类"
- 非笔记类型（图片、PDF 等）→ 默认为"其他资源"

可通过配置修改默认值：

```bash
lo config add category.defaultNote "我的笔记"
lo config add category.defaultOther "附件"
```

显式指定 `--category` 时始终优先于默认值。

#### 分类命令

```bash
# 设置分类
lo category set res_abc 编程
lo category set res_abc 编程/Python

# 移除分类
lo category rm res_abc

# 查看当前分类
lo category list res_abc

# 列出所有分类（扁平）
lo category list

# 树形展示父子层级
lo category tree

# 按分类过滤
lo list --category 编程
```

### 标签系统

#### 基本操作

```bash
# 添加标签
lo tag add res_abc 前端
lo tag add res_abc 性能优化

# 移除标签
lo tag rm res_abc 性能优化

# 查看标签
lo tag list res_abc

# 列出所有标签
lo tag list

# 按标签过滤
lo list --tag 前端
```

#### 内联标签语法

在笔记正文中直接使用 `#标签名` 即可创建标签：

```markdown
这是一条关于 #React 和 #性能优化 的笔记
```

`lo sync` 会自动从内容中提取标签并写入数据库。

### 迁移已有笔记的标签和分类

新版本中，`lo tag` 和 `lo category` 命令通过暂存区管理元数据变更：

1. `lo tag add/rm` 和 `lo category set/rm` 将变更写入暂存区
2. `lo status` 在暂存区显示元数据变更
3. `lo commit` 提交后，变更合入 SQLite

```bash
lo tag add res_abc 前端
lo status
# → 暂存元数据变更:
#      标签: res_abc → +前端
lo commit -m "添加前端标签"
```

### 使用建议

- **标签**：用于跨分类的主题标注，如"前端"、"性能优化"、"待复习"
- **分类**：用于笔记的层级归属，如"编程/Python"、"读书笔记/文学"
- 多级分类适合精细化组织，但不宜过深（建议 1-3 级）
- 标签可以多对多，一个资源可以有任意多个标签
- 修改标签和分类会产生 `resource_updated` 操作日志，可跨设备同步

### 相关命令

- `lo tag add/rm/list` — 标签操作
- `lo category set/rm/list/tree` — 分类操作
- `lo list --tag` / `lo list --category` — 按标签/分类过滤
- `lo config` — 修改默认分类设置

### 相关文档

- [资源模型](resource-model.md) — metadata 中的 tags 和 category 字段
- [版本控制](version.md) — 元数据变更的暂存与提交
- [配置系统](config.md) — 修改默认分类值
