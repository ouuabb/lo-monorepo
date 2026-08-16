## 数据库与资源索引

lo 使用 SQLite 作为本地数据库。

### 表结构总览

| 表名 | 用途 |
|------|------|
| resources | 资源元数据（RID、路径、类型、加密状态等）|
| schemas | Schema 定义（业务级结构化语义描述，含 fields / relations / behaviors）|
| resource_schemas | Resource → Schema 引用（记录创建时的 schema 版本）|
| relations | 资源间的双向链接关系（wikilink / reference）|
| commits | 提交历史记录 |
| sync_ops | 操作日志，同步的基本单位 |
| sync_config | 配置键值对（设备 ID、同步锚点、远程别名）|
| sync_log | 同步活动审计日志 |
| resource_tags | 标签（独立表，V24 从 metadata JSON 迁移）|
| resource_capabilities | 资源能力（独立表，V24 从 capabilities 列迁移）|
| resource_sources | 资源内容来源绑定 |
| container_members | 容器成员列表 |
| container_ignore_patterns | 容器忽略规则（V24 从 container_schema JSON 迁移）|
| operations | 容器操作审计日志 |
| container_transactions | 容器操作事务记录 |
| staging_changes | 暂存区（V25 从 staging.json 迁移）|
| roles | 角色定义 |
| role_permissions | 角色权限绑定（V24 从 roles.permissions 列迁移）|
| subjects_roles | 角色分配 |
| resource_acl | 资源级访问控制列表 |
| permission_audit | 权限审计日志 |
| policies | ABAC 策略定义 |
| policy_actions | 策略动作（V24 从 policies.action 列迁移）|
| identities | 身份定义 |
| security_audit | 安全审计日志 |
| credentials | 凭据存储 |
| agents | 智能体定义 |
| agent_runs | 智能体执行记录 |
| agent_memory | 智能体三层记忆 |
| agent_messages | 智能体消息 |
| agent_teams | 智能体团队 |
| agent_tasks | 智能体任务 |
| workflows | 工作流定义（definition 存 states/transitions/version/applicable_schemas JSON） |
| workflow_definition_versions | 工作流定义版本快照（每升版冻结一份，供历史实例解释） |
| workflow_instances | Workflow 实例（Resource 在某 Workflow 中的参与过程，含 workflow_version / status；同对允许多条历史，但仅一条 active） |
| workflow_transition_log | 状态转换日志 |
| ai_memory | AI 语义记忆（V25 从内存持久化）|
| ai_concepts | AI 概念记忆（V25 从内存持久化）|
| ai_suggestions | AI 建议 |
| evolution_states | 自演化状态快照 |
| evolution_actions | 自演化动作（V25 从内存持久化）|
| evolution_history | 自演化历史 |
| shared_memory | 团队共享记忆（V25 从内存持久化）|
| knowledge_events | 知识事件 |
| knowledge_snapshots | 知识快照 |
| sync_records | 同步记录 |
| sync_batches | 同步批次 |
| conflicts | 同步冲突记录 |
| remote_resources | 远程资源映射 |
| repositories | 外部仓库引用 |
| plugins | 插件注册表 |
| plugin_settings | 插件设置 |
| automations | 自动化定义 |
| automation_runs | 自动化执行记录 |
| mode_definitions | Usage Mode 定义（builtin 以 Core 代码注册为准，U1；插件贡献落此表） |
| viewer_definitions | Usage Viewer 定义（插件贡献落此表） |
| events | 事件历史 |
| runtime_instances | Runtime 实例 |
| runtime_events | Runtime 事件 |
| runtime_state | Runtime 状态 |

### resources 表结构

```sql
CREATE TABLE resources (
    rid          TEXT PRIMARY KEY,     -- 资源唯一标识 (res_xxx)
    name         TEXT,                 -- 逻辑名称（活跃层唯一）
    type         TEXT,                 -- 资源类型 (note, image, pdf, ...)
    path         TEXT,                 -- resources/ 下的相对路径
    hash         TEXT,                 -- 明文 SHA-256（变更检测）
    layer        INTEGER DEFAULT 0,    -- 栈层号（0=活跃，1-19=栈）
    metadata     TEXT,                 -- JSON 元数据（标题、字数、分类、状态等）
    encrypted    INTEGER,              -- 是否加密 (0/1)
    created      INTEGER,              -- 创建时间戳 (ms)
    updated      INTEGER,              -- 最后修改时间戳 (ms)
    deleted      INTEGER               -- 是否软删除 (0/1)
);
```

### resources 表核心字段说明

