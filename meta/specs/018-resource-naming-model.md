# 018 · Resource Naming Model（最终定稿）

> 状态：**v1 最终定稿**（执行基线，不再扩展命名概念）
> 定位：Resource 命名体系的唯一权威约束——rid + name 最小模型
> 上游：全代码库调研（旧命名模型 name/title/filename/H1 混合语义清理）
> **开发期原则**：应用未发布，**零兼容层**——不保留旧 title API、slug fallback、
> 旧数据兼容字段；旧命名模型直接删除，不以兼容层方式过渡。

---

## 1. 最终模型

```
Resource
├── rid    = identity（永久，不可变）
└── name   = canonical name（唯一正式 Resource 名称，可 rename）

Storage
└── location = 物理存储位置（与 name 完全解耦）

Repository
└── layer  = 同名/冲突资源的归置机制（不参与 identity/引用/rename/sync identity）

Metadata
└── 扩展数据（Core 永不把其中的键解释为 Resource name）

Content
└── 资源实际内容（Core 不认识 Markdown H1）
```

**职责分离**：
- `rid` = 我是谁（唯一 identity，不可变）
- `name` = 我叫什么（唯一正式名称，可 rename）
- `location` = 我在哪里（物理存储，move 可改）
- `layer` = 冲突时怎么归置（Repository 内部机制）
- `metadata` = 扩展属性（不参与 identity 和命名）
- `content` = 内容本身（H1 只是 Markdown 内容的一部分）

**已退出 Resource Naming Model**：
- `metadata.title` → 普通 metadata（插件若需保存书名/文章标题等业务属性可继续存 `{"title": ...}`，**Core 永不将其解释为 name**）
- H1 → Content（不参与 name 生成/fallback/同步；`rename` 不修改 content，`修改 H1` 不修改 name，`refresh` 不修改 name）
- `filename` → Storage
- `slug` → 不存在第二套（name 存储值本身就是 canonical name）
- `title` → 不存在 Resource 概念

## 2. normalizeResourceName（统一规范化入口）

```
normalizeResourceName(input):
  1. Unicode NFKC（全角→半角、兼容分解）
  2. lowercase
  3. 保留 Unicode 字母 \p{L}、Unicode 数字 \p{N}、ASCII '_'、ASCII '-'
  4. 各种 dash（— – 等）→ '-'
  5. 空白（含 NBSP/全角空格）→ '-'
  6. '_' → '-'
  7. 连续 '-' 合并
  8. 删除其他标点、符号、emoji、控制字符
  9. 去除首尾 '-'
  10. 空结果 → 'untitled'
  11. 最大长度 120（截断）
```

示例：

| 输入 | 结果 |
|---|---|
| `Hello World` | `hello-world` |
| `Hello_World` | `hello-world` |
| `Ｈｅｌｌｏ　Ｗｏｒｌｄ` | `hello-world` |
| `前端架构` | `前端架构` |
| `前端架构！！！` | `前端架构` |
| `Hello—World` | `hello-world` |

**约束**：所有新增或修改 Resource.name 的入口（创建、rename、import、sync、plugin、container、Agent）**必须经过同一个 normalizeResourceName**；不允许任何模块自建 name 处理规则。

## 3. name 生成（各入口候选 → 统一 normalize）

不设全局 derive 抽象。**各创建入口自定「候选 name」来源**，最终一律 `normalizeResourceName(candidate)` 落库：

- `lo new "前端架构"` → candidate = 外部输入 → `normalizeResourceName` → name
- 文件导入（`frontend-architecture.md`）→ candidate = filename 剥离（日期前缀/随机后缀/扩展名）→ normalize → name
- 插件创建 → plugin 提供 name → normalize → name
- API `createResource({ name })` → normalize → name
- 无候选 → candidate = `untitled` → normalize → name

**H1 永远不参与 name 生成**（创建时也不作为 fallback）。

## 4. 引用解析（统一 canonical name）

```
resolveResource(input):
  rid 前缀（res_）→ rid lookup
  否则 → normalizeResourceName(input) → getByName(name)（layer=0）
```

- 无精确 name + slug fallback、无旧 name fallback、无 path 降级之外的名称兜底链
- 引用、CLI、插件、Agent、Container、Federation 使用同一套规则
- normalize 后碰撞（多个资源同名）→ 引用解析匹配 layer=0；其余用 `[[rid]]` 显式引用（二义性属引用文本问题，文档化）

