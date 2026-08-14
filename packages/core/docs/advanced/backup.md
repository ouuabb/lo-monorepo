## 备份与恢复

### lo backup 命令

```bash
lo backup --dest ~/backups
```

lo backup 将仓库打包为 tar.gz 归档文件，保存在指定目录中。

### 备份内容

备份包含：

| 内容 | 说明 |
|------|------|
| `resources/` | 全部资源文件（保持 LOEC 加密状态）|
| `.repo/database.sqlite` | SQLite 数据库（元数据、关系、提交历史）|
| `.repo/config` | 仓库配置 |
| `staging_changes` 表 | 暂存区（database.sqlite 内）|
| `templates/` | 自定义模板目录 |

备份排除：

| 排除内容 | 原因 |
|---------|------|
| `.repo/keys/repo.key` | 明文加密密钥，防止泄露 |
| `.repo/keys/protected_*.key` | 受保护密钥（可选排除）|

> 备份排除 `.repo/keys/` 目录是为了安全：如果备份介质（U盘、移动硬盘、云存储）丢失，攻击者拿不到加密密钥。

### 备份文件命名

```
lo_backup_<timestamp>.tar.gz
例如: lo_backup_20260712_220000.tar.gz
```

### 恢复流程

**从备份恢复整个仓库：**

```bash
# 1. 解压备份文件
tar -xzf lo_backup_20260712_220000.tar.gz -C ~/restored-notes/

# 2. 如果需要加密，需要恢复密钥
# 如果你有 RepoKey 的离线备份：
echo "<base64-of-repokey>" | base64 -d > ~/restored-notes/.repo/keys/repo.key

# 3. 进入恢复的仓库
cd ~/restored-notes

# 4. 验证数据库完整性
lo list

# 5. （可选）重新绑定 SSH 密钥
lo auth add -k ~/.ssh/id_ed25519 -l "恢复的设备"
```

**从备份恢复单个文件：**

```bash
# 1. 解压备份到临时目录
mkdir /tmp/lo-restore
tar -xzf lo_backup_20260712_220000.tar.gz -C /tmp/lo-restore/

# 2. 找到需要的文件
find /tmp/lo-restore/resources/ -name "*.md"

# 3. 复制到当前仓库
cp /tmp/lo-restore/resources/2026-07-05-li-jie-bi-bao.md ~/my-notes/resources/

# 4. 扫描入库
cd ~/my-notes
lo sync

# 5. 清理临时目录
rm -rf /tmp/lo-restore
```

### 备份策略建议

**方案一：手动定期备份**

```bash
# 每天备份
lo backup --dest ~/backups/daily

# 每周备份
lo backup --dest ~/backups/weekly
```

**方案二：cron 自动备份**

```bash
# crontab 配置：每天凌晨 2 点备份
0 2 * * * cd ~/my-notes && lo backup --dest ~/backups/daily
```

**方案三：备份 + 同步双重保险**

```bash
# lo backup 用于灾难恢复
lo backup --dest ~/backups

# lo push 用于日常多设备同步
lo push myserver
```

### 备份密钥

备份 RepoKey 是恢复的关键。建议：

1. **离线纸质备份**：打印 RepoKey（64 个十六进制字符）或手写保存在安全的地方
2. **密码管理器**：存入 Bitwarden/1Password 等密码管理器
3. **加密 USB**：存入加密的 U 盘，与备份文件分开放置

```bash
# 获取 RepoKey（在绑定 SSH 之前或 lo auth remove 之后）
cat .repo/keys/repo.key | base64
# 复制输出的 base64 字符串，保存到安全位置

# 恢复时写入
echo "<base64-string>" | base64 -d > .repo/keys/repo.key
```

### 注意事项

- 备份文件包含数据库和历史记录，但不包含加密密钥（`.repo/keys/`）
- 如果仓库已加密，恢复后需要手动恢复 RepoKey
- 如果绑定过 SSH，可以恢复 `protected_*.key` 文件并使用对应的 SSH 私钥解锁
- 备份文件是完整的 tar.gz 归档，可用标准工具解压和查看
- 定期测试备份的恢复流程，确保备份有效

### 灾难恢复检查清单

□ RepoKey 已有离线备份（纸质/密码管理器）
□ 最近一次备份成功完成
□ 备份文件存储在与主设备不同的位置
□ 已测试过从备份恢复的流程
□ 远程 sync_batches/ 可作为辅助恢复路径

### 相关命令

- `lo backup` — 创建备份
- `lo push` — 推送到远程（辅助备份）
- `lo clone` — 从远程重建仓库

### 相关文档

- [加密系统](../core/encryption.md) — RepoKey 管理
- [远程同步](../core/sync.md) — 同步作为备份补充
- [安全设计](security.md) — 安全措施总览
