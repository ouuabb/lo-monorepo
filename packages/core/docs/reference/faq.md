## 常见问题

### 基础使用

**Q: lo 是什么？和 Obsidian/Notion 有什么区别？**

A: lo 是一个本地优先、端到端加密的知识管理 CLI 工具。与 Obsidian 类似都使用 Markdown 和 wikilink，但 lo 是命令行工具而非图形界面。与 Notion 的区别在于 lo 的数据完全存储在本地，不依赖云端服务。

**Q: lo 需要联网吗？**

A: 不需要。lo 完全离线可用。只有在需要多设备同步时才需要网络连接（通过 SCP 推送到中继服务器）。

**Q: 支持哪些文件类型？**

A: lo 支持所有文件类型。笔记（.md）是核心用例，但也支持图片（.png/.jpg）、PDF、视频、代码文件、JSON、CSV 等。未知类型标记为 `type: unknown`，但仍可作为资源管理。

### 加密与安全

**Q: 我的笔记真的安全吗？**

A: lo 使用 AES-256-GCM 加密，这是 NIST 和 NSA 认可的最高级别对称加密方案。加密在写入磁盘前完成，中继服务器只能看到密文。关键是保管好你的 RepoKey——丢了就永远解不开文件。

**Q: 如果忘了 SSH 密钥密码怎么办？**

A: SSH 私钥密码对 lo 没有影响（lo 读取的是私钥文件原始字节）。如果丢失了 SSH 私钥文件本身，且没有 RepoKey 的离线备份，那笔记将永久无法解密。

**Q: 可以在没有 SSH 密钥的情况下使用加密吗？**

A: 可以。`lo init` 后 RepoKey 以明文存储。默认文件是明文，但可以用 `lo encrypt <rid>` 或 `lo new --encrypt` 加密指定文件。如需全局加密，用 `lo init --encrypt` 或 `lo encrypt --all`。`lo auth add` 是可选的增强步骤。

**Q: 如何备份密钥？**

A: 备份 `.repo/keys/repo.key`（在绑定 SSH 之前）或通过 `cat .repo/keys/repo.key | base64` 打印后离线存储。也可以通过执行 `lo auth remove` 恢复明文后再备份。

### 同步

**Q: 为什么不能直接同步 SQLite 文件？**

A: SQLite 的 WAL 模式、页大小在不同平台可能不兼容。两台设备同时修改 SQLite 后无法安全合并。lo 改为同步"操作日志"，每台设备独立重放日志来重建数据库状态。

**Q: 推送同步需要服务器吗？**

A: 需要一台可以通过 SSH 访问的机器（可以是云服务器、树莓派、办公室电脑），或者使用 U 盘/移动硬盘作为本地"远程"。

**Q: 如何处理同步冲突？**

A: lo 采用"乐观并发 + 冲突检测 + 人工抉择"。同时编辑同一文件时，后 pull 的设备会检测到冲突：远程版本覆盖本地，本地版本备份为 `.conflict.loec`。需要手动对比合并后 `lo commit`。

**Q: 同步频率建议多高？**

A: 建议开始工作前 `lo pull`，结束工作前 `lo push`。也可以配置 cron 每小时自动推送。

### 版本控制

**Q: lo 能替代 Git 吗？**

A: 不能。lo 的版本控制是轻量级的（暂存区 + 提交历史），用于追踪笔记的元数据变化。Git 管理文件版本，lo 管理元数据和搜索，两者可并行使用。

**Q: lo commit 和 lo sync 有什么区别？**

A: `lo commit` 走暂存区工作流（先 add 再 commit），记录提交历史。`lo sync` 直接扫描文件系统并将变更写入数据库，不记录提交历史。两条路径最终写入同一张 resources 表。

### 链接与组织

**Q: [[wikilink]] 和 lo link 有什么区别？**

A: wikilink 写在 Markdown 文件中，`lo sync` 时自动解析。`lo link` 是命令行手动创建的关系。wikilink 适用于笔记间引用，`lo link` 适用于跨类型资源（如关联图片到笔记）。

**Q: 标签和分类的区别是什么？**

A: 标签（tags）是多对多的交叉标注，一个资源可以有多个标签。分类（category）是一对一的层级归属，用 `/` 分隔表示层级。类比 Gmail 标签 vs 文件夹路径。

**Q: 为什么推荐用 RID 而不是标题来链接？**

A: 标题可以修改，RID 永不改变。用 RID 链接（`[[res_xxx]]`）确保链接永远有效，即使笔记标题多次修改。标题方式在标题重复时可能匹配到非预期目标。

### 迁移

**Q: 如何从 Obsidian 迁移到 lo？**

A: 将 Obsidian vault 中的所有文件复制到 lo 的 `resources/` 目录，然后执行 `lo sync` 和 `lo sync --wikilinks`。obsidian 的 `[[wikilink]]` 语法会被 lo 自动识别。

**Q: 如何从 Notion 迁移到 lo？**

A: 从 Notion 导出为 Markdown & CSV 格式，然后通过 `lo import` 批量导入或直接复制到 `resources/` 后执行 `lo sync`。

### 故障排查

**Q: lo sync 很慢怎么办？**

A: 仓库文件超过 5000 时，sync 扫描可能耗时 5-15 秒。这是已知限制，可通过以下方式缓解：开启 WAL 模式、使用 chokidar 事件替代轮询、拆分大型仓库为多仓库。

**Q: 搜索不返回结果？**

A: `lo find` 使用 SQL LIKE 进行子串匹配，当前不支持中文分词。尝试使用更短的搜索词，或使用 `lo list --tag` / `lo list --category` 来过滤。

**Q: lo clone 失败？**

A: 检查远程服务器的 `sync_batches/` 目录是否包含完整的批次文件。clone 需要所有历史 batch。

### 相关文档

- [快速上手](../guide/getting-started.md) — 从零开始
- [迁移指南](../guide/migration.md) — 从其他工具迁移
- [术语表](glossary.md) — 核心概念定义
