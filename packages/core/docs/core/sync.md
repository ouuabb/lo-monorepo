## 远程同步系统

### 一、解决什么问题

lo 是一个本地优先的笔记工具——数据以 Markdown 文件存储在你的设备上。当你拥有多台设备，就需要一种方式保持笔记库的一致性。

lo sync 解决的就是"多设备之间的笔记同步"问题，同时保持以下原则：
- **数据自主**：你拥有中继服务器，不依赖任何云服务
- **端到端加密**：中继服务器只存密文，无法解密你的笔记
- **增量同步**：只传变更部分，不是每次都全量传输
- **冲突不静默覆盖**：冲突时保留所有版本，让你自己决定用哪个
- **支持离线工作**：每台设备都有一份完整的本地副本

典型使用场景：
- 你在公司电脑写了一篇笔记，回家后想在个人电脑上继续编辑
- 你有一台服务器，用来中转多台设备之间的笔记变更
- 你想在多台设备上维护同一个知识库，但不想用第三方云同步服务
- 你偶尔离线写笔记，联网后需要把变更同步到其他设备

### 二、核心设计原理

同步系统采用**操作日志复制模型**（Operation Log Replication），灵感来自分布式数据库的主从复制。

> 核心思想：不直接同步 SQLite 数据库文件（不可跨机移植、不可安全合并），改为同步"操作日志"——每条操作记录就是一个可序列化的变更事件。接收方按时间顺序重放这些操作日志，本地重建出完全一致的数据库状态。

### 三、架构全景

```
设备 A                        中继服务器             设备 B
┌──────────┐               ┌──────────────┐        ┌──────────┐
│ 编辑笔记  │               │ sync_batches/ │        │          │
│    │     │               │              │        │          │
│    ▼     │    lo push    │ batch_001.tar │ lo pull │    ▼     │
│ sync_ops │ ────SCP────► │ batch_002.tar │◄─SCP───│ applyOps │
│ 记录变更  │              │     ...       │        │  重放    │
│    │     │              └──────────────┘        │    │     │
│    ▼     │                                      │    ▼     │
│ 资源文件  │                                      │ repo.    │
│ (密文)   │ ────SCP────►  资源文件(密文)  ◄─SCP───│ sync()   │
└──────────┘                                      └──────────┘
```

### 四、同步的数据范围

| 同步的内容 | 原因 |
|-----------|------|
| resources/ 全部资源文件（保持 LOEC 加密状态）| 笔记本体 |
| ops.json 操作日志 | 变更记录 |
| checksums.json SHA-256 校验 | 完整性 |
| manifest.json 批次清单 | 元信息 |
| .repo/keys/protected_*.key | 设备密钥 |

| 不同步的内容 | 原因 |
|------------|------|
| .repo/database.sqlite | 派生数据，每台设备独立重建 |
| staging_changes 表（database.sqlite 内） | 本地暂存区，不同步工作状态 |
| .repo/repo.key | 明文加密密钥，绝对不传输 |

为什么不同步 SQLite？
- SQLite 的 WAL 模式、页大小在不同平台可能不兼容
- 两台设备同时改了 SQLite 后无法安全合并
- 操作日志重放是一条可验证的、确定性的重建路径
- 你可以随时删除 SQLite，`lo sync` 就能从文件 + ops 重建它

### 五、五种操作类型

| 类型 | 含义 & 触发时机 |
|------|---------------|
| resource_created | 新增文件：lo new、lo import、lo sync、lo commit |
| resource_updated | 内容变更：lo edit、API PUT、lo commit 修改/元数据变更 |
| resource_deleted | 删除文件：lo delete、lo sync、lo commit |
| resource_moved | 移动/重命名：lo move、lo sync、lo commit |
| resource_tagged | 标签变更（保留，暂未使用）|

每条操作日志记录包含：
- `op_id`：操作唯一标识（幂等性保证）
- `op_type`：操作类型
- `rid`：目标资源的 RID
- `data`：操作载荷（路径、hash、metadata 等）
- `timestamp`：操作发生时间
- `device_id`：产生此操作的设备标识
- `applied`：是否已应用到本地 DB

### 六、批次（Batch）机制

一次 push 产生一个批次文件：

```
sync_batches/
└── batch_1749200000123.tar.gz
    ├── manifest.json        批次清单
    ├── ops.json             操作日志数组
    ├── checksums.json       每个文件的 SHA-256
    └── resources/           关联的资源文件
```

批次完整性保证：
1. 打包时计算所有文件的 SHA-256 校验和
2. 接收方解包后逐一验证每个文件的 SHA-256
3. 任何一个文件的 hash 不匹配 → 丢弃整个批次 → 提示用户重试
4. 全匹配 → 资源文件安装到本地 → ops 逐条应用到 DB

### 七、同步锚点（Anchor）

锚点解决了"哪些操作已经同步过了"这个问题。存储在 `sync_config` 表中。

- **push 时**：读取本地与 remote 的锚点，只发送 timestamp 之后的新操作，成功后更新锚点
- **pull 时**：下载远程最新的 batch，解包、校验、应用 ops 后更新锚点
- **首次同步**：锚点为空 → push 发送所有本设备产生的操作

锚点是按（设备, 远程）独立维护的，互不影响。

### 八、冲突检测与处理

lo 采用"乐观并发 + 冲突检测 + 人工抉择"策略：

