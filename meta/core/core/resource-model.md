## 资源模型

本文档综合描述 lo 中的资源（Resource）、笔记（Note）、容器能力（Container Capability）、成员（Member）和元数据模型。

---

### 一、什么是笔记

在 lo 中，"笔记"是一种资源类型（`type: 'note'`），以 Markdown 格式存储在 `resources/` 目录中。

笔记的本质：
- 一个以 `.md` 结尾的 Markdown 文本文件
- 文件名遵循 `YYYY-MM-DD-标题slug` 的命名规范
- 第一行的 `# heading` 被自动提取为笔记标题
- 每条笔记拥有唯一的 RID

| 普通 .md 文件 | lo 管理的笔记 |
|---|---|
| 只存在于文件系统 | 文件系统 + SQLite 数据库索引 |
| 无法快速搜索 | 支持全文搜索 |
| 无元数据追踪 | 自动提取标题、字数、链接、待办 |
| 无版本历史 | 支持暂存区 + 提交历史 |
| 无标签/分类 | 支持标签和分类体系 |
| 无双向链接 | 支持 [[wikilink]] 自动双向链接 |
| 无加密保护 | 可选端到端加密（AES-256-GCM）|

### 笔记的文件格式

文件命名规则：

```
格式: YYYY-MM-DD-{slug}.md
示例: 2026-07-05-li-jie-bi-bao.md
```

Slug 是从标题通过以下规则生成的：
- 中文转为拼音
- 所有字母转为小写
- 空格和特殊字符替换为连字符 `-`
- 多个连字符合并为一个

笔记内容结构：

```markdown
# 标题（第一行 # heading，被自动提取为 title）

正文内容开始...
```

### 笔记的元数据

**SQLite `resources` 表的结构字段（所有资源类型共用）：**

| 列名 | 说明 |
|------|------|
| rid | 资源唯一标识符 |
| type | 资源类型（note/image/pdf/video/...）|
| path | resources/ 下的相对路径 |
| hash | 明文 SHA-256（内容变更检测）|
| metadata | JSON 元数据 |
| encrypted | 是否已加密（0/1）|
| created | 创建时间戳（ms）|
| updated | 最后修改时间戳（ms）|
| deleted | 是否已软删除（0/1）|

**metadata JSON 字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| title | string | 从 # heading 提取，非空字符串 |
| wordCount | number | 词数统计，整数 >= 0 |
| tags | string[] | 标签列表，独立储存在 `resource_tags` 表（V24 从 metadata JSON 分离）|
| category | string\|null | 分类（路径式多级，如"编程/Python"）|
| status | string | draft / published / archived |
| conflict | boolean | 同步冲突标记（系统自动设置）|
| original_rid | string | 冲突来源 RID |
| mimetype | string | MIME 类型 |
| size | number | 文件大小（字节）|

### 标题提取

正则表达式：`/^#\s+(.+)$/m`

- 只有第一个 `# heading`（一级标题）会被提取
- 标题不在第一行也可以被识别（如 YAML front matter 之后）
- 无 `# heading` 时从文件名推算（去掉日期前缀和扩展名）
- 仅 `type='note'` 时提取标题，其他类型不执行此逻辑

### 笔记的状态系统

| 状态 | 含义 |
|------|------|
| draft | 草稿 — 正在编写中 |
| published | 已发布 — 内容已完成 |
| archived | 已归档 — 不再活跃修改 |

典型工作流：新建 → `draft` → 完成编辑 → `published` → 不再需要 → `archived`

### 笔记的 CRUD 操作

| 操作 | 命令 | 说明 |
|------|------|------|
| 创建 | `lo new "标题"` | 创建新笔记 |
| | `lo new "标题" --tags "前端,React"` | 创建时指定标签 |
| | `lo new "标题" --category 编程/Python/爬虫` | 创建时指定多级分类 |
| | `lo import path/to/file.md` | 导入外部文件 |
| 查看 | `lo show res_xxx` | 查看笔记内容 |
| | `lo show res_xxx --raw` | 查看原始 Markdown |
| | `lo list` | 列出笔记 |
| 编辑 | `lo edit res_xxx` | 用编辑器打开 |
| 删除 | `lo delete res_xxx` | 软删除 |
| | `lo delete res_xxx --hard` | 硬删除 |
| 移动 | `lo move res_xxx 目标路径` | 移动笔记 |
| 搜索 | `lo find "关键词"` | 全文搜索 |

---

