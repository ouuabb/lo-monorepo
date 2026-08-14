## 端到端加密系统

### 一页通：从零到懂

下面用对话的方式，解释加密机制的全貌。

**第一幕：创建仓库（lo init）**

"我要建一个新仓库。"
lo 说："好，我给你造一把钥匙，叫 RepoKey。"
"这是什么？"
lo 说："这把钥匙用来锁你的笔记。但不会一开始就用它——你的笔记默认是普通 Markdown 文件，可以直接用任何编辑器打开。"
"那什么时候加密？"
lo 说："你可以选择：`lo init --encrypt` 让全仓库默认加密；或者平时写明文笔记，遇到敏感内容时用 `lo new --encrypt` 创建加密笔记，或用 `lo encrypt <rid>` 给已有笔记上锁。"
"钥匙放哪？"
lo 说："放在 `.repo/keys/repo.key`。注意，现在是明文放的，谁拿到这个文件都能开你的笔记。建议运行 `lo auth add` 用 SSH 密钥保护它。"

**第二幕：上锁（lo auth add）**

"明文放不安全啊。"
lo 说："那就上锁。我需要借你的 SSH 私钥用一下。"
"怎么用？"
lo 说："我不拿走你的私钥。我读一下私钥的内容，算出另一把钥匙，叫 KEK。然后用 KEK 把 RepoKey 加密，加密结果存到 `.repo/keys/protected_xxx.key`，最后删掉明文的 `repo.key`。"
"那我的 SSH 私钥存在盒子里吗？"
lo 说："不在。盒子里只存加密后的 RepoKey。解密时需要你的 SSH 私钥参与计算，没有私钥就解不出来。"

**第三幕：日常使用（lo show / lo edit）**

"我要看笔记。"
lo 说："先证明你是谁。我用你的 SSH 私钥算一把 KEK，用 KEK 打开 `protected_xxx.key` 盒子，拿到 RepoKey，再用 RepoKey 解密你的笔记。"
"这过程快吗？"
lo 说："第一次几秒钟。通过之后缓存 15 分钟，这期间再操作就几乎没感觉了。"

**第四幕：另一台电脑（lo clone / lo pull）**

"我在另一台电脑 B 上 clone 了仓库，怎么打不开文件？"
lo 说："因为 B 上的 repo.key 是全新随机生成的，和 A 的不一样。需要把 A 的明文 repo.key 安全传到 B 上。然后两台电脑各自执行 `lo auth add`，用自己的 SSH 私钥保护同一把 RepoKey。"

**核心角色速查：**

| 角色 | 是什么 | 类比 |
|------|------|------|
| RepoKey | 随机 AES-256 密钥 | 房门钥匙 |
| SSH 私钥 | 你的身份凭证 | 你的指纹 |
| KEK | 从 SSH 私钥算出的 | 打开保险柜的钥匙 |
| protected.key | 加密后的 RepoKey | 锁了房门钥匙的保险柜 |
| LOEC 密文 | 加密后的笔记 | 锁着的门 |

流程：SSH 私钥 → 算出 KEK → 打开 protected.key → 拿到 RepoKey → 解密笔记

底线：除了你的设备，没有任何地方存着能解密文件的完整信息。

---

### 什么是端到端加密

端到端加密（End-to-End Encryption, E2EE）确保数据在写入磁盘前加密，在读取时才解密。即使攻击者获取硬盘，没有密钥也无法读取。

```
纯文本笔记 → AES-256-GCM → LOEC 密文 （写入磁盘）
LOEC 密文   → AES-256-GCM → 纯文本笔记 （读取）
```

核心保证：
- **机密性**：没有密钥的人无法读取文件内容
- **完整性**：GCM 认证标签检测任何文件篡改
- **前向安全性**：每次加密使用不同的随机 IV
- **密钥不传输**：加密密钥仅存在于设备内存中

---

### 加密算法：AES-256-GCM

| 参数 | 值 |
|------|-----|
| 算法 | AES |
| 密钥长度 | 256-bit（32 字节）|
| 模式 | GCM（Galois/Counter Mode）|
| 分类 | AEAD（认证加密）|
| IV 长度 | 96-bit（12 字节），随机生成 |
| 认证标签长度 | 128-bit（16 字节）|

GCM 模式同时在加密过程中生成认证标签。解密时先验证标签，只有通过才返回明文——保证密文完整性。

---

### LOEC 文件格式

加密文件采用 LOEC（Log End-to-End Encrypted）二进制格式：

| 偏移量 | 大小 | 字段 | 描述 |
|--------|------|------|------|
| 0 | 4 字节 | MAGIC | 魔数 "LOEC"（0x4C4F4543）|
| 4 | 2 字节 | VERSION | 格式版本（当前：0x0001）|
| 6 | 12 字节 | IV | 随机初始化向量（96-bit）|
| 18 | n 字节 | CIPHERTEXT | AES-256-GCM 加密密文 |
| 18+n | 16 字节 | TAG | GCM 认证标签 |

格式特性：
- **自描述**：魔数和版本号使文件格式可自动识别
- **向前兼容**：版本号预留了未来算法升级的空间
- **最小开销**：每文件仅增加 34 字节（18 头部 + 16 标签）

