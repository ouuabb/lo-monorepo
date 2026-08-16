# U4 · 全量收敛与验收

> 状态：**实施文档（已完成）**——收敛 U0-U3 成果，复核 17 分支归属，全仓语义扫描与回归。
> 依赖：S0（019）+ U0-U3 全部完成。
> 原则：单模型、单 API、单数据结构；旧实现零残留。

---

## 1. 17 个 type 分支最终归属复核（依据 U0 §6）

| # | 位置 | 原判断 | 归属 | 状态 |
|---|---|---|---|---|
| 1-3 | App.jsx 只读 | `type!=='note'` | **Mode**（editing 缺失）→ Session.readOnly | U2 已迁 |
| 14 | epub 命令守卫 | `type!=='epub'` | **Mode**（命令上下文） | U3 已迁 |
| 5-7 | wikilink/embed/wordCount | `type==='note'` | **Content 层**（不迁） | 保留，注释归属 |
| 9 | import 默认分类 | `type==='note'` | **Import 配置**（保留 config） | 保留 |
| 10 | 默认 type 认定 | — | **TypeRegistry** | 保留 |
| 11-13 | 容器默认能力/门禁 | — | **Container** | 保留 |
| 15 | viewRegistry type 过滤 | — | **View（Query）** | 保留 |
| 16 | extensionRegistry.hasResourceType | — | **TypeRegistry** | 保留 |
| 17 | GraphView 着色 | — | **Agent presentation** | 保留 |
| + | serve admin 仅 note | — | **Admin API 约束** | 保留 |
| + | system 不可删 | — | **Lifecycle** | 保留 |

**验收断言**：Core/Agent 新增使用判断必须经 `resolveModes`；不迁移项以注释标注归属，禁止新增散落 type 使用分支。epub 完整 Mode 列表 `[reading, annotating, metadata]` 仅在**插件已注册**状态断言（U3 后）；U1 阶段插件未装态断言为 `[reading]`——两阶段断言各自独立，不交叉。

## 2. 全仓语义扫描（自动化断言）

- `type !== 'note'`（使用判断语境）：**零**
- `readOnlyOverrides`：**零**
- `container_operations`：**零**（S0 已改 operations）
- `ai_interactions` / `ai_learning`：**零**（S0 已删表）
- `ResourceView` / `QueryView` 兼容别名：**零**
- `mode_definitions` / `viewer_definitions` 消费链路：存在（U1 读取 + U3 写入）
- **annotating/metadata 归属**：仅存在于插件注册表（epub），Core builtin 定义中**零**（U1 §3 分工复核）
- 扫描方式：grep 脚本 + 单测断言（防回归）

## 3. 回归

- 全量 `pnpm test`（core/agent/client/plugins-sdk/agent-plugins-sdk/plugins 全部套件）
- `pnpm lint` 0 error
- 手动 E2E：打开 note（可编辑）/ pdf（只读）/ epub（阅读器）→ 编辑保存 → 标注 → undo → 右键菜单（reveal/删除/只读切换）

## 4. 验收标准（最终）

1. **单模型**：Mode/Session/Viewer 三层独立；无 Usage 大对象
2. **单 API**：modes/viewers 新命名空间；无旧只读 API 残留
3. **单数据结构**：最终 001 基线 62 表；无旧表/旧索引/旧 migration
4. **边界保持**：Schema/Container/Permission/Operation/Relation/View 无 Mode 语义渗入（grep 断言）
5. **epub 端到端**通过（U3 链路）
6. 全仓零旧概念（第 2 节扫描）

## 5. Checkpoint

提交信息：`chore(core): 使用层全量收敛（U4）`

## 6. 阶段状态即验收边界（原则）

本阶段完成 = **全部模型收敛并完成全仓验收**：17 分支归属复核、残留扫描断言、回归、epub 端到端。**本阶段是唯一以「最终模型全状态」为验收的阶段**；U1-U3 的测试不得为「最终状态」提前依赖本阶段（各阶段只验证该阶段已存在的模型）。

---

## 附：文档体系索引

| 文档 | 阶段 | 内容 |
|---|---|---|
| `meta/specs/019-s0-database-baseline.md` | S0 | 数据库最终基线（62 表） |
| `meta/specs/020-u0-usage-layer-concepts.md` | U0 | Mode/Session/Viewer 概念冻结 |
| `meta/specs/021-u1-mode-viewer-core.md` | U1 | Core 注册表与解析 |
| `meta/specs/022-u2-agent-session.md` | U2 | Agent Session 与 readOnly 迁移 |
| `meta/specs/023-u3-plugin-sdk-epub.md` | U3 | SDK 契约与 epub 迁移 |
| `meta/specs/024-u4-convergence.md` | U4 | 全量收敛与验收 |

依赖：S0 → U0（概念依据）→ U1 → U2 → U3 → U4；实施顺序同。每阶段独立 checkpoint、代码库始终只存在当前模型。
