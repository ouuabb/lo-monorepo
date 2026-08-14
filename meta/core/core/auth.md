## SSH 身份认证系统

### SSH 在项目中的全部作用

SSH 在 lo 中有两个互不相关的用途：

**用途一：保护 RepoKey（lo auth 管理）**
- 机制：读取 SSH 私钥内容 → HKDF 派生 KEK → 加密 repo.key
- 命令：`lo auth add / remove / list`
- 效果：防止硬盘被盗后攻击者直接拿走明文密钥

**用途二：传输文件（系统 SCP）**
- 机制：`lo push/pull/clone` 底层调用 `scp` 命令上传/下载 batch.tar.gz
- 命令：`lo push / pull / clone`
- 效果：通过 SSH 加密通道安全传输同步数据

两者完全独立：
- `lo auth` 管密钥保护，SCP 管文件传输
- 可以为 `lo auth` 注册一把 ed25519 密钥，同时 SCP 用另一把 RSA 密钥
- 禁用 `lo auth` 不影响 `push/pull`（只要系统 SSH 配置正确）

---

### SSH 不是加密的核心

重要：lo 的加密体系不依赖 SSH。核心始终是 RepoKey。

SSH 做什么：
- 把明文 `repo.key` 锁进 `protected_xxx.key`
- 每次需要 `repo.key` 时验证你的身份再交出来

SSH 不做什么：
- 不加密你的笔记文件（那是 RepoKey 的活）
- 不生成 RepoKey（那是 `crypto.randomBytes` 的活）
- 不参与文件加解密的任何环节
- 不参与 push/pull 的传输加密（那是 SCP 的活）

类比：

```
RepoKey = 保险柜的钥匙
SSH    = 你办公室门上的指纹锁

笔记在保险柜里（用 RepoKey 锁的），办公室门有指纹锁（SSH）。
但保险柜的钥匙才是打开笔记的唯一方式。
指纹锁只是多一道门——不会让保险柜本身更安全，
只是让"偷钥匙"这件事难度增加。
```

---

### 有 SSH vs 无 SSH 的安全对比

| 场景 | 无 lo auth | 有 lo auth |
|------|-----------|-----------|
| 硬盘被盗（关机）| 直接解密所有文件 | 无法解密 |
| 硬盘被盗（登录后）| 直接解密 | 能解密（私钥在）|
| 备份文件泄露 | 能解密 | 能（备份排除了 key）|
| 服务器被攻破 | 能解密（无加密）| 只有密文 |
| U盘/移动硬盘丢失 | 直接解密 | 无法解密 |

结论：SSH 主要防的是"硬盘/存储介质被动泄露"场景。

安全备份的正确姿势：
- 备份的是 **RepoKey 本身**（打印、写纸上、放密码管理器）
- 不是备份 SSH 密钥
- SSH 可以随时换，RepoKey 丢了就永远解不开文件

---

### SSH 认证如何工作

RepoKey 绑定 SSH 前以明文存储。`lo auth add` 后：

| | 无 SSH | 有 SSH |
|------|------|------|
| repo.key（明文）| 存在 | 不存在 |
| protected_xxx.key | 不存在 | 存在 |
| 攻击者获取磁盘后 | 直接解密 | 无法解密 |
| 安全等级 | 基础 | 增强 |

每次需要解密时的认证流程：
1. 检查当前仓库是否注册过 SSH 密钥
2. 检查会话缓存（15 分钟 TTL，命中跳过）
3. 生成随机 nonce（256-bit）
4. 用本地 SSH 私钥对 nonce 签名
5. 用注册的公钥验证签名
6. 通过 → HKDF 派生 KEK → 解密 `protected_*.key` → 拿到 RepoKey
7. RepoKey 仅存于内存，用完擦除
8. 保存会话缓存

---

### 挑战-应答认证协议

基于 SSH 签名的挑战-应答协议，私钥不离开设备：

