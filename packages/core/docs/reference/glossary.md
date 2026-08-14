## 术语表

本文档定义 lo 中的核心术语。

### 基础概念

**RID（Resource Identifier）**
资源标识符。格式为 `res_` 前缀 + 24 位十六进制随机字符串，如 `res_a1b2c3d4e5f6`。每个资源在入库时被分配一个 RID，一旦分配永不变更。RID 是资源的一等公民标识，所有操作（编辑、删除、链接、标签）均以 RID 为首要引用方式。

**GlobalRID**
联邦知识图谱中的全局资源标识符。用于跨仓库引用资源，格式包含仓库标识和本地 RID，支持不同 lo 仓库之间的知识图谱互联。

**Name**
资源的逻辑名称，人类可读的标签。从文件路径自动推导，如文件名去掉日期前缀和随机后缀。`name + layer` 组合唯一。

**Resource**
仓库中的一等公民实体。拥有唯一 RID，可以是笔记、图片、PDF、视频或任何类型的文件。所有资源在 lo 中地位平等。

**Resource Type**
资源类型，如 note、image、pdf、video、code 等。类型决定资源在某些操作中的行为，但不改变资源平等的核心原则。

**虚拟资源（Virtual Resource）**
没有关联文件 path 的资源（如翻译记录、浏览历史）。path 存为空字符串，跳过文件操作（fs.stat/fs.readFile/hash 计算）。

**Layer（资源层）**
资源栈中的层级编号。layer 0 为活跃层（默认操作该层），layer 1~19 为栈层（冗余备份）。通过 `name + layer` 组合唯一标识。

**Stack（资源栈）**
处理同名资源冲突的自动冗余机制。同名资源依次进入不同 layer，最多 20 层。活跃层始终可用，栈层为保留备份。

**Metadata**
资源的 JSON 格式元数据，存储在 SQLite 的 metadata 列。包含 title、wordCount、tags、category、status 等字段。写入时严格校验类型和字段名。

**lenient 模式**
metadata 校验的宽容模式。未知字段保留并警告（不报错），用于远程同步场景——对端已校验过，本地不应因插件字段未注册而拒绝同步。已知字段的类型校验仍然严格生效。

---

### 容器与成员

**Container（容器）**
具有 `container` capability 的 Resource。可以管理成员、按 schema 过滤类型、扫描内容源目录。类似"项目"或"相册"的概念。

**Container Capability**
Resource 的一种能力标记（`capabilities: ["container"]`），赋予资源管理成员的能力。

**Container Schema**
容器的成员规则配置（`container_schema`），定义了允许的成员类型（`allowed_types`）。

**Member**
容器中的条目。可以是 File Member（未提升，无独立 RID）或 Resource Member（已提升，有独立 RID）。

**File Member**
`container_members` 表中 `resource_rid = NULL` 的条目。只是一个文件索引，没有独立身份，不能参与 Relation。

**Resource Member**
已被 `lo container promote` 提升为独立 Resource 的成员。拥有 RID，可以参与 Relation、添加标签和分类。

**Promote（提升）**
将 File Member 提升为 Resource Member 的操作。提升后文件获得独立 RID，但仍保留在容器中。

**Demote（降级）**
将 Resource Member 降级为 File Member 的操作（`--revert`）。降级后成员失去独立 Resource 关联，但 Resource 本身不受影响。

**Content Source**
Resource 的内容来源。通过 `resource_sources` 表绑定，支持 local_folder、git_repository、zip_archive 等类型。与 Resource 身份解耦。

---

### 加密与认证

**RepoKey**
仓库主密钥。随机生成的 AES-256 密钥（32 字节），直接用于加密/解密所有资源文件。存储在 `.repo/keys/repo.key`（明文）或不存在（已被 SSH 保护）。

**KEK（Key Encryption Key）**
密钥加密密钥。从 SSH 私钥通过 HKDF-SHA256 派生，用于加密保护 RepoKey。仅存在于内存中，不存储到磁盘。

**HKDF（HMAC-based Key Derivation Function）**
基于 HMAC 的密钥派生函数（RFC 5869）。lo 使用 HKDF-SHA256 从 SSH 私钥派生出 KEK，包含 Salt 和 Info 上下文绑定。

