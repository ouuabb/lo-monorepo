# 数据库表结构审计

## 审计时间

2026-07-12

## 审计范围

`src/repo/database.cjs` 完整的表结构定义（含 V1–V25 迁移链路），覆盖 40 张表。

---

## 历史问题：为什么有 25 次迁移

### 根本原因

没有 `PRAGMA user_version` 追踪。每次 `lo admin` 启动，`Database.init()` → `createTables()` 按 V1→V25 顺序执行全部 25 个迁移方法。幂等性全依赖 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN` + `try/catch {}` 吞错。

### 演化过程

```
Phase 1–2（基础）: resources, commits, relations, sync          → 4 张表
Phase 3–4（容器）: container_members, sources, operations       → +5 张表，列不断补
Phase 5–6（AI）:   ai_suggestions, ai_memory, ai_concepts       → 两次迭代（V10/V20）
Phase 6（自动化）: workflows, events, agents                     → 一批一张
Phase 6（权限）:   roles, policies, ACL                         → V17/V22 两批
Phase 6（协作）:   messages, teams, tasks                       → V19
Phase 6（进化）:   knowledge_snapshots, evolution               → V13/V21
Phase 6（运行时）: runtime_instances                             → V23
```

每个 Phase 加新功能时，表结构膨胀，产生一次迁移。但前面阶段的迁移代码从未删除或合并——因为 `CREATE TABLE IF NOT EXISTS` + `try/catch` 在功能上掩盖了冲突。

---

## 发现的全部问题

### P0：数据正确性影响

#### 1. `ai_memory` 三向冲突（V10→V20→V25）

**时间线：**

| 版本 | 操作 | 表结构 |
|------|------|--------|
| V10 | `CREATE TABLE IF NOT EXISTS ai_memory` | `id TEXT PK, rid TEXT, type, content, created` |
| V20 | `CREATE TABLE IF NOT EXISTS ai_memory` | `id INTEGER PK AUTOINCREMENT, type, concept, value, confidence, tags, created_at` |
| V25 | `DROP TABLE + CREATE TABLE IF NOT EXISTS` | V20 结构 |

**问题：**

- 新库首次启动：V10 先建表（`IF NOT EXISTS` 通过），V20 被跳过（表已存在），V25 检测到 V10 结构 → DROP TABLE 重建。V10 阶段写入的 AI 记忆数据全部丢失。
- 老库升级后重启：V25 已将表重建为 V20 结构 → 下次启动 V10 尝试 `CREATE INDEX ON ai_memory(rid)` → 报错 "no such column: rid"。
- **`resource_rid` 缺失**：V10 有 `rid` 列关联资源，V20 移除后无法追溯到哪个资源产生了该 AI 记忆。

**影响：** SemanticMemory 保存的记忆无法关联到具体资源。用户无法追问"这个文档有哪些 AI 分析结果"。

#### 2. `resource_acl` 无 PRIMARY KEY

```sql
-- 修复前
CREATE TABLE resource_acl (
  resource_id  TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  permission   TEXT NOT NULL,
  deny         INTEGER DEFAULT 0
);
-- 无任何 PRIMARY KEY 或 UNIQUE 约束
```

**影响：** SQLite 隐式 `rowid` 导致同一 `(resource_id, subject_id, permission)` 三元组可重复插入。所有 upsert 逻辑失效，ACL 条目会无限累积重复。

---

### P1：冗余/循环代码

#### 3. 内联 ALTER 与建表语句重复（6 处）

`createTables()` 中的 `CREATE TABLE` 已包含全部列，但紧随其后又 `ALTER TABLE ADD COLUMN`：

| 表 | 列 | ALTER 位置 |
|------|------|------------|
| `resources` | `encrypted` | line 55 |
| `resources` | `name` | line 62 |
| `resources` | `layer` | line 69 |
| `commits` | `updated` | line 159 |
| `commits` | `metadata` | line 166 |
| `commits` | `merge` | line 173 |

新库这些 ALTER 全部报"列已存在"被 catch {} 吞掉。老库已通过第一次启动补上了列，后续每次启动 ALTER 都是无效操作。

#### 4. `resources.capabilities` 建删循环

```
基础 CREATE TABLE resources（无 capabilities 列）
  → 内联 ALTER ADD COLUMN capabilities TEXT DEFAULT '[]'  ← 建
  → V24: ALTER TABLE resources DROP COLUMN capabilities   ← 删
