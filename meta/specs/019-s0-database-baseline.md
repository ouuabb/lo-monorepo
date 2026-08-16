# S0 · 数据库 Schema / Migration 基线重构

> 状态：**实施基线（已完成）**
> 依赖：概念依据见 **U0（020-usage-layer-concepts.md）**——本阶段只需 `mode_definitions` / `viewer_definitions` 两表的粗结构（字段由 U1 细化），其余表结构由最终概念模型直接决定。
> 顺序：本阶段在 U0 文档之后阅读、在 U1 之前执行。
> 原则：开发阶段直接收敛——不保留历史 migration、无兼容层、无 old/new 双结构、无 deprecated 字段；代码、Schema、API、测试全部一次性向最终模型收敛。

---

## 1. 当前 Migration 结构（现状）

| 文件 | 内容 | 表数 |
|---|---|---|
| `001_initial_schema.cjs` | 首次发布完整结构（60 张表） | 60 |
| `002_automation.cjs` | automations / automation_runs | 2 |
| `003_name_layer_partial_unique.cjs` | 索引变更（`(name,layer)` partial unique） | 0（索引） |

**当前合计表数：62。**

## 2. 最终 Migration 结构（目标）

```
migrations/
└── 001_initial_schema.cjs     ← 唯一迁移文件（最终基线，62 张表）
```

- `002` / `003` **删除**
- `schema_migrations` 表与 `migrationRunner` 机制**保留**（正式发布后重新启用追加机制；当前只有一条基线记录）
- 所有新建/重建仓库、测试 setup 直接按最终 001 建库

## 3. 全部表最终归属（62 张逐表定案）

> **最终核算**：59 保留 + 1 改名 + 2 新增 = **62**（60 原 001 − 2 删除 + 2 并入 002 + 2 新增 = 62）。

### 3.1 保留（结构不动，59 张）

| 概念域 | 表 |
|---|---|
| Resource | resources、resource_tags、resource_capabilities |
| Relation | relations |
| Schema | schemas、resource_schemas |
| Container | resource_sources、container_members、container_sync_configs、container_ignore_patterns、container_transactions |
| Event | events |
| Workflow | workflows、workflow_instances、workflow_definition_versions、workflow_transition_log |
| View（Query View） | views |
| Automation（002 并入） | automations、automation_runs |
| Staging | staging_changes、commits |
| Sync/Federation | sync_ops、sync_records、sync_log、sync_config、repositories、remote_resources、conflicts |
| Permission | roles、role_permissions、subjects_roles、permissions、resource_acl、permission_audit、policies、policy_actions、security_audit、identities、credentials |
| Agent | agents、agent_runs、agent_memory、agent_messages、agent_teams、agent_tasks |
| 知识层 | knowledge_events、knowledge_snapshots、ai_suggestions、ai_memory、ai_concepts、shared_memory |
| 运行时/演化 | runtime_instances、runtime_events、runtime_state、evolution_states、evolution_actions、evolution_history |
| 插件 | plugins、plugin_settings |

### 3.2 重命名（1 张）

| 现状 | 最终 | 理由 |
|---|---|---|
| `container_operations` | **`operations`** | operationEngine 记录**全部操作**（Resource/Relation/Schema/View/Automation 级，containerRid=`__system__`）——表名与概念不符；列保留（`container_rid`/`member_path` 为成员操作的可选上下文列），不改结构只改名 |

### 3.3 新增（2 张）

```sql
-- Mode Definition（使用方式声明；builtin 以代码为准，插件贡献落此表）
CREATE TABLE mode_definitions (
  mode_id    TEXT PRIMARY KEY,
  semantics  TEXT NOT NULL,
  applies_to TEXT NOT NULL,     -- JSON（camelCase 键）：{ types: string[], capabilities?: string[] }
  rules      TEXT NOT NULL,     -- JSON（camelCase 键）：{ writable: boolean, interactive: boolean }
  plugin_id  TEXT
);

-- Viewer Definition（使用入口声明；builtin 以代码为准，插件贡献落此表）
CREATE TABLE viewer_definitions (
  viewer_id TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  semantics TEXT NOT NULL,
  supports  TEXT NOT NULL,      -- JSON（camelCase 键）：{ modes: string[], types?: string[] }
  plugin_id TEXT
);
```