### 二、Resource、Container Capability 与 Member 模型

#### 设计概述

lo 的 Resource 模型将"资源身份"与"内容来源"解耦：

- **Resource**：独立的一等公民实体，拥有唯一 RID
- **Content Source**：Resource 的内容来源（本地目录、Git 仓库等）
- **Container**：具有 `container` capability 的 Resource，可以管理成员
- **Member**：容器中的文件条目（File Member）或已提升的 Resource（Resource Member）

核心理念：任何文件都可以是容器的普通成员（File Member），当需要对某个成员进行标记、引用、分类时，通过 `lo container promote` 提升为独立 Resource。

#### Resource

每个 Resource：

- `rid` — 唯一标识符
- `name` — 逻辑名称（全局唯一，活跃层）
- `type` — 资源类型（project, album, dataset, course, collection, note, code...）
- `capabilities` — 独立表 `resource_capabilities`（resource_rid + capability），标识容器的"container"能力等
- `container_schema` — JSON 对象，容器的成员规则

Resource 的 type 决定其默认行为：

| type | capabilities | container_schema (allowed_types) |
|------|-------------|----------------------------------|
| project | ["container"] | note, document, image, code, json, yaml, xml, csv, text |
| album | ["container"] | image, video |
| dataset | ["container"] | csv, json, yaml, xml |
| course | ["container"] | note, video, audio, document, image, pdf |
| collection | ["container"] | （无限制）|

#### Content Source

Resource 通过 `resource_sources` 表绑定内容来源：

- `resource_rid` — Resource 的 RID
- `source_type` — 来源类型（local_folder, git_repository, zip_archive, remote_storage）
- `location` — 来源位置（本地路径 / URL）
- `metadata` — 附加元数据（JSON）

一个 Resource 可以绑定多个 Content Source。Content Source 与 Resource 身份是解耦的。

#### Container Capability

具有 `container` capability 的 Resource 是容器。

容器的核心能力：
1. 管理成员（`container_members` 表）
2. 按 `container_schema` 过滤成员类型
3. 扫描 Content Source 目录自动同步成员列表
4. 支持 promote / demote 操作

#### Member 模型

`container_members` 表结构：

| 字段 | 说明 |
|------|------|
| id | 自增主键 |
| container_rid | 所属容器的 RID |
| resource_rid | 提升后的 Resource RID（NULL = File Member）|
| path | 容器内的相对路径 |
| name | 文件名 |
| size | 文件大小 |
| hash | 内容 SHA-256 散列 |
| modified_time | 文件修改时间 |
| metadata | 元数据（JSON）|

成员有两种状态：

- **File Member**（resource_rid = NULL）— 只是一个文件条目，没有独立 RID，不能参与 Relation，不能添加标签或分类
- **Resource Member**（resource_rid = 非 NULL）— 已被 promote 提升为独立的 Resource，拥有独立 RID

#### Promote / Demote 机制

`lo container promote` 将 File Member 提升为 Resource Member。
`lo container promote --revert` 将 Resource Member 降级为 File Member。

```
lo container promote 项目/src/auth.py

1. 查找 container_rid
2. 从 Content Source 找到文件的绝对路径
3. 调用 resourceService.create() 创建 Resource
4. 更新 container_members.resource_rid 指向新 Resource
5. 记录操作日志
```

幂等性：重复 promote 同一个文件不会创建新 Resource。

降级后：
- 成员不再关联独立 Resource
- Resource 本身不受影响

#### 与 Relation 系统的关系

只有 Resource Member（已 promote）才能参与 Relation：
- File Member → 不能 link
- Resource Member → 可以 link、可以有 wikilink、可以有标签

设计理由：File Member 没有独立 RID，缺乏稳定的引用目标。

#### Container 同步体系

Container 拥有独立的成员同步机制，不参与 `lo status/add/commit` 流程：

```
资源层 (Resource)   → lo status / lo add / lo commit
容器层 (Container)  → lo container status / scan
```

工作流：
1. `lo container status <rid>` — 查看变更（只读）
2. `lo container scan <rid>` — 应用变更（同步到数据库）
3. `lo container promote <path>` — 将重要文件提升为 Resource

#### 命令参考

```bash
lo create resource <type> <path>   # 创建 Container Resource
lo container promote <path>         # 提升 File Member
lo container status <rid>           # 查看容器成员变更
lo container scan <rid>             # 同步容器成员
lo container list <rid>             # 列出容器所有成员
```

