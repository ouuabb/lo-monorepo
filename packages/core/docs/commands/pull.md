## pull — 从远程设备拉取变更

**用法:** `lo pull <remote|别名>`

从远程设备拉取所有同步批次，应用缺少的操作到本地。

### 工作机制

1. 从远程拉取同步清单（sync_manifest.json）
2. 对比远程清单与本地已有操作，计算缺少的 op_id
3. 拉取远程所有同步批次文件
4. 解包各批次，过滤出本地缺少的操作
5. 安装资源文件到本地 resources/ 目录
6. 逐条应用新操作日志（含冲突检测）

### 冲突处理

| 冲突场景 | 处理方式 |
|----------|----------|
| 同一资源两边都编辑了（RESOURCE_UPDATED 冲突） | 本地版本保持不变（layer=0），远程版本自动入栈（layer>=1）。用户通过 `lo stack list` 查看，手动合并后走 add → commit 流程 |
| 远程删除但本地有编辑 | 保留本地版本 |
| 远程新建资源与本地同名 | 自动入栈（layer>=1），不覆盖本地活跃资源 |
| 栈满（20 层） | 回退到 `.conflict` 文件方式 |
| 正常操作 | 直接应用 |

### 合并流程

pull 产生冲突后，完整工作流为:

```
lo pull           → 冲突版本入栈
lo stack list     → 查看冲突
(手动比较、合并内容)
lo add <资源>     → 暂存合并结果
lo commit -m "合并远程修改"  → 自动生成合并提交 [merge]
lo push           → 推送合并提交
```

### 远程地址格式

与 push 相同，支持 SSH 远程、绝对本地路径、Windows 绝对路径、别名。

### 示例

```
lo pull me@laptop:~/notes           # 从笔记本拉取变更
lo pull myserver                    # 使用别名拉取
lo pull /mnt/shared/notes           # 从共享目录拉取
```

### 注意事项

- pull 与 push 使用相同的同步清单机制
- 冲突合并提交会自动标记 `merge=1`，在 `lo log` 中显示 [merge] 标签
- 合并提交是一个全新的独立提交

### 相关命令

- [remote](remote.md) — 管理远程别名
- [push](push.md) — 推送变更到远程
- [clone](clone.md) — 从远程仓库克隆
- [stack](stack.md) — 管理冲突入栈版本
