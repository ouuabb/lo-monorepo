## remote — 管理远程仓库别名

**用法:** `lo remote <add|remove|list> [别名] [地址]`

管理远程仓库的别名，简化 push/pull/clone 命令的地址输入。

### 子命令

| 子命令 | 说明 |
|--------|------|
| `add <name> <url>` | 添加远程别名 |
| `remove <name>` | 移除远程别名（也可用 `rm`） |
| `list` | 列出所有已配置的远程别名（也可用 `ls`） |

### 别名存储

保存在仓库数据库的 sync_config 表中，每个仓库独立管理自己的远程别名。

### 支持的命令

配置别名后，push/pull/clone 都可以使用别名替代完整地址。

### 远程地址格式

| 格式 | 示例 |
|------|------|
| SSH 远程 | `user@host:/path/to/repo` |
| 绝对本地路径 | `/absolute/local/path` |
| Windows 绝对路径 | `C:\absolute\path` |
| 别名 | 预先通过 `lo remote add` 配置的名称 |

### 示例

```
lo remote add myserver root@192.168.1.100:/data/notes
lo remote add backup /mnt/backup/notes
lo remote list
lo remote remove backup
```

### 使用别名

```
lo push myserver          # 等价于 lo push root@192.168.1.100:/data/notes
lo pull myserver
lo clone myserver --dest ./my-notes
```

### 相关命令

- [push](push.md) — 推送变更到远程
- [pull](pull.md) — 从远程拉取变更
- [clone](clone.md) — 从远程仓库克隆