| 冲突类型 | 检测条件与处理方式 |
|---------|------------------|
| edit vs edit | 远程的 old_hash ≠ 本地当前 hash → 远程版本覆盖本地，本地版本备份为 .conflict.loec |
| delete vs edit | 远程日志说"删了"但本地编辑过 → 保留本地编辑，记录冲突日志 |
| edit vs same hash | 两边改了但内容一样 → 跳过，不产生冲突 |
| 重复操作 | op_id 已在本地 sync_ops 表中 → 自动跳过（幂等性保证）|
| 正常操作 | 无冲突 → 直接写入本地 DB |

### 九、命令详解

**lo push \<remote\>**

```bash
# 将本地产生的变更推送到远程
lo push user@my-server:/home/notes        # 推送到远程服务器
lo push /mnt/usb/notes-backup             # 推送到 U 盘/移动硬盘
```

执行流程：sync → 读取锚点 → 收集关联资源文件 → 打包 batch → SCP 传输 → 更新锚点

**lo pull \<remote\>**

```bash
lo pull user@my-server:/home/notes        # 从远程服务器拉取
```

执行流程：下载最新 batch → 解包校验 → 安装资源文件 → 逐条应用 ops → 执行 lo sync → 更新锚点

**lo clone \<remote\>**

```bash
lo clone user@my-server:/home/notes --dest ./my-notes
```

从远程完整克隆一个笔记仓库（类似 git clone）。下载所有 batch，按时间顺序全部重放，重建完整的 DB 状态。

与 pull 的区别：pull 只下载最新一个 batch；clone 下载所有 batch。

**lo sync**

扫描本地文件系统，将变更同步到 SQLite 数据库（本地操作，不涉及远程传输）。

执行流程：
1. 扫描仓库目录下所有文件
2. 对每个文件对比 DB 记录
3. 通过 hash 匹配识别重命名/移动
4. 将变更写入 sync_ops

### 十、典型使用流程

**两台设备 + 一台服务器：**

```bash
# 设备 A
lo init
lo new "我的第一篇笔记"
lo push user@server:/notes

# 设备 B
lo clone user@server:/notes --dest ~/notes
cd ~/notes
lo auth add -k ~/.ssh/id_ed25519

# 日常工作
# A: lo push user@server:/notes
# B: lo pull user@server:/notes     # 拉取 A 的变更
#     lo push user@server:/notes     # 推送 B 的变更
```

**U 盘/移动硬盘同步：**

```bash
lo push /mnt/usb/notes-backup
lo pull /mnt/usb/notes-backup
```

### 十一、安全模型

lo 采用分层安全模型：

| 层次 | 机制 |
|------|------|
| 传输层 | SSH/SCP 加密通道 |
| 文件层 | 资源文件以 LOEC 加密格式存储和传输 |
| 密钥层 | RepoKey 绝不传输，protected_*.key 可同步 |
| 完整性层 | 每个 batch 内含 SHA-256 校验 |

### 十二、最佳实践

1. **同一笔记避免在多台设备同时编辑**（最重要！）
2. **定期 push，不要攒太久** — 降低了冲突概率
3. **用 lo auth add 绑定 SSH 密钥** — 之后不需要每次都输密码
4. **不要手动编辑 sync_ops 表或 batch 文件** — 会导致同步失败
5. **中继服务器上保留所有 batch** — lo clone 需要历史 batch
6. **备份你的 RepoKey** — 所有笔记的加密都依赖它

### 部署与管理

#### 远程端设置（服务器侧）

```bash
# 在服务器上创建目录
ssh user@your-server
mkdir -p /data/lo-notes
exit

# 配置 SSH 免密登录
ssh-keygen -t ed25519 -C "lo-sync"
ssh-copy-id user@your-server
```

#### 本地端设置

```bash
cd ~/my-notes
lo init
lo auth add -k ~/.ssh/id_ed25519 -l "我的电脑"
lo remote add myserver user@your-server:/data/lo-notes
lo push myserver
```

#### 多远程管理

```bash
lo remote add server-a  user@server-a:/data/lo
lo remote add server-b  user@server-b:/backup/lo
lo remote add usb       /mnt/usb/lo-backup

lo remote list
lo push server-a
lo push usb
```

#### 通过 HTTP API 同步

```bash
lo serve --port 8765

curl -X POST http://127.0.0.1:8765/api/sync/push \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"remote":"myserver"}'
```

#### 定时自动推送

```bash
# cron 方式
0 9,22 * * * cd ~/my-notes && lo push myserver
```

### 常见问题

**Q: push 和 pull 的顺序重要吗？**
A: 推荐先 pull 再 push，类似 Git。

**Q: 可以推送到 GitHub/GitLab 吗？**
A: 不行。lo 的远程中继使用 SCP + batch 协议。

**Q: 服务器需要安装什么？**
A: 什么都不需要。只需要 SSH 守护进程 + 一个可写目录。

**Q: 如果 batch 文件在传输过程中损坏了怎么办？**
A: 每个批次内含 SHA-256 校验。不匹配 → 丢弃整个批次。

**Q: 远程的 batch 文件可以删除吗？**
A: 不建议。lo clone 需要所有历史 batch。

### 相关文档

- [加密系统](encryption.md) — LOEC 加密格式
- [SSH 身份认证](auth.md) — lo auth 与 SCP 的关系
- [HTTP API 服务](../reference/api.md) — 同步 API 端点
- [操作追踪体系](../advanced/operations.md) — sync_ops 详解
