## category — 管理分类

**用法:** `lo category <set|rm|list|tree> [rid|路径] [分类名]`

对资源进行分类的设置、移除、查询和树形展示。

分类变更走暂存区工作流，设置/移除后需 `lo commit` 提交才生效。分类是单值字段，支持路径式多级分类（用 `/` 分隔），如 `编程/Python/爬虫`。`lo category tree` 以树形图展示所有分类的父子层级关系。

### 子命令

| 子命令 | 说明 |
|--------|------|
| `set` | 暂存分类设置（需 commit），支持多级: 父/子/孙 |
| `rm` | 暂存分类移除（需 commit） |
| `list` | 无参数: 列出所有分类（扁平）；带 rid: 查看单个资源分类 |
| `tree` | 树形展示所有分类的父子层级关系 |

### 示例

```
lo category set res_abc 编程                      # 设置一级分类
lo category set res_abc 编程/Python/爬虫          # 设置多级分类
lo category rm res_abc                           # 暂存分类移除
lo category list res_abc                         # 查看当前分类
lo category list                                 # 列出所有分类
lo category tree                                 # 树形展示父子关系
lo commit -m "更新分类"                           # 提交元数据变更
```

### 注意事项

- 分类是单值字段，每个资源只能有一个分类
- 分类变更属于元数据变更，走暂存区工作流
- 多级分类用 `/` 分隔，如 `编程/Python/爬虫`
- 创建资源时的默认分类: 笔记归入"未分类"，其他类型归入"其他资源"
- 可通过 `lo config add category.defaultNote "名称"` 自定义默认分类

### 相关命令

- [tag](tag.md) — 管理标签
- [move](move.md) — 移动资源