```

新库每次启动：建列 → 删列 → 下回启动再建 → 再删。

数据已迁移至 `resource_capabilities` 独立表，此循环是纯浪费。

#### 5. `roles.permissions` 和 `policies.action` 同样循环

```
V17: CREATE TABLE roles (..., permissions TEXT DEFAULT '[]')  ← 建
V24: ALTER TABLE roles DROP COLUMN permissions                ← 删

V22: CREATE TABLE policies (..., action TEXT NOT NULL)        ← 建
V24: ALTER TABLE policies DROP COLUMN action                  ← 删
```

数据已迁移至 `role_permissions` / `policy_actions` 独立表。

#### 6. `container_members` V1–V5 全部无效

5 个迁移方法尝试加的列（`status`、`force_ignore`、`source_id`、`source_deleted_at`、`created_at`、`updated_at`）均已存在于基础 `CREATE TABLE container_members` 语句中。每次启动 5 个 ALTER 全部被 catch {} 吞掉。

---

### P2：设计遗留

#### 7. 5 张 Phase 6 预留表

以下表在 `database.cjs` 有建表语句，但 `src/` 下无任何代码对其执行读写操作：

| 表 | 来源 | 用途（设计阶段） |
|------|------|------|
| `ai_learning` | V20 | AI 学习记录 |
| `ai_interactions` | V20 | AI 交互记录 |
| `evolution_states` | V21 | 进化状态快照 |
| `evolution_history` | V21 | 进化历史 |
| `plugin_settings` | V14 | 插件独立配置 |

这些表是为 Phase 6 的 AI/进化和插件子系统预留的。对应模块代码未实现或未接入。

#### 8. `container_members` V4 表重建冗余

V4 迁移方法检测 `container_members` 是否有 `source_id` 外键约束。检测逻辑：
- 如果无 FK → 创建 `container_members_new` → 复制数据 → DROP 旧表 → 重命名
- 其实基础 CREATE TABLE 已声明了 3 个 FOREIGN KEY，新库永远不需要重建

#### 9. `ai_concepts` 缺少 `relations` 列

V20 建表时遗漏了 `relations` 列。V25 通过 `ALTER TABLE ADD COLUMN relations TEXT DEFAULT '[]'` 补齐。但 V25 的 DDL 已将此列纳入最终建表，不需要额外 ALTER。

---

## 修复方案

### 已执行：建立迁移追踪系统

保留一张 `001_initial_schema.cjs` 迁移文件（含全部 40 张表的最终结构），由 `migrationRunner.cjs` 通过 `schema_migrations` 追踪表确保每个迁移仅执行一次。

新库首次启动：执行 `001_initial_schema` 一次建全部 40 张表。

老库兼容：`CREATE TABLE IF NOT EXISTS` 保证与已有表不冲突。已存在的表结构（老库跑过 V1–V25）不变，仅补建未存在的 Phase 6 预留表。

后续变更通过新增 `002_xxx.cjs` / `003_xxx.cjs` 迁移文件进行，详见[数据库迁移系统](/advanced/architecture/migration)。

### 表结构修复

| 修复项 | 变更 |
|--------|------|
| `ai_memory` | 增加 `resource_rid TEXT` 可空列。全局知识为 NULL，资源关联填对应 rid |
| `resource_acl` | 增加 `PRIMARY KEY (resource_id, subject_id, permission)` |

### 未处理

- 5 张 Phase 6 预留表：保留不动，等待 Phase 6 模块实现
- `SemanticMemory.save()` 暂未接入 `resource_rid`：调用方持有 `resource.rid` 但未传入。后续按需修改