- **rid**：唯一标识符（`res_xxx` 格式），RID 是主键，不可变更
- **type**：资源类型（note, image, pdf, video, audio, html, text, json, document, spreadsheet, presentation, archive, drawing, code, unknown）
- **path**：文件系统路径（`resources/` 下的相对路径）
- **hash**：明文 SHA-256 散列，用于变更检测和去重检测
- **metadata**：JSON 格式元数据，包含 title、wordCount、category、status 等字段。tags 已独立为 `resource_tags` 表
- **encrypted**：加密状态（0=明文, 1=已加密）
- **deleted**：软删除标记（0=正常, 1=已删除）

### 散列的用途

- **变更检测**：比较文件当前散列与 DB 记录，判断内容是否变化
- **去重检测**：通过散列判断文件是否已导入
- **重命名检测**：自动匹配 hash 识别文件重命名/移动

DB 中存储**明文散列**，不暴露文件内容本身。加密文件先解密再散列，相同内容多次加密产生相同散列，正确检测不变更。

### relations 表结构

```sql
CREATE TABLE relations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_rid    TEXT NOT NULL,          -- 源资源 RID
    to_rid      TEXT NOT NULL,          -- 目标资源 RID
    type        TEXT NOT NULL,          -- 'wikilink' | 'reference' | 'embed' | 'attach' | 'cite'
    name        TEXT,                   -- 链接显示名
    metadata    TEXT,                   -- JSON 元数据（含 origin 字段区分来源）
    created     TEXT NOT NULL,          -- 创建时间
    updated     TEXT NOT NULL,          -- 更新时间
    UNIQUE(from_rid, to_rid, type)
);
```

### relations 类型说明

| type | 说明 | 创建方式 | metadata.origin |
|------|------|----------|-----------------|
| wikilink | 笔记间双向链接（`[[...]]` 语法） | `lo sync` 自动解析 | `markdown_parser` |
| reference | 用户手动建立的引用关系 | `lo relation add` | `user`（默认） |
| embed | Markdown 内嵌资源（`![alt](path)` 图片引用） | `lo sync` 自动解析 | `markdown_parser` |
| attach | 附件关系 | 手动或插件 | 视具体场景 |
| cite | 引用/引文关系 | 手动或插件 | 视具体场景 |

> `origin` 字段用于区分关系来源：`user` 为用户主动创建，`markdown_parser` 为 Markdown 内容解析产生的派生关系。派生关系随内容变更自动重建，不与用户关系冲突。

### 关系重建机制

Markdown 资源的派生关系（wikilink、embed）在 `lo sync` 时全量重建：

```sql
-- 事务内执行，保证原子性
BEGIN;
  DELETE FROM relations WHERE from_rid = ? AND type IN ('wikilink', 'embed')
    AND (json_extract(metadata, '$.origin') = 'markdown_parser' 
         OR json_extract(metadata, '$.origin') IS NULL);
  -- 解析 Markdown 内容，重新 INSERT ...
COMMIT;
```

关键特性：
- **原子性**：删除+创建作为一个事务，任何步骤失败全部回滚
- **origin 过滤**：只删除 `origin = 'markdown_parser'` 或 `origin IS NULL` 的派生关系
- **历史兼容**：旧 wikilink 没有 origin 字段，通过 `IS NULL` 条件一并清理

### commits 表结构

- `id`：自增主键
- `message`：提交信息
- `timestamp`：时间戳
- `added / updated / deleted / renamed / metadata`：变更统计

### 索引

- `resources(type)` — 按类型过滤
- `resources(path)` — 按路径查找
- `resources(name, layer)` — 唯一约束（同名不同 layer 允许）
- `sync_ops(timestamp)` — 按时间查询操作日志
- `sync_ops(device_id)` — 按设备过滤操作
- `relations(from_rid, to_rid, type)` — 唯一约束

### 注意事项

- 未开启 WAL 模式（默认 rollback journal）
- 无 full-text search（FTS）索引
- 无 `resources(hash)` 索引
- 标签和分类不再存在 metadata JSON 中：tags → `resource_tags` 表，category 仍在 metadata 中

### 加密感知

- 加密文件先解密再散列
- DB 始终存储明文 SHA-256
- 相同内容多次加密 → 相同散列 → 正确检测不变更

### 数据库迁移

表结构的创建和变更由迁移系统管理，详见[数据库迁移系统](/architecture/migration)。

### 相关文档

- [RID 一等公民](rid.md) — resources 表主键设计
- [操作追踪体系](../advanced/operations.md) — sync_ops 表详解
- [搜索系统](search.md) — 搜索与查询引擎
- [版本控制](version.md) — commits 表与暂存区
- [数据库表结构审计](/architecture/schema-audit) — V1–V25 迁移冲突调查