> **命名映射约定（只属于持久化序列化边界，不产生额外概念）**：数据库列名统一 **snake_case**（`applies_to`/`supports` 等）；JSON 数据内部统一 **camelCase**（`applicableTo`/`supports`/`writable`/`interactive`）。概念/API 侧使用 camelCase（`applicableTo`、`supports`），与列名 snake_case 的映射仅发生在序列化层。

### 3.4 删除（2 张，无消费者）

| 表 | 依据 |
|---|---|
| `ai_interactions` | 全 src 零引用（仅 migration 定义） |
| `ai_learning` | 全 src 零引用（仅 migration 定义） |

## 4. 索引与约束（最终态）

| 索引 | 最终定义 |
|---|---|
| `idx_resources_type` | `resources(type)`（保留） |
| `idx_resources_location` | `resources(location)`（保留） |
| `idx_resources_name_layer` | **`UNIQUE(name, layer) WHERE deleted = 0`**（003 内容直接写入 001） |
| `idx_resources_location_active` | `UNIQUE(location) WHERE deleted=0 AND layer=0 AND location<>'' AND location_kind='local'`（保留） |
| 其余 001 全部索引 | 保留原样 |

约束要点：`resources.name NOT NULL`、`location_kind/location NOT NULL`、`__system__` 种子占 `(name=__system__, layer=0)` 不受 partial unique 影响（活跃）。

## 5. Seed 数据（最终态）

- `__system__`（rid=name=`__system__`，type=system，location_kind=virtual）——保留，随 001 种子写入
- **不落库**：builtin Mode/Viewer（editing/reading/annotating/metadata/preview + markdown-editor/generic-preview）以代码注册为准（U1 实现），插件贡献进表

## 6. MigrationRunner 最终状态

- 扫描 `migrations/` → 仅 `001_initial_schema` 一条
- `migrationRunner.test.cjs`：迁移列表断言改为 `['001_initial_schema']`（当前为 3 条）
- 事务/幂等/失败回滚机制不变

## 7. 代码引用迁移范围

| 引用点 | 变更 |
|---|---|
| `operationEngine.cjs` / `transactionEngine.cjs` / `operationLogger.cjs` | `container_operations` → `operations` |
| `serve.cjs`（operations API 查询/撤销） | 同上 |
| 测试（operations/containerOps/operationLogger 等 5+ 文件） | SQL 与断言同步 |
| `migrationRunner.test.cjs` | 3 → 1 条迁移断言 |

`ai_interactions` / `ai_learning`：零引用（安全删除，无迁移代码）。

## 8. 测试基线

- 全部测试 setup（`test/setup.cjs`、`commandTestHelper.cjs`、各 suite）自动经 `Repository.create/open` → migrationRunner → 最终 001——**无需改动建库路径，仅迁移数量变化**
- 新增测试：`operations` 表名断言（operation 记录查询）；62 表基线抽查（`sqlite_master` 计数 = 62）

## 9. 最终 Schema 验收标准

1. `migrations/` 仅 001；`schema_migrations` 仅 1 条基线记录
2. `sqlite_master` 表数 = **62**（含 operations/mode_definitions/viewer_definitions；不含 ai_interactions/ai_learning）
3. `operations` 表承载全部 Operation 记录；`idx_resources_name_layer` 为 partial unique
4. 全仓无 `container_operations` 字符串引用；无 `ai_interactions`/`ai_learning` 引用
5. 全量 `pnpm test` 全绿；lint 0 error

## 10. Checkpoint

提交信息：`refactor(core): 数据库收敛为最终基线（62 表）`

---

## 11. 阶段状态即验收边界（原则）

本阶段完成 = **数据库为最终 001 基线（62 表）**：唯一 migration 文件、operations 表名、partial unique 索引、mode_definitions/viewer_definitions 就绪、ai 表删除、全仓引用与测试适配。**不提前依赖后续阶段**：U1 的 Mode/Viewer 注册逻辑不在本阶段实现；本阶段只保证表结构与引用收敛。

**本阶段变更对象**：`001_initial_schema.cjs`（重写）、删除 `002`/`003`、`operationEngine`/`transactionEngine`/`operationLogger`/`serve`/测试的 `container_operations`→`operations` 引用、`migrationRunner.test.cjs`。
