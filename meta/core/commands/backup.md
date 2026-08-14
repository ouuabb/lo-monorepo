## backup — 备份资源仓库

**用法:** `lo backup [--dest <目录>] [--compress]`

备份仓库文件到指定目录。备份内容包含 `resources/` 目录和 `.repo/` 目录，但自动排除 `.repo/keys/` 以避免加密密钥泄漏。

### 选项

- `--dest <目录>` — 备份目标目录（默认: `./backups`）
- `--compress` — 压缩备份为 .zip 文件

### 示例

```
lo backup                                        # 默认位置备份
lo backup --dest /mnt/backup                     # 指定位置
lo backup --dest ./archives --compress           # 压缩备份
```

### 工作机制

- 复制 `resources/` 目录（所有资源文件）
- 复制 `.repo/` 目录（数据库、暂存区等），但**排除** `.repo/keys/`
- `--compress` 选项将备份内容打包为 .zip 压缩文件

### 注意事项

- **安全设计**: 备份自动排除 `.repo/keys/` 目录，避免加密密钥泄漏到备份中
- **恢复提示**: 备份不含加密密钥（`.repo/keys/`），恢复后需要通过 SSH 认证或 `lo auth add` 重新关联密钥
- 如果仓库启用了加密，备份中的文件是 LOEC 加密格式，需密钥才能解密

### 相关命令

- [auth](auth.md) — SSH 身份认证管理
- lo docs — 参见 security 主题