#### 无文件资源（虚拟资源）

lo 支持没有关联文件 path 的资源，称为虚拟资源。适用于翻译记录、浏览历史等场景。

- `resourceService.create` 在 path 为空时跳过文件操作（fs.stat/fs.readFile/hash 计算）
- path 存为空字符串（DB NOT NULL 约束）
- hash 为空字符串
- syncOps 远程同步时同样支持无文件资源（hasFile 判断）

---

### 三、模板系统

lo 支持使用模板快速创建笔记。

内置模板：
- `default`：`# {{title}}\n\n开始写作...\n`
- `daily`：`# {{date}} 日记\n\n## 今日完成\n-\n## 待办事项\n- [ ]\n## 想法记录`

模板变量：`{{title}}` `{{date}}` `{{time}}` `{{datetime}}`

```bash
lo new "新笔记" --template default
lo new "日记" --template daily
```

自定义模板：存放在 `templates/` 目录中。

### 日记功能

```bash
lo daily
```

日记自动使用日记模板，归入"日记"分类并添加"daily"标签。同一天多次执行不会重复创建。

---

### 四、资源栈机制

#### 什么是资源栈

资源栈是 lo 处理同名资源冲突的自动冗余机制。当两个资源具有相同的逻辑名称（name）时，后来的资源不会覆盖前者，也不会被拒绝，而是自动进入"栈"——一个与该名称关联的层级列表。

栈最多支持 20 层（layer 0~19），layer 0 为活跃层（日常使用），layer 1~19 为栈层（冗余备份）。

#### 为什么需要栈

**场景一：重复编辑**

```bash
lo new "周报"    → 文件: 2026-07-01-周报-a1b2c3d4.md → 活跃 (layer 0)
lo new "周报"    → 文件: 2026-07-01-周报-e5f6g7h8.md → 入栈 (layer 1)
```

两份周报都不会丢失。活跃的始终可用，旧的被保护在栈中。

**场景二：拖文件进仓库**

直接复制 `周报.md` 到 `resources/` 目录，运行 `lo sync` → 检测到同名冲突 → 自动入栈。无需手动干预。

**场景三：多设备同步冲突**

设备 A 创建"笔记A"，设备 B 也创建同名"笔记A"。pull 时应用远程操作 → 本地已有同名活跃资源 → 远程版本入栈。两份数据都保留。

#### layer 字段

栈通过 `resources` 表的 `layer` 列实现（`INTEGER NOT NULL DEFAULT 0`）。

| layer | 含义 |
|-------|------|
| 0 | 活跃层。所有日常操作默认操作该层 |
| 1~19 | 栈层。冗余备份，用户不可直接感知 |

`UNIQUE` 约束：`(name, layer)`，保证同一名称的每个层号唯一。

> 栈是逻辑概念，不是物理文件夹。所有栈层对应的文件都存在于 `resources/` 目录下。lo 通过 `layer` 字段区分，文件系统层面无任何区别。

#### 自动入栈流程

所有入库路径都经过 `resourceService.create()`，统一处理同名冲突：

1. 推导资源逻辑 name
2. `getByName(name)` 查询是否有活跃层已存在
3. 若无冲突 → layer = 0（正常创建）
4. 若有冲突 → 扫描当前栈，找下一个空闲 layer（1~19）
5. layer 已满（>=20）→ 抛出异常

> 不存在任何可以"绕过"自动入栈的入库路径。

#### 栈命令

```bash
lo stack list                          # 列出所有栈中资源（layer >= 1）
lo stack promote <rid>                 # 提升指定资源为活跃层（原活跃层降入栈）
lo stack remove <rid>                  # 从栈中移除指定资源（硬删除，不可恢复）
```

> 禁止直接操作文件系统管理栈，所有栈操作必须通过 `lo stack` 命令。

#### 设计意图

- **零数据丢失**：同名冲突不覆盖、不拒绝，全部保留
- **透明性**：日常使用完全不受栈影响（getByName 只查 layer=0）
- **可管理性**：用户随时通过命令查看、切换、丢弃栈层
- **文件系统不变**：不需要新文件夹结构，layer 是纯逻辑字段

---

### 五、[[wikilink]] 双向链接系统

#### 什么是 Wikilink

Wikilink 是 lo 的笔记间双向链接机制。在 `.md` 文件中使用 `[[...]]` 语法即可创建链接。

基本语法：

