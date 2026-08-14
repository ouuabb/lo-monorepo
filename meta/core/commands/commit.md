## commit — 提交暂存区

**用法:** `lo commit [--message|-m <信息>] [--merge]`

将暂存区的变更提交到仓库历史记录。

### 工作机制

提交流程:
1. 读取 staging_changes 表中的暂存内容
2. 新增文件 (added) → 导入到数据库
3. 修改文件 (modified) → 调用 refresh() 更新散列和元数据
4. 删除文件 (deleted) → 标记数据库记录为已删除
5. 重命名 (renamed) → 更新数据库路径
6. 元数据变更 (metadata) → 合并到数据库 metadata 列
7. 检测合并场景 → 如果存在 pull 产生的冲突入栈资源，自动标记为合并提交
8. 记录提交信息到 commits 表（含 merge 标记）
9. 清空暂存区

**合并提交:**

pull 发现冲突后，远程版本自动入栈（layer>=1），本地版本保持不变。用户手动比较、合并内容后，走正常的 add → commit 流程。commit 会自动检测栈中的远程冲突资源（conflict_source: "remote"），标记为合并提交（commits 表 merge=1）。lo status 中合并提交会显示 [merge] 标签。合并提交是一个全新的独立提交，既不是本地提交也不是远程提交。

### 选项

| 选项 | 说明 |
|------|------|
| `--message`, `-m` | 提交信息（可选，不提供时按默认规则生成） |
| `--merge` | 手动标记为合并提交（通常自动检测，也可显式指定） |

### 示例

```bash
lo commit -m "添加新笔记"
lo commit -m "合并远程修改"            # pull 冲突后的合并提交
lo commit --merge -m "手动合并"
```

### 相关命令

- [add](./add.md) — 添加文件到暂存区
- [reset](./reset.md) — 取消暂存
- [log](./log.md) — 查看提交历史
- [status](./status.md) — 查看工作区状态
- [pull](./pull.md) — 从远程拉取变更