**LOEC（Log End-to-End Encrypted）**
lo 的加密文件格式。二进制格式，包含魔数（LOEC）、版本号、随机 IV、AES-256-GCM 密文和 GCM 认证标签。

**SSH Challenge-Response**
基于 SSH 签名的挑战-应答认证协议。客户端用私钥签名服务端提供的随机 nonce，服务端用公钥验证。私钥不离开客户端。

**Session Token**
HTTP API 的会话令牌。通过 SSH 挑战-应答认证获取，有效期 60 分钟，超时后需重新登录。

**protected_*.key**
受 SSH 保护的 RepoKey 文件。包含用 KEK 加密后的 RepoKey。文件可随仓库同步，但没有对应 SSH 私钥的人无法解密。

---

### 版本控制

**Staging Area（暂存区）**
Git 风格的版本控制中间层。存储在 `staging_changes` 表（SQLite 数据库）中，包含 added、modified、deleted、renamed、metadata 五种变更类型。`lo commit` 后清空。

**Commit（提交）**
将暂存区的变更写入数据库并记录提交历史。commit 会更新 resources 表的 hash/metadata，写入 commits 表，生成 sync_ops 操作日志。

**Soft Delete（软删除）**
标记资源 `deleted = 1` 而非物理删除。数据保留在数据库中，查询时被过滤。relations 表不清除，保留历史链接关系。

**Hard Delete（硬删除）**
物理删除资源（`--hard`），从 resources 和 relations 表移除记录。不可恢复。

---

### 同步与分布式

**Operation Log（操作日志）**
同步的基本单位。记录在 sync_ops 表中，包含五种操作类型。多个设备通过重放操作日志来同步状态。

**Batch（批次）**
一次 push 产生的自包含 tar.gz 文件。包含 manifest.json、ops.json、checksums.json 和资源文件。每个批次可独立验证完整性。

**Sync Anchor（同步锚点）**
记录"已同步到哪个位置"的标记。存储在 sync_config 表中，按（设备, 远程）独立维护。

**Push**
将本地产生的操作日志打包成 batch，通过 SCP 传输到远程。

**Pull**
从远程下载最新 batch，解包校验后应用到本地。

**Clone**
从远程完整克隆仓库（类似 git clone）。下载所有历史 batch，按时间顺序重放所有操作日志。

**Remote（远程）**
lo 的中继目标。可以是 SSH 服务器、本地路径或 U 盘。只是存储 batch 文件的裸目录，不需要运行任何 lo 进程。

---

### AI 与扩展

**OODA（Observe-Orient-Decide-Act）**
知识系统自演化的核心循环。Observe（观察）→ Analyze（分析）→ Detect（检测）→ Plan（规划）→ Execute（执行）→ Validate（验证）。

**Agent（智能体）**
lo 中的 AI 智能体，具有特定角色（researcher、curator、analyst、monitor、assistant），通过状态机、记忆系统和规划/执行/反思循环自主运行。

**Federation（联邦知识图谱）**
跨仓库的知识图谱互联机制。通过 GlobalRID 在不同 lo 仓库之间建立引用关系，实现知识的联邦式管理和发现。

**Plugin（插件）**
lo 的可扩展模块。通过 PluginManager 管理加载/初始化/激活/停用/卸载生命周期，支持 resourceTypes、relationTypes、commands、renderers、importers、exporters、searchProviders、views、resourceProviders 等 9 类扩展点。插件通过 `require('@lo/plugins-sdk')` 导入 SDK 基类和工具（Plugin、ResourceBuilder、RelationBuilder、ResourceProvider 等）。

**插件 HTTP 端点（Plugin HTTP Endpoint）**
P2-0 新增。插件通过 commands 扩展点注册的 HTTP 路由（handler 结构为 `{ method, path, handler }`），`lo serve` 启动时自动挂载为动态路由（如 `/api/plugins/<plugin-id>/...`）。插件 handler 使用 Express 风格 API（`req.body` / `res.status().json()`）。插件端点豁免 SSH 认证（外部系统无 SSH 能力，服务仅监听 127.0.0.1），但仅限实际已挂载的端点；POST/PUT/DELETE 与核心 API 共用写锁。