```
[[res_xxx]]              按 RID 精确链接（推荐，唯一无歧义）
[[笔记标题]]              按标题匹配链接
[[res_xxx|显示别名]]      按 RID 链接，渲染时显示别名
[[笔记标题|显示别名]]      按标题链接，渲染时显示别名
```

> 推荐使用 RID 语法：RID 永不变化，标题可变。按标题匹配时，如果存在多个同名标题，可能匹配到非预期目标。

#### 工作原理

从 Markdown 到数据库的完整流程：

1. **写入** `[[...]]` 语法到 `.md` 文件中
2. **`lo sync`** 触发解析
3. **正则解析**：`/\[\[([^\]|#]+?)(?:\|(.+?))?\]\]/g`
4. **三级匹配**（优先级递减）：
   - ① `res_xxx` → RID 直接查询（精确命中）
   - ② 标题匹配 → 遍历所有笔记按 `metadata.title` 匹配
   - ③ 文件名路径兜底匹配
   - 未匹配的目标被静默忽略
5. **写入 relations 表**：创建 from_rid → to_rid 的 wikilink 关系，同时自动创建反向链接

关键设计决策：

| 决策 | 说明 |
|------|------|
| 每次 sync 全量替换 | DELETE 旧 wikilink 再 INSERT 新，保证与文件内容严格一致 |
| 仅 .md 文件 | 只有 Markdown 文件参与 wikilink 解析 |
| 按 RID 优先匹配 | 链接目标若以 res_ 开头，直接 RID 查询 |
| 基于 RID 存储 | wikilink 关系用 RID 标识，文件重命名不影响链接 |

#### Wikilink 与 Sync 的协作

| sync 模式 | 行为 |
|-----------|------|
| `lo sync` | 增量同步，新增/修改的 .md 自动解析 wikilink |
| `lo sync --wikilinks` | 增量同步 + 全量重建所有 .md 的 wikilink |
| `lo sync --full --wikilinks` | 全量文件同步 + 全量重建 wikilink |

#### 标题 vs 路径 vs RID

| 概念 | 是什么 | 在 wikilink 中的角色 |
|------|------|-------------------|
| 标题 | # 后的文字，可随时修改 | 链接目标：`[[标题]]` 匹配，标题变更→链接断裂 |
| 路径 | 文件在磁盘的位置 | 不直接参与 wikilink，但 sync 重命名检测 |
| RID | 资源的永久 ID，永不改变 | 关系存储的锚点，文件和标题可任意变 |

#### 使用建议

- ✅ 笔记间的知识关联（Zettelkasten、MOC 等）
- ✅ 建立个人 wiki 网络
- ❌ 链接到图片/PDF 等非 .md 文件（用 `lo link`）
- ❌ 链接到不存在或标题不匹配的文件（静默忽略）
- 保持标题稳定，定期 `lo sync --wikilinks`
- 用别名改善可读性：`[[长标题|简短名]]`
- 配合 `lo link` 使用：wikilink 处理笔记内引用，`lo link` 处理跨类型关系

---

### 六、Markdown 图片引用（embed 关系）

#### 什么是 embed 关系

Markdown 笔记中可以通过 `![alt](path)` 或 `<img>` 标签引用图片。lo 在 `lo sync` 时自动解析这些引用，将其转化为 `embed` 类型的资源关系。

基本语法：

```markdown
![图片描述](./assets/photo.png)
<img src="./assets/photo.png" alt="图片描述">
```

#### 工作原理

从 Markdown 到数据库的完整流程：

1. **写入** 图片引用语法到 `.md` 文件中
2. **`lo sync`** 触发解析
3. **正则解析**：
   - Markdown 图片：分两步解析（先匹配 `![alt]`，再用括号计数法提取 URL）
   - HTML img 标签：`<img\s+[^>]*?src=["']([^"']+)["'][^>]*?\/?\s*>`
4. **三级路径解析**：
   - Level 1: 路径以 `res_` 开头 → RID 直接匹配
   - Level 2: 基于 source resource 路径上下文拼接 → `resolveResource`
   - Level 3: 提取文件名 → `resolveResource(name)` 兜底查找
   - 未匹配的目标产生 `broken` 引用状态
5. **事务写入**：在 SQLite 事务中先删除旧派生关系，再创建新关系，`metadata.origin = 'markdown_parser'`

关键设计决策：

