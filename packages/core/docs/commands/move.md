## move — 移动资源

**用法:** `lo move <rid|路径> <目标路径>`

将资源文件移动到新的位置，同时更新数据库中的路径。

### 查找机制

rid 精确匹配 > name 查找活跃层 > path 降级匹配。

### 示例

```
lo move res_abc "resources/archived/旧笔记.md"
lo move "resources/笔记.md" "resources/done/笔记.md"
```

### 注意事项

- 移动操作直接生效，不走暂存区
- 目标路径必须在 resources/ 目录下
- 移动后 RID 保持不变，wikilink 引用不受影响

### 相关命令

- [tag](tag.md) — 管理标签
- [category](category.md) — 管理分类
