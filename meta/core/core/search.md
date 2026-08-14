## 搜索系统

lo 提供全文搜索功能，帮助在海量资源中快速定位内容。

### 搜索架构

lo 的搜索基于两层体系：

1. **SQLite LIKE 查询** — `lo find` 命令的底层实现，通过 `queryEngine.cjs` 进行
2. **Fuse.js 模糊搜索** — 旧搜索引擎（`search.cjs`），逐步被 SQL LIKE 替代

> 目前尚未启用 SQLite FTS5 全文索引。搜索使用 `metadata LIKE '%keyword%'` 进行全表扫描，在小规模（< 5000 资源）下表现良好。

> **P3 插件数据源聚合**：`lo find` 在核心 SQL LIKE 搜索后，会查询所有已注册的 `searchProviders` 扩展点并合并结果（去重 / 过滤 / 错误隔离），使插件可向搜索暴露自定义数据源。详见 [插件系统 / searchProviders](../systems/plugin.md)。

### lo find 命令

```bash
# 基本搜索
lo find "关键词"

# 限制结果数量
lo find "关键词" --limit 5

# 按类型过滤
lo find "关键词" --type note

# 搜索词可以匹配笔记标题和内容
lo find "闭包"
```

### 搜索范围

`lo find` 在以下字段中搜索：
- `metadata.title`：笔记标题
- 文件内容：Markdown 正文（通过解密后匹配）
- `resource_tags` 表：标签名称（通过 JOIN）

### 搜索精度

- 当前使用 SQL `LIKE` 进行子串匹配
- 不支持中文分词
- 不支持布尔运算符（AND/OR/NOT）
- 不区分大小写（但中文无此概念）

### 搜索性能

| 仓库大小 | 搜索表现 |
|---------|---------|
| < 1000 资源 | 即时响应 |
| 1000 - 5000 | 良好，< 1 秒 |
| 5000 - 10000 | 可感知延迟，建议开启 FTS |
| 10000+ | LIKE 搜索不可用，必须启用 FTS5 |

### 未来规划

第一优先级搜索优化方案：
1. 启用 SQLite FTS5 全文索引
2. 构建内存搜索索引（Map<title → rid>）
3. 支持中文分词（jieba / 其他分词器）
4. 支持高级搜索语法（tag:、type:、date:）

### 通过 HTTP API 搜索

```bash
# 启动服务
lo serve

# 通过 API 搜索
curl -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:8765/api/search?q=关键词"
```

### 相关命令

- `lo find` — CLI 搜索
- `lo list --tag 前端` — 按标签过滤
- `lo list --status draft` — 按状态过滤
- `lo list --category 编程` — 按分类过滤

### 相关文档

- [数据库结构](database.md) — 存储与索引
- [标签与分类](tags-categories.md) — 标签和分类的组织方式
- [API 参考](../reference/api.md) — 搜索 API 端点