---

### 密钥分层架构

两层密钥架构，将"加密文件"和"保护密钥"分离：

```
Layer 1: RepoKey（AES-256, 32字节）
  用途：直接加密/解密所有资源文件
  生命周期：仓库创建时生成，永久不变
  存储：.repo/keys/repo.key（0o600）

         ↓ 由 KEK 加密保护

Layer 2: KEK（Key Encryption Key）
  用途：加密保护 RepoKey
  派生：SSH私钥 → HKDF-SHA256
  存储：.repo/keys/protected_<fp>.key
  每台设备独立生成
```

设计优势：
1. 修改 SSH 密钥不需要重新加密所有笔记
2. 每台设备用各自的 SSH 密钥保护同一把 RepoKey
3. 可以安全地添加/移除设备的访问权限

---

### 密钥派生：HKDF-SHA256（RFC 5869）

```
SSH 私钥文件内容
       ↓
HKDF-Extract（PRF: HMAC-SHA256, Salt: 固定随机盐）
       ↓  PRK（32 bytes）
HKDF-Expand（PRF: HMAC-SHA256, Info: "lo-repo-key-protection-v1"）
       ↓  KEK（256-bit, 32 bytes）
```

参数说明：
- **IKM**：SSH 私钥文件的完整字节内容
- **Salt**：32 字节安全随机盐值（防彩虹表）
- **Info**："lo-repo-key-protection-v1"（上下文绑定）
- **输出**：256-bit KEK

---

### 完整机制详解：从 init 到日常读写

**阶段一：仓库初始化（lo init）**

1. 调用 `crypto.randomBytes(32)` 生成 256-bit RepoKey
2. 将 RepoKey 以明文写入 `.repo/keys/repo.key`（权限 0o600）

**阶段二：绑定 SSH 密钥（lo auth add）**

1. 读取 SSH 私钥文件的完整字节内容
2. 通过 HKDF-SHA256 派生出 KEK
3. 用 KEK 通过 AES-256-GCM 加密 RepoKey
4. 加密结果写入 `.repo/keys/protected_<指纹>.key`
5. 删除明文的 `.repo/keys/repo.key`

**阶段三：日常使用（lo show / lo edit）**

1. 检查会话缓存（15 分钟 TTL，命中直接跳过）
2. 读取 `protected_xxx.key` → 得到加密的 RepoKey
3. 读取 SSH 私钥，用相同的 HKDF 参数派生 KEK
4. 用 KEK 解密 `protected_xxx.key` → 得到 RepoKey（仅存于内存）
5. 用 RepoKey 解密资源文件 → 明文内容
6. 使用完毕：内存中的 RepoKey 被擦除

---

### 加密与远程同步

资源文件在传输过程中始终保持 LOEC 加密格式：

```
电脑 A：笔记明文 → RepoKey_A 加密 → LOEC 密文
         ↓ SCP
服务器：LOEC 密文（加密状态不变）
         ↓ SCP  
电脑 B：LOEC 密文 → RepoKey_A 解密 → 笔记明文
```

关键点：服务器上、传输过程中始终是加密的。即使服务器被攻破，攻击者也只能拿到密文。

**RepoKey 传递方式：**

1. 通过 SSH 安全复制（推荐）：`scp .repo/keys/repo.key user@B:~/.repo/keys/`
2. 离线传递：base64 编码后通过安全渠道发送
3. 两设备共享同一 SSH 密钥

---

### 日常加密行为对照

lo 支持三种加密粒度，适应不同的安全需求：

| 粒度 | 方式 | 适用场景 |
|------|------|---------|
| 单文件 | `lo new --encrypt` / `lo encrypt <rid>` | 只有少数敏感笔记需要保护 |
| 全量批量 | `lo encrypt --all` | 将已有明文仓库整体转为加密 |
| 全仓库默认 | `lo init --encrypt` | 所有笔记都需要保密 |

| 操作 | 加密仓库（`init --encrypt`） | 明文仓库（默认） |
|------|---------------------------|----------------|
| lo init | 生成 RepoKey + 全仓库加密 | 生成 RepoKey，文件明文 |
| lo new | 自动加密写入磁盘 | 明文写入（`--encrypt` 可单文件加密） |
| lo import | 读取源文件 → 加密后存储 | 读取源文件 → 明文存储 |
| lo encrypt \<rid\> | 跳过（已是加密状态） | 加密指定文件 |
| lo decrypt \<rid\> | 解密指定文件 | 跳过（已是明文） |
| lo show | 解密 → 显示明文 | 直接显示 |
| lo edit | 解密 → 编辑 → 重新加密 | 直接编辑 |
| lo sync | 解密 → 计算明文散列 → 比较 | 直接计算散列 |
| lo backup | 复制文件，排除 .repo/keys/ | 复制文件，排除 .repo/keys/ |

---

### 相关文档

- [SSH 身份认证](auth.md) — lo auth 详解
- [远程同步](sync.md) — 加密文件同步流程
- [安全设计](../advanced/security.md) — 安全措施总览
