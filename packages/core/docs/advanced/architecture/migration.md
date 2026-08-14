# 数据库迁移系统

## 设计原因

lo 首次发布前经历了 25 轮迭代，数据库表结构跟随功能膨胀不断修改。V1–V25 的 25 个迁移方法是开发史的遗留物——没有 `PRAGMA user_version` 追踪，每次启动从头执行全部迁移。

这导致了多个冲突：
- `ai_memory` 被 V10 和 V20 同时定义，两套互不兼容的结构在 `CREATE TABLE IF NOT EXISTS` 下互相覆盖
- `container_members` 的 5 个 ALTER 每次启动都报"列已存在"被 catch 吞掉
- `resources.capabilities` / `roles.permissions` / `policies.action` 先建后删，建删循环

详细分析见[数据库表结构审计](/advanced/architecture/schema-audit)。

## 核心机制

### 追踪表

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id TEXT PRIMARY KEY,
    executed_at  TEXT NOT NULL
);
```

每次迁移执行后在此表写入一条记录。下次启动时，`migrationRunner` 读取此表，跳过已执行的迁移。

```
schema_migrations
┌────────────────────────┬──────────────────────────┐
│ migration_id           │ executed_at              │
├────────────────────────┼──────────────────────────┤
│ 001_initial_schema     │ 2026-07-12T14:00:35.875Z │
│ 002_add_fts_index      │ 2026-07-15T10:42:33.000Z │
└────────────────────────┴──────────────────────────┘
```

### 文件命名

```
src/repo/migrations/
├── 001_initial_schema.cjs     ← 首次发布完整结构
├── 002_add_fts_index.cjs      ← 后续变更
└── 003_add_wal_mode.cjs       ← 后续变更
```

规则：
- 格式 `NNN_description.cjs`（NNN 为三位零填充数字）
- 按文件名升序执行
- 已执行过的迁移**永远禁止修改**
- 新需求创建新编号迁移

### 迁移文件规范

每个文件导出：

```javascript
module.exports = {
    id: '002_add_fts_index',
    description: 'Add FTS5 full-text search index to resources',
    async up(db) { /* DDL / DML */ }
};
```

**`id` 必须与文件名前缀匹配**（`migrationRunner` 启动时校验，不匹配直接抛出异常）。

### 执行流程

```
Database.init()
  → open()
  → runMigrations(db, migrationsDir)
      ├─ 建 schema_migrations（IF NOT EXISTS）
      ├─ 读取已执行记录 → Set
      ├─ 扫描 migrations/ 目录 → 按编号排序
      ├─ 过滤出未执行的
      └─ for each pending:
          ├─ log: [MIGRATION] Running 002_xxx — description
          ├─ BEGIN
          ├─ migration.up(db)
          ├─ INSERT INTO schema_migrations
          ├─ COMMIT
          └─ log: [MIGRATION] Success 002_xxx
               或: [MIGRATION] Failed 002_xxx → ROLLBACK → process.exit(1)
```

### 事务保证

每个迁移在独立事务中执行：

```
BEGIN
  migration.up()          ← DDL/DML
  记录 schema_migrations
COMMIT                    ← 全部成功，或
ROLLBACK (on error)       ← 全部撤销
```

迁移失败 → 回滚 → `process.exit(1)`。**拒绝在不确定状态下继续运行。**

### 场景

#### 新库（首次启动）

```
├─ 无 database.sqlite
├─ open() 创建空库
├─ runMigrations()
│   ├─ 创建 schema_migrations（空表）
│   └─ 执行 001_initial_schema → 建全部 40 张表 + 种子数据
└─ 启动完成
```

#### 重启（无新迁移）

```
├─ database.sqlite 已存在
├─ runMigrations()
│   ├─ schema_migrations: [001_initial_schema]
│   ├─ 扫描 migrations: [001_initial_schema]
│   ├─ 过滤: 全部已执行
│   └─ 返回（无输出）
└─ 启动完成
```

#### 升级（新增迁移）

```
当前: schema_migrations = [001, 002]
文件: [001, 002, 003, 004]

├─ runMigrations()
│   ├─ 过滤: 003, 004 未执行
│   ├─ 执行 003_xxx
│   ├─ 执行 004_xxx
│   └─ 启动完成
└─ 下次启动: 003, 004 已存在，全部跳过
```

### 首次发布前压缩

项目**首次正式发布前**，应将所有累积的开发用迁移压缩为一个 `001_initial_schema.cjs`——包含完整最终表结构。

禁止将开发历史引入正式版本：

```
❌ 001_create_resources
   002_create_commits
   003_add_name
   004_add_layer
   005_add_updated
   ...
   025_normalize

✅ 001_initial_schema   ← 一张迁移包含全部 40 张表
```

lo 当前处于压缩后状态：唯一迁移是 `001_initial_schema.cjs`。

## 启动日志示例

新库首次启动：

```
[MIGRATION] Running 001_initial_schema — Create full initial database schema (40 tables)
[MIGRATION] Success 001_initial_schema
```

重启（无新迁移）：静默无输出。

升级（有新迁移）：

```
[MIGRATION] Running 002_add_fts_index — Add FTS5 full-text search index
[MIGRATION] Success 002_add_fts_index
[MIGRATION] Running 003_add_wal_mode — Enable WAL journal mode
[MIGRATION] Success 003_add_wal_mode
```

## 与旧机制对比

| | 旧（V1–V25 全量重跑） | 新（迁移追踪） |
|------|------|------|
| 启动执行 | 25 个方法每次都跑 | 只跑未执行过的 |
| 幂等性 | `IF NOT EXISTS` + `try/catch{}` 吞错 | `schema_migrations` 记录保证 |
| 冲突处理 | 后面改前面结构，前面不知道 | 不会冲突——每个迁移只跑一次 |
| 错误处理 | 静默吞掉 | `process.exit(1)` 拒绝继续 |

## 实施位置

| 文件 | 作用 |
|------|------|
| `src/repo/migrationRunner.cjs` | 迁移执行引擎 |
| `src/repo/migrations/001_initial_schema.cjs` | 初始完整 schema |
| `src/repo/database.cjs` | `init()` 调用 `runMigrations()` |

## 相关文档

- [数据库表结构审计](/advanced/architecture/schema-audit) — 迁移系统建立背景与审计过程
- [数据库与资源索引](/core/database) — 全部 40 张表结构说明