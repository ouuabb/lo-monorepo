## find — 搜索资源

**用法:** `lo find <关键词> [--limit <数量>] [--type <类型>]`

全文搜索资源标题和内容。搜索范围覆盖资源标题（数据库中）和内容关键词，支持加密文件的透明搜索。

### 选项

- `--limit <数量>` — 结果数量限制（默认: 10）
- `--type <类型>` — 按资源类型过滤（note、image、pdf 等）

### 示例

```
lo find "闭包"                            # 搜索关键词
lo find "React" --type note               # 搜索笔记
lo find "分布式" --limit 20               # 限制结果数
```

### 工作机制

- 搜索标题（数据库中 name 字段）和内容文本
- 加密文件搜索时自动解密后匹配关键词
- 结果按相关度排序
- **插件数据源聚合（P3）**：执行核心搜索后，`lo find` 会查询所有已注册的 `searchProviders` 扩展点并合并结果。插件来源的结果行尾追加 `[<providerKey>]` 标记，核心结果无标记。按 `rid`（优先）/ `path` 去重，`--type` 与 `--limit` 在聚合后的全集上统一应用。单个 provider 抛错被隔离（记录日志后跳过），不影响核心搜索与其他 provider；插件系统初始化失败时回退为仅核心搜索。详见 [插件系统 / searchProviders](../systems/plugin.md)

### 注意事项

- 搜索基于全文匹配，非语义搜索
- 加密文件需要仓库处于已解密状态才能搜索

### 相关命令

- [list](list.md) — 列出所有资源
- lo serve — 提供 HTTP API 搜索端点（GET /api/search）