**metadataSchema**
插件通过 contributes.resourceTypes[].metadataSchema 声明自定义 metadata 字段。PluginManager 激活插件时自动注册到 validateMetadata 的 EXTRA_FIELDS。

**DiscoveryService（资源发现服务）**
P0-3 新增。将 ResourceProvider 的 `discover()` 返回的候选对象（ResourceCandidate / RelationCandidate）写入 lo Core 的管道服务。支持全量发现（discover）、增量监听（watch）、dry-run 模式和 6 个 Hook 埋点（beforeDiscover/afterDiscover/beforeResourceCreate/afterResourceCreate/beforeRelationCreate/afterRelationCreate）。通过 `repo.getDiscoveryService()` 获取，CLI 命令为 `lo plugin discover`。

**Plugin Repository（插件仓库）**
P2-1 新增。插件分发平台，负责搜索/展示/下载/更新/版本管理插件包（对应参考文档第 10 节）。以 `index.json` 分发清单为核心：`[{ id, name, version, description, author, main, downloadUrl, checksum, size }]`。lo Core 通过 `src/plugin/pluginRegistryClient.cjs` 获取清单、下载 tar.gz、校验 sha256、解压安装。地址可用环境变量 `LO_PLUGIN_REGISTRY` 覆盖（默认官方地址，支持 http(s):// 与本地路径/file://）。

**插件包（Plugin Package）**
P2-1 新增。插件的分发单元，tar.gz 格式，包含 `plugin.json`（manifest）+ `src/`（插件入口）+ `extension/`（可选，Chrome 扩展等外部资源）+ `package.json`（可选），排除 `test/`。由 lo-plugins 的 `scripts/build.cjs` 打包生成，输出到 `dist/<id>-<ver>.tar.gz` 并同步生成分发清单 `index.json`。

**PluginRegistryClient（插件仓库客户端）**
P2-1 新增。lo Core 的插件仓库客户端模块，封装与 Plugin Repository 的交互：`fetchRegistry`（获取 index.json）、`findPlugin`（按 id 查找）、`downloadPackage`（下载插件包）、`verifyChecksum`（sha256 校验，支持 `sha256:` 前缀，无 checksum 时跳过）、`extractPackage`（解压）。`lo plugin install <id>` 经由它完成安装。

**Event Bus（事件总线）**
lo 内部的发布-订阅系统。支持 resource/sync/lifecycle 事件，模块通过订阅事件来响应仓库变化。

**Workflow（工作流）**
lo 的动态行为模型系统。通过状态机模型（states + transitions + rules）描述对象的变化规律。状态属于 Workflow Instance 而非 Resource，`transition` 是唯一合法状态变化入口。

---

### 链接系统

**Wikilink**
在 Markdown 笔记中使用 `[[...]]` 语法建立的自动双向链接。支持 RID 匹配（`[[res_xxx]]`）、标题匹配（`[[笔记标题]]`）和别名语法（`[[目标|别名]]`）。

**Embed**
Markdown 笔记中通过 `![alt](path)` 或 `<img>` 标签建立的单向引用关系。`lo sync` 时自动解析，产生 `type: 'embed'` 的关系记录，`metadata.origin` 为 `markdown_parser`。支持 RID 引用和路径引用两种模式。

**Relation**
资源间的关系记录，存储在 relations 表中（`type: 'wikilink'`、`'embed'` 或 `'reference'`）。基于 RID 建立，文件重命名不影响链接。

**双向链接**
lo 自动维护的反向链接机制。当 A → B 的 wikilink 创建时，同时自动创建 B → A 的反向链接。

---

### 相关文档

- [核心概念](../guide/concepts.md) — 设计哲学入门
- [RID 一等公民](../core/rid.md) — RID 的完整说明
- [加密系统](../core/encryption.md) — RepoKey、KEK、HKDF 详解
- [远程同步](../core/sync.md) — 同步机制
- [系统架构](../advanced/architecture.md) — Phase 6 扩展系统