```
验证方(DB)                          证明方(私钥)
    │  1. nonce=<256-bit随机>          │
    │────────────────────────►         │
    │                      2. ssh-keygen -Y sign
    │   3. 返回签名                    │
    │◄────────────────────────         │
    │   4. ssh-keygen -Y verify        │
    │   5. 通过→解密 RepoKey            │
```

安全特性：
- **零知识**：私钥不离开本地，只传签名不传私钥
- **防重放**：每次使用不同 nonce，旧签名无法复用
- **多密钥**：任意一把注册过的密钥通过即可
- **会话缓存**：15 分钟 TTL，避免频繁签名
- **环境变量**：`LO_AUTH_SKIP=1` 可跳过（CI/CD）

---

### 签名机制

主方案：`ssh-keygen -Y sign / -Y verify`（OpenSSH >= 8.1）

```bash
# 签名
ssh-keygen -Y sign -f <私钥> -n lo-cli <challenge>
# 验证
ssh-keygen -Y verify -f <allowed_signers> -n lo-cli -s <签名文件> < <challenge>
```

支持的密钥：Ed25519（推荐）、ECDSA、RSA

---

### 多设备支持

每台设备用各自的 SSH 密钥保护同一把 RepoKey：

```
笔记本（~/.ssh/id_ed25519）      台式机（~/.ssh/id_rsa）
    │  lo auth add                    │  lo auth add
    ▼                                ▼
protected_<fp1>.key         protected_<fp2>.key
(KEK_1 加密的 RepoKey)      (KEK_2 加密的 RepoKey)

不同 KEK，解密出相同的 RepoKey
```

前提：两台设备持有同一把 RepoKey（需手动安全传递）。

受保护的密钥文件 `protected_xxx.key` 可以随仓库同步，因为它是用 KEK 加密的——没有对应 SSH 私钥的人打不开。

---

### 会话缓存

缓存文件：
- Windows：`%TEMP%/.lo-auth-session.json`
- Unix：`/tmp/.lo-auth-session.json`

缓存策略：
- 默认 TTL：15 分钟（`--ttl` 可调）
- 过期后下次命令触发重新认证
- 仅对同一仓库路径有效
- 缓存到期或手动 `lo auth clear` 清理

性能：
- 首次认证：约 1-3 秒
- 缓存命中：几乎零开销
- 加密 I/O 开销通常 < 5%

---

### SSH 的局限与注意事项

1. **SSH 私钥是否有密码保护，对 lo 没有影响** — lo 读取的是 SSH 私钥文件的原始字节来派生 KEK。SSH 私钥密码保护的是"别人能不能用你的私钥登录其他服务器"。

2. **攻击者已登录你的电脑时，SSH 没法防** — 这是所有本地加密方案的共同局限。

3. **SSH 不是强制的，但推荐使用** — 可以完全不使用 `lo auth`，repo.key 保持明文。

4. **多设备时 RepoKey 需要手动传递** — `lo auth` 只保护本地的 repo.key，不负责跨设备分发。

5. **protected_xxx.key 和 SSH 私钥必须在不同设备上配对使用** — 换了 SSH 私钥 → 旧的 protected 文件作废。

6. **密钥自动发现机制** — lo 会扫描 `~/.ssh` 目录下的所有 `.pub` 文件，自动发现对应的私钥路径。认证流程中是 1 对 1 匹配：公钥指纹必须等于私钥指纹。

---

### 相关命令

```
lo auth add -k ~/.ssh/id_xxx -l "标签"    注册 SSH 密钥
lo auth remove <指纹>                      移除密钥绑定
lo auth list                               列出已注册密钥
lo auth clear                              清除会话缓存
```

### 相关文档

- [加密系统](encryption.md) — RepoKey 与 KEK 的完整说明
- [远程同步](sync.md) — SCP 传输与 lo auth 的关系
- [安全设计](../advanced/security.md) — 整体安全措施
