## clone — 从远程仓库克隆

**用法:** `lo clone <remote|别名> [--dest <path>]`

从远程仓库克隆完整副本到新设备。

### 工作机制

1. 初始化目标目录
2. 拉取远程所有同步批次
3. 初始化本地仓库（需要手动设置加密密钥）
4. 安装所有资源文件
5. 应用全部操作日志重建索引

### 前置条件

- 远程仓库已在另一台设备上通过 `lo push` 推送过
- 如果仓库启用了加密，需要先在本地 `lo auth add` 绑定 SSH 密钥

### 选项

| 选项 | 说明 |
|------|------|
| `--dest`、`-d` | 克隆目标目录（默认当前目录） |

### 远程地址格式

与 push/pull 相同，支持 SSH 远程、绝对本地路径、Windows 绝对路径、别名。

### 示例

```
lo clone me@server:/notes --dest ./my-notes
lo clone myserver -d ~/notes           # 使用别名克隆
lo clone /shared/notes -d ~/notes
```

### 注意事项

- 克隆后加密密钥需要重新通过 `lo auth add` 绑定
- 备份不含加密密钥（.repo/keys/），恢复后也需要重新认证

### 相关命令

- [remote](remote.md) — 管理远程别名
- [push](push.md) — 推送变更到远程
- [pull](pull.md) — 从远程拉取变更
