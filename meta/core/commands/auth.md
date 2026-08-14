## auth — 管理 SSH 身份认证

**用法:** `lo auth <操作> [选项...]`

管理仓库的 SSH 密钥认证和加密密钥保护。通过 SSH 挑战-应答协议保护仓库的加密密钥，支持多设备注册。

### 子命令

- `add` — 绑定 SSH 密钥，用 SSH 私钥保护加密密钥
- `enable` — 启用 SSH 认证
- `disable` — 禁用 SSH 认证（恢复明文密钥存储）
- `remove` — 移除已绑定的设备密钥
- `list` — 列出已注册的 SSH 密钥
- `status` — 查看当前认证状态
- `verify` — 手动验证 SSH 签名
- `keys` — 扫描本地可用的 SSH 密钥

### 选项

**add:**
- `--key-path, -k <路径>` — SSH 公钥文件路径
- `--label, -l <标签>` — 设备标签（如"笔记本"、"台式机"）

**remove:**
- `--fingerprint, -f <指纹>` — 要移除的密钥指纹

**通用:**
- `--ttl <分钟>` — 认证会话有效期（默认: 15 分钟）

### 示例

```
lo auth add -k ~/.ssh/id_ed25519 -l "笔记本"   # 添加密钥
lo auth add -k ~/.ssh/id_rsa -l "台式机"       # 添加第二台设备
lo auth list                                    # 列出已注册密钥
lo auth remove -f SHA256:abc123...              # 移除设备
lo auth disable                                 # 禁用认证
lo auth status                                  # 查看认证状态
```

### 工作机制

- **密钥保护**: 仓库加密密钥用 SSH 公钥加密后存储，解密时需要对应的 SSH 私钥
- **挑战-应答认证**: lo serve 的 API 认证复用同一套 SSH 密钥
- **多设备支持**: 可注册多台设备的多个 SSH 密钥，任意一个私钥都可解锁仓库
- **会话缓存**: 认证后密钥在会话期间缓存，避免重复输入

### 注意事项

- 执行 `lo auth add` 前确保已初始化仓库（`lo init`）
- 移除所有密钥后仓库可被任意访问
- 密钥存储在 `.repo/keys/` 目录中，备份时自动排除

### 相关命令

- lo serve — HTTP API 服务（复用 SSH 认证）
- lo docs — 参见 auth 和 security 主题
