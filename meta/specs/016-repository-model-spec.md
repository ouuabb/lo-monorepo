# 016 · Repository Model Specification（正式）

> 状态：**v1.1 正式 Specification**（开发期重构原则定稿）
> 定位：lo Repository 基础模型的权威约束——Repository / Resource / Location / Resolver / Migration
> 上游事实：015（代码事实调研，Research / Facts）· 014（A 功能暂缓，本模型完成后重建）
> **开发期原则**：本次为开发期架构重构，非线上迁移——不做运行时兼容；
> 不保留旧数据模型、无双格式、无兼容字段、无自动补 identity、无旧备份兼容窗口。
> 声明：模型骨架与核心不变量已定稿；实现层决策在 D1-D8 评审中逐项收束。

---

## 1. Repository Identity

- Identity = **逻辑仓库身份（Logical Repository Identity）**，不是物理目录实例；
  同一 Identity 可存在于多个 Location（如 OS copy 产生的副本目录，Core 视角下是同一个逻辑仓库）。
- 随 Repository 实体持久化：move / rename 不变、backup / restore 不变、跨设备保持。
- Core 无法感知 OS 层目录 copy：**不设计"检测同 ID 副本自动 regenerate"机制**；
  副本目录打开后保持原 Identity（同一逻辑仓库的另一 Location）。
- **统一推导规则**：产生"新逻辑仓库"的操作（create / clone / fork / reinitialize）
  → 新 Identity；一切"同一逻辑仓库"的路径/状态操作
  （open / move / rename / backup / restore / copy）→ Identity 不变。
- **reinitialize** 是把"已有 Identity 的目录"变成新逻辑仓库的**唯一显式途径**
  （OS copy 副本独立化必须经它）。
- **开发期原则**：`openRepository` 读取 metadata 并校验——Identity 缺失/非法视为
  **未完成迁移的 Repository，拒绝打开**；**不自动补生成**（无旧仓库兼容）。

## 2. Repository Location

- 当前物理位置；每次打开/连接时重新确定，不信任历史绝对路径。
- 与 Repository Identity 相互独立：move / rename 后 Location 变化，Identity 不变。

## 3. Repository Lifecycle

- Core 能控制的生命周期操作：`createRepository` / `openRepository` /
  `restoreRepository` / `cloneRepository` / `forkRepository` / `reinitializeRepository`。
- Core 不能可靠控制的 OS 行为：move / rename / copy——**不赋予自动识别语义**。
- 生命周期 → Identity 映射：
  ```
  create            → 新 Identity
  open（含移动后）   → Identity 不变（读取现有）· currentPath 重解析
  move / rename     → 同一 Repository · Identity 不变
  backup / restore  → 同一 Repository · Identity 不变
  clone / fork      → 新 Repository · 新 Identity · 可保留 Lineage
  reinitialize      → 显式操作：重新生成 Identity（副本独立化唯一途径）
  delete / recreate → 新生命周期 · 新 Identity
  ```

## 4. Repository Lineage（最小语义）

- 最小语义：`repositoryId` + `lineage / origin`（来源 ID 引用，可空）。
- 仅支持：clone / fork / reinitialize 时记录 origin；move / copy / backup / restore 不改动。
- **不引入** Snapshot、完整血缘 DAG、多级谱系等未来模型（明确排除）。

## 5. Resource Identity

- `rid` = Resource Identity：稳定、唯一、生命周期不变（现有机制）。
- 仓库移动 / 复制 / 恢复后 rid 不变。

## 6. Resource Location

- **三分类**（物理位置维度）：
  ```
  local     —— 仓库内，相对 Repository.currentPath
  external  —— 仓库外
  virtual   —— 无文件（no local path）
  ```
- **Container 是能力维度（capabilities），非第四类位置**：Container Resource 的 location
  仍归 local / external（内容源目录可在仓库内或外）；member 定位 = Container source + memberPath。
- kind 决定解析方式，**禁止从字符串形式推断 kind**（绝对路径 ≠ 必然 external）。
- Repository-local Resource 的 location **相对 Repository.currentPath**，而非历史绝对路径。

## 7. Resource Source

- 内容来源绑定（`resource_sources.location`，可多源 / URL，container 扫描/同步用）。
- **与 Resource Location 彻底解耦，不承载定位职责**。

## 8. Container Member

- `memberPath` = 容器内部相对内容源目录的路径（现有语义保持）。
- member 定位 = Container source + memberPath，解析在 Core。

## 9. Path Resolution

- **Core 是唯一解析者**；Agent / SDK 不自行拼接路径。
- Resolver 返回**三态**：
  ```
  resolved    —— 当前有效本地绝对路径
  unresolved  —— 文件删除、外部资源脱离、Container source 缺失、网络资源不可用等
  virtual     —— 无本地文件（no local path）
  ```
- 不为单一消费者（如 A 的 reveal）窄化设计；消费者含 editor / watcher / preview /
  encryption / external application。

## 10. Migration

- **开发期一次性转换**（非运行时兼容机制）：`Migration` 在本项目中的含义统一限定为
  开发期一次性数据/schema 转换或直接重建，**不是产品运行时兼容机制**。
- **启动校验**（替代"启动迁移"）：
  ```
  Repository.open() → 校验 metadata（Identity 合法）与数据模型版本
    → 版本不符/Identity 缺失 = 拒绝打开（提示需开发期转换/重建）
  ```
- **不保留**：旧 `resources.path` 字段、absolute/relative 双格式、旧 API/HTTP 兼容字段、
  旧备份兼容窗口、惰性迁移。
