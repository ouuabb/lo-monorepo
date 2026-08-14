## resource — 资源关系查询

**用法:** `lo resource <related|backlinks|impact> [rid|name|路径] [选项...]`

查询资源的关联关系，包括正向引用、反向链接和影响范围分析。

### 子命令

#### lo resource related `<rid|name|路径>`

列出指定资源通过 link 和 wikilink 正向关联的所有资源。

即"我链接了谁"——从当前资源出发的所有出边关系。

#### lo resource backlinks `<rid|name|路径>`

列出所有引用了指定资源的反向链接。

即"谁链接了我"——指向当前资源的所有入边关系。反向链接由系统自动维护，当 A 链接 B 时，B 也自动获得指向 A 的反向链接。

#### lo resource impact `<rid|name|路径>`

分析资源的变更影响范围。

展示如果该资源被修改或删除，哪些其他资源会受到影响（即通过引用链间接依赖该资源的所有资源）。

### 查找机制

rid 精确匹配 > name 查找活跃层 > path 降级匹配。

### 示例

```
lo resource related res_abc123        # 查看该资源链接了谁
lo resource related 笔记测试            # 按名称查看正向关联
lo resource backlinks res_abc123      # 查看谁链接了该资源
lo resource impact res_abc123         # 分析变更影响范围
```

### 注意事项

- 关系数据来源于 relations 表（包含 link 和 wikilink 两种类型）
- [[wikilink]] 的关系由 `lo sync --wikilinks` 自动解析维护
- 手动链接通过 `lo link`/`lo unlink` 管理

### 相关命令

- [link](link.md) — 建立资源链接
- [unlink](unlink.md) — 解除资源链接
- [sync](sync.md) — 同步 wikilink 关系
