## sync — 同步资源

**用法:** `lo sync [--full] [--quiet] [--wikilinks]`

扫描文件系统，将变更同步到数据库。

`lo sync` 和 `lo add` + `lo commit` 对 resources 表的结果**完全等价**：新文件都会获得 RID 并入库，修改的文件都会更新 hash，删除的文件都会标记。区别在于 sync **不写** commits 表，因此 `lo log` 看不到 sync 的变更记录。

### 扫描范围

整个仓库目录（排除 node_modules、.git、.repo）。

### 同步策略

| 策略 | 说明 |
|------|------|
| 增量同步（默认） | 只扫描最后同步时间之后修改的文件 |
| 全量同步（`--full`） | 扫描所有文件，逐个检查变更 |
| 加密文件 | 先解密再计算明文散列，与数据库记录比较 |

### 检测内容

- **新文件**: 自动导入到数据库，.md 文件自动解析 [[wikilink]]
- **同名冲突**: 自动入栈（分配下一个空闲 layer），不覆盖已有资源
- **修改文件**: 更新数据库中对应的散列值，.md 文件自动更新 wikilink
- **重命名**: 匹配删除和新增的 hash，自动识别并保留 RID（wikilink 不受影响）
- **删除文件**: 标记数据库记录为已删除

### [[wikilink]] 自动解析

- .md 文件的 `[[链接目标]]` 语法会被自动解析为双向链接
- 链接基于文件标题（# 标题）匹配，如: `[[笔记B]]` 匹配标题为"笔记B"的 .md 文件
- 支持别名语法: `[[真实标题|显示别名]]`，别名仅影响显示不影响链接
- 非 .md 文件不参与 wikilink 解析（可用 `lo link` 手动建立关系）
- wikilink 关系存储在 relations 表中（type='wikilink'）
- 反向链接自动维护: A 链接 B 时，B 也自动获得指向 A 的反向链接
- 增量 sync 仅重新解析内容变更的 .md 文件

### 选项

| 选项 | 说明 |
|------|------|
| `--full` | 执行全量同步（扫描所有文件） |
| `--quiet` | 静默模式，不输出详细报告 |
| `--wikilinks` | 全量重新扫描所有 .md 文件的 [[wikilink]]（不依赖增量） |

### wikilink 与 lo link 的区别

| 特性 | [[wikilink]] | lo link |
|------|-------------|---------|
| 创建方式 | 写在 .md 文件中 | 命令行手动执行 |
| 目标匹配 | 按标题匹配 | 按 RID 精确指定 |
| 存储位置 | relations 表 | relations 表 |
| 文件重命名后 | 自动保持（基于 RID） | 自动保持（基于 RID） |
| 标题变化后 | 下次 sync 自动更新 | 不受影响 |
| 适用场景 | 笔记内引用 | 跨类型资源关联 |

### 示例

```
lo sync                           # 增量同步
lo sync --full                    # 全量扫描
lo sync --wikilinks               # 增量同步 + 全量重建 wikilink
lo sync --full --quiet            # 后台静默全量同步
lo sync --full --wikilinks        # 全量同步 + 全量重建 wikilink
```

### 联邦同步子命令

`lo sync` 同时是**联邦同步**（Phase 5.10）的命令组。当第一个参数是下列子命令时，走联邦同步逻辑（面向多仓库知识同步）：

- `lo sync pull <namespace>` — 从已注册的联邦仓库拉取资源
- `lo sync push <namespace>` — 推送本地资源到远程联邦仓库
- `lo sync status` — 查看同步状态
- `lo sync conflict <list|resolve>` — 冲突管理（`resolve <id> <strategy>`，strategy 为 `local-win | remote-win | manual`）

```
lo sync pull personal            # 从 personal 命名空间拉取
lo sync push personal            # 推送到 personal 命名空间
lo sync status                   # 查看同步状态
lo sync conflict list            # 列出待解决冲突
lo sync conflict resolve c_123 local-win   # 解决冲突
```

> 联邦同步与本地同步（`lo sync --full` 等）共享同一命令；本地同步选项与子命令互斥。联邦仓库需先用 `lo federation add` 注册。详见 [federation](../knowledge/federation.md)。

### 注意事项

- sync 不写 commits 表，适合批量自动化场景
- sync 产生同名冲突时会自动入栈（layer>=1）
- 加密文件自动解密后计算明文 hash 进行比较

### 相关命令

- [link](link.md) — 建立手动链接
- [stack](stack.md) — 管理冲突栈
- [push](push.md) / [pull](pull.md) — 远程同步