- 现有开发数据库/仓库数据：一次性转换脚本、重建数据库或重新初始化解决。

## 11. SDK / Agent 边界

- Agent：`RepositoryContext { repositoryId, currentPath, connectionState }`；
  登录三入口（自动登录 / handleLogin / handleRefresh）一致获取、登出（handleLogout）清理；
  **经 API 消费 Core 解析结果**。
- SDK：暴露 Repository 信息（id / path）与解析接口；**不自行拼路径**。
- CLI / serve / SDK / Agent 基于同一套 Core 识别机制（`Repository.open()/create()` 统一接入）。

## 12. 核心不变量（定稿）

1. Repository Identity = 逻辑仓库身份；新逻辑仓库操作（create/clone/fork/reinitialize）
   产生新 Identity；同一逻辑仓库操作（open/move/rename/backup/restore/copy）保持不变。
2. Repository Location 每次打开重解析，与 Identity 相互独立。
3. Resource Identity = rid，永不变化。
4. Resource Location 三分类（local/external/virtual）+ Container 能力层；kind 决定解析，
   禁止形式推断。
5. 仓库内资源 location 相对 Repository.currentPath。
6. Resource Source 与 Location 解耦（source 不承载定位）。
7. 移动/复制后 Identity 不变；副本独立化必须经 reinitialize（Core 不自动猜测 OS 行为）。
8. Backup / Restore 后 Identity 不变。
9. Core 对 Resource Location 拥有唯一解析规则；Resolver 必须明确返回
   resolved / unresolved / virtual 三态（不保证任何时刻存在有效路径）。
10. Agent / SDK 不自行解析路径（唯一解析在 Core）。

## 13. 实现决策（D1-D8 已评审定稿）

### D1 · Repository metadata（定稿）
- `.repo/metadata.json` = Repository 机器元数据载体：
  ```json
  { "repositoryId": "<uuid>", "schemaVersion": 1, "lineage": { "origin": "<id|null>" } }
  ```
- `schemaVersion` = 数据模型版本（Repository Model 形态），与 DB `schema_migrations`（表结构）分离。
- `lineage` 进入第一版（最小语义：origin 单字段，可空）。
- metadata 与 DB 物理分离；create/open/reinitialize 原子性：写 metadata 成功→建/开 DB；reinitialize 先备份旧 metadata（`.metadata.json.bak-<ts>`）再写新。

### D2 · reinitialize（定稿）
- 仅重新生成 repositoryId；`lineage.origin` 记录原 repositoryId。
- 不改变：Resource rid、Resource Location、container/member、DB 数据。
- CLI `lo repo reinitialize` + Core `Repository.reinitialize()`；执行前提示确认。

### D3 · clone / fork（定稿）
- **第一阶段不实现** `cloneRepository`/`forkRepository` 操作；模型语义（新 Identity + lineage.origin）由 §1/§3/§4 约束。
- `syncRemote`（远程文件集拉取）保持现状，与仓库克隆语义无关。

### D4 · Resource Location（定稿）
- `resources` 表：删除 `path` 列，新增：
  ```sql
  location_kind TEXT NOT NULL,   -- 'local' | 'external' | 'virtual'
  location      TEXT NOT NULL    -- local: 相对 Repository.currentPath
                                 -- external: 绝对路径
                                 -- virtual: ''
  ```
- Container：location_kind 归 local/external；capabilities=['container'] 保持；member 定位 = Container location + memberPath。

### D5 · Resolver（定稿）
- 唯一入口：`ResourceService.resolveResourceLocation(rid)`。
- 返回：
  ```
  { kind, resolved: true,  absolutePath }                    // resolved
  { kind, resolved: false, reason }                          // unresolved
  { kind: 'virtual', resolved: true, absolutePath: null }    // virtual
  ```
- reason 枚举（第一版）：`file-missing` / `source-missing` / `external-unavailable`。
- 必须经 Resolver：resourceService 读写、命令 edit/decrypt/encrypt/list、serve 读文件、未来 Agent reveal/editor/preview。
- **不机械经过 Resolver**（非 Resource Location）：临时 filesystem path、导入源、备份目标、watcher 根、插件目录、staging/syncOps 相对路径操作。

### D6 · SDK / Agent（定稿）
- HTTP：`GET /api/notes/:rid` 返回 `location: { kind, value }`；新增 `GET /api/repository`（`{ repositoryId, path }`）与 `GET /api/resources/:rid/location`（三态结果）——直接新字段，无兼容。
- SDK：`client.repository.info()` / `client.repository.resolveLocation(rid)`。
- Agent：`RepositoryContext { repositoryId, currentPath, connectionState }`——登录三入口获取、登出清理；零路径拼接。

### D7 · sync 历史（定稿）
- sync 历史（`sync_ops` 操作日志 + `sync_records` 执行记录）是**操作日志**，不属于 Resource Location 模型；不迁移、不转换、不为它保留字段；`data.path`（已相对化）保持历史事实语义。

### D8 · Federation（定稿）
- 本期 Repository Identity 与 federation `namespace` 解耦，不合并。
- 未来允许 Federation 以 repositoryId 作为机器身份引用，但本期不实现、不预留字段。

---

## 关联文档

- **015 · Repository Model Research（Facts）**：本模型的代码事实基线。
- **014 · Reveal Resource（暂缓）**：A 功能暂缓执行；B 定稿后基于本模型重新制定 A 执行计划。
- 实施计划：B · Repository Model 重构实施计划（Phase 0-6，另行制定，实施前需代码级验证）。