## 5. rename（唯一 name 修改入口）

```
rename(rid, newName):
  normalizeResourceName(newName)
  → 冲突检查（活跃 layer=0 已有同名 → 拒绝，RENAME_CONFLICT）
  → resource.update（operation，可撤销）
```

rename 不改变：rid、location、layer、content、metadata、H1；不自动重写 `[[name]]`（Markdown 文本引用失效是引用文本问题，不是 identity 破坏；如需自动重写属独立功能 Rename Reference Rewrite，不进入本模型）。

## 6. delete / undo（name 永不变）

- 删除：`deleted = 1`（仅此而已，name 不变）
- undo：`deleted = 0`（rid/name/layer 原样恢复，无需恢复旧 name）
- 唯一约束：`UNIQUE(name, layer) WHERE deleted = 0`（partial unique index）——允许「删除 layer0 → 重新创建同名 layer0」
- **`name_del_<rid>` 及所有相关恢复逻辑彻底删除**

## 7. Sync / Federation（字段语义统一为 name）

- 远端协议字段 `title` 实际表达 Resource name 的：**直接重命名**为 `name`（RemoteResource.name / sync.name / federation.name / knowledge name），不保留「字段叫 title 实际是 name」的隐性模型
- 所有 name 经 `normalizeResourceName`；rid 仍是跨系统 identity

## 8. 兼容层（零）

应用未发布：`body.title → body.name`、`options.title`、旧 slug fallback、旧 title API、旧客户端兼容、旧数据兼容字段——**全部直接修改/删除，不建兼容层**。

## 9. 实施三原则（执行约束）

1. **语义判断而非关键词扫描**：不要机械以 title/slug 字符串搜索结果作为修改依据；逐处判断语义——属于 Content、插件业务 metadata、UI 临时变量的可保留；**只有属于 Resource 命名语义的才收敛到 name**。最终验收 = 「旧命名模型零残留」（语义层面），不是简单关键词零出现。
2. **P5 存量重建保护数据事实**：rid、relations、content、hash 等不得改变；name 重建只改变命名层；normalize 碰撞按 layer 机制处理；重建前后验证引用解析、资源数量、关系完整性。
3. **统一 normalize 入口**：所有新增/修改 name 的入口必须经同一个 normalizeResourceName；后续新增代码同样约束。

## 10. 实施计划（执行基线）

| Phase | 内容 | checkpoint |
|---|---|---|
| P0 | 本模型冻结（本文档） | `docs(core): freeze resource naming model v1` |
| P1 | Core Naming Foundation：normalizeResourceName 实现 + 全创建入口收敛（H1 永不参与）+ `_extractMetadata` 停写 title + resolveResource 统一 normalize | `feat(core): resource name foundation` |
| P2 | 全系统迁移：Core 展示/CLI/serve/viewRegistry/diff + Agent（展示 + 标题框=rename）+ Plugins + API/SDK（body.name，删 title 残留） | `feat: converge display and api on name` |
| P3 | Repository 语义：partial unique index（migration 003）+ 删软删改名 + undo 简化 + rename 冲突规则 | `feat(core): partial unique index and rename` |
| P4 | Sync/Federation/Knowledge/Automation：协议字段 title→name 重命名 + 悬空 title 假设清理 | `feat(core): align sync and federation on name` |
| P5 | 存量仓库重建：dry-run 统计 + 一次性重建（保留 rid/relation/content/hash，重算 canonical name，碰撞入栈，重建后验证） | `chore(core): rebuild resource names` |
| P6 | 全量回归 + 语义残留扫描 + E2E | `chore: finalize naming model` |

每 Phase 独立 checkpoint、可单独回滚；P5 重建前整仓备份。

## 11. 残留扫描验收清单（语义版）

- Core 中 `metadata.title` 零读取（不再作为名称/展示来源；插件业务 metadata 允许存在键）
- `title || name` / `name || title` 兜底模式零出现（展示统一 name）
- `body.title` / `options.title` 零出现（API 用 name）
- `name_del_` 零出现；软删 UPDATE 不含 name 修改
- `remote.title` / RemoteResource.title 零出现（→ name）
- H1 参与 name 生成/同步的代码零出现（note.cjs 的 H1 解析属 Content 层，保留且不触 name）
- resolveResource 单一 normalize → getByName（无 fallback 链）