| 决策 | 说明 |
|------|------|
| 事务原子性 | 删除+创建在 SQLite 事务中执行，任何步骤失败全部回滚 |
| 全量重建 | DELETE 旧派生关系再 INSERT 新，保证与文件内容严格一致 |
| RID 优先 + 路径上下文 | 三级回退策略：RID → 路径上下文拼接 → 文件名查找 |
| origin 隔离 | wikilink/embed 标记 `origin: 'markdown_parser'`，与用户关系隔离 |
| 历史兼容 | 无 origin 的旧 wikilink 通过 `IS NULL` 条件一并清理 |
| 括号计数 | 使用 depth-based matching 替代正则，支持路径含括号（如 `state(1).png`） |
| 不处理远程 URL | `http://`、`https://`、`data:` 协议的图片不产生关系 |
| 不创建资源 | 引用的图片文件不存在时不自动创建 Resource，仅标记 broken |

#### embed 与 wikilink 的协作

`lo sync` 时同时解析 `[[wikilink]]` 和 `![embed]` 引用，一次完成所有派生关系的重建：

```
lo sync
  ├── 解析 [[wikilink]] → wikilink 关系（双向）
  └── 解析 ![embed]    → embed 关系（单向）
```

| 特性 | wikilink | embed |
|------|----------|-------|
| 语法 | `[[标题]]` | `![alt](path)` |
| 方向 | 双向链接 | 单向引用 |
| 目标类型 | 仅 note | note/image/pdf/video 等 |
| origin | `markdown_parser`（新）/ null（旧） | `markdown_parser` |
| 重建策略 | 全量替换（事务内） | 全量替换（事务内） |
| 历史兼容 | 支持无 origin 旧数据 | 无（新功能） |

#### broken 引用处理

当 Markdown 引用的图片资源不存在时：

- 不创建 embed 关系
- 不自动创建 Resource
- 下次 `lo sync` 时重试解析

#### 使用建议

- ✅ 使用相对路径引用同仓库图片
- ✅ 使用 RID 引用确保唯一匹配：`![描述](res_xxx)`
- ❌ 使用远程 URL（不会产生关系）
- ❌ 使用 `data:` base64 编码（不会产生关系）

---

### 七、软删除与关联数据残留

#### 什么是软删除

lo 中删除资源采用软删除策略：资源行在数据库中标记 `deleted = 1`，而非从 `resources` 表中物理移除。所有查询 API 中 `WHERE deleted = 0` 会将其过滤。

设计意图：保留数据以供未来可能的恢复、审计或同步冲突处理。

#### 软删除时 relations 不清除

当某一资源（称其为 B）被软删除时，`relations` 表中所有包含 B 的记录不会被自动清除。

```
删除前:
  A ---[wikilink]--→ B
  relations: { from_rid: A, to_rid: B, type: 'wikilink' }

执行 lo rm + lo commit 后:
  resources:  B.deleted = 1
  relations:  { from_rid: A, to_rid: B, type: 'wikilink' }  ← 保留
```

#### 各 API 的行为差异

| API | 对已删除资源的 relation 行为 |
|-----|--------------------------|
| resourceService.* | 不返回。所有查询带 WHERE deleted = 0 过滤 |
| relationService.getRelations(rid) | 正常返回。不做任何过滤 |
| queryEngine.getGraph(rid) | 不可见。JOIN 时有 AND r.deleted = 0 过滤 |
| queryEngine.getStats() (totalRelations) | 计入总数。直接 COUNT(*)，无过滤 |

关键差异：`relationService`（底层 API）不做资源有效性判断；`queryEngine.getGraph`（高层 API）通过 JOIN 过滤已删资源。

#### 设计理由

软删除不级联清除 relations 是基于以下几点：
1. **数据可恢复性**：保留 relations 以备恢复时重建关联
2. **审计追溯**：保留历史链接关系
3. **同步冲突处理**：为冲突处理保留上下文
4. **关注点分离**：底层 API 不承担业务校验职责

#### 跨设备同步中的行为

`RESOURCE_DELETED` 操作重放时仅更新 `deleted = 1`，不包含 relations 清理指令。孤儿 relation 数据会随同步传播到所有设备。

---

### 相关文档

- [RID 一等公民机制](rid.md) — 资源标识符详解
- [标签与分类](tags-categories.md) — tag 和 category 系统
- [版本控制](version.md) — 暂存区与提交历史
- [数据库结构](database.md) — resources/relations 表结构
- [远程同步](sync.md) — 跨设备同步中的删除行为
- [Markdown 图片引用](../markdown-image-relations.md) — embed 关系技术文档
