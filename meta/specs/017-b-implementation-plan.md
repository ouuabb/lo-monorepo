# 017 · B Implementation Plan（Repository Model 重构 · 最终可执行版）

> 状态：**v1.0 最终实施计划**（D1-D8 已定稿）
> 依据：016（正式 Specification v1.1，含 D1-D8）· 015（代码事实）
> **开发期原则**：本次为开发期架构重构，非线上迁移——
> 不保留 `resources.path`、无双格式、无自动补 Identity、无旧 API/HTTP 字段、
> 无旧备份兼容、不为历史数据增加兼容分支。
> 现有开发数据统一视为**开发期重建/一次性转换对象**。
> 暂不执行 A；B 完成后基于新模型重新制定 A。

---

## Phase 0 · 实施前基线与回归保护

### 0.1 当前代码行为基线（一次性记录，仅用于回归检出，非兼容契约）
- 全量 `pnpm test`（core 3638+ / agent 177+ / client 95+ / plugins）记录基线。
- Repository 生命周期基线：create / open / backup / restore（排除 `.repo/keys`）/ stats。
- Resource 链路基线：CRUD、move、refresh、rehash、edit/decrypt/encrypt/list。
- container / import / sync / watcher 基线。
- CLI / serve / SDK / Agent 入口基线（`Repository.open()/create()` 收敛点）。

### 0.2 旧概念 → 新概念映射清单（防止遗漏的迁移映射表，非兼容层）

| 旧概念 | 新概念 | 动作 |
|---|---|---|
| `resources.path`（仓库内绝对） | `location_kind='local'` + `location`（相对 currentPath） | 开发期转换 |
| `resources.path`（import 仓库外绝对） | `location_kind='external'` + `location`（绝对） | 开发期转换 |
| `resources.path=""`（虚拟资源） | `location_kind='virtual'` + `location=''` | 开发期转换 |
| container 内容源目录（path） | 本体 `location_kind='virtual'`（capabilities=['container'] 能力标识）；内容源进 `resource_sources`（绝对路径） | 转换/保持 |
| container `memberPath`（相对 source） | 保持相对语义 | **不迁移** |
| `repoPath`（Repository 构造路径） | `RepositoryContext.currentPath`（打开时解析） | 重构 |
| 临时 filesystem path（导入源/备份目标/watcher 根/插件目录） | 非 Resource Location | **不转换、不经过 Resolver** |
| sync 历史（`sync_ops.data.path` 已相对） | 操作日志，非 Location 模型 | **不迁移** |
| `.repo/`（keys/plugins/database.sqlite） | + `.repo/metadata.json`（Identity/schemaVersion/lineage） | 新增 |

### 0.3 最终模型不变量测试骨架（016 §12 不变量 1-10 对应测试文件占位，随 Phase 填充）

---

## Phase 1 · Repository Identity / metadata

- `.repo/metadata.json`：`{ repositoryId, schemaVersion, lineage }`（D1）。
- `Repository.create`：生成 Identity + 写 metadata → 建 DB。
- `Repository.open`：读取并**校验** metadata——Identity 缺失/非法 = 拒绝打开（开发期视为未完成迁移，不自动补生成）。
- `Repository.reinitialize()` + CLI `lo repo reinitialize`（D2）：新 Identity、lineage.origin=原 ID、资源数据不变、旧 metadata 备份。
- `RepositoryContext { repositoryId, currentPath }` 暴露。
- 原子性：create/open/reinitialize 按 D1 规则。

## Phase 2 · Resource Location 模型

- `resources` 表：删除 `path` 列，新增 `location_kind`/`location`（D4）。
- 全量消费点迁移：resourceService（:661/:933/:950/:986）、命令 edit/decrypt/encrypt/list、serve.cjs:2210 矛盾路径。
- container：capabilities/memberPath 语义保持。
- 开发期数据：一次性转换脚本（local 相对化 / external / virtual 分类）。

## Phase 3 · Core Resolver

- `ResourceService.resolveResourceLocation(rid)`（D5）：三态返回 + reason 枚举。
- 所有 Resource Location 消费点经 Resolver；非 Location 的 filesystem path 不机械经过。
- **验收标准**：Resource Location 解析 100% 经唯一 Resolver；无 isAbsolute 双格式分支。

## Phase 4 · 外围链路迁移

- CLI：open() 统一机制自动生效；直接 fs 点迁移。
- serve：HTTP 直接新字段（location/repository/location 端点），无兼容字段。
- watcher：FileWatcher 事件路径与 location 相对语义对齐。
- sync：syncOps 相对语义一致化（device_id 不变；历史不迁移）。
- import：外部文件 → external kind。
- container：本体 location 归 virtual（内容源在 resource_sources）；member 定位 = source.location + memberPath，解析在 Core。
- backup/restore：metadata.json 随备份；恢复后 Identity 保持。
- encrypt/decrypt：路径经 Resolver。

## Phase 5 · SDK / Agent

- SDK：`client.repository.info()` / `client.repository.resolveLocation(rid)`（D6）。
- Agent：`RepositoryContext`——登录三入口获取、登出清理；消费 Core 解析；零拼接。

## Phase 6 · 验证与回归（全部基于最终模型，无旧版本场景）

- 场景矩阵：新仓库创建 / 移动·重命名后重开 / Resource CRUD / local·external·virtual /
  Container / backup-restore / reinitialize / watcher / sync / CLI·serve·SDK·Agent 多入口一致性 /
  Resolver 三态 / Identity·rid 不变量。
- 开发期现有仓库数据重建/转换验证。
- 全量 `pnpm test` 回归 + 手动 E2E。

## 实施门禁
- 每 Phase：不变量测试先行 → 实现 → 该 Phase 回归 → 全量回归。
- 所有改动遵循生态总纲（meta/AGENTS.md）：契约铁律、测试同步、文档同步（016/017 更新）。
- B 完成后：重新制定 A 执行计划（A 仅作 Resolver 消费者）。
