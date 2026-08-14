# EPUB 阅读插件

## 概述

`epub-reader` 为 lo 系统提供 EPUB 文件阅读能力，并将阅读过程中产生的标注、笔记与 lo 知识体系关联。

插件负责 EPUB 领域相关能力：

- EPUB 文件解析（元数据、目录、章节文本）
- 阅读状态管理（位置、进度）
- 文本标注（高亮、书签）
- 笔记创建与来源关系建立

插件不负责：

- Resource 基础管理（由 lo Core 提供）
- 文件存储管理（不修改原始 EPUB 文件）
- 通用关系管理（使用 lo Core 的 relation 能力）

## 安装与使用

### 1. 安装插件

**从源码构建插件包**（开发者）：

```bash
cd lo-plugins
node scripts/build.cjs
# 产物：dist/epub-reader-0.1.0.tar.gz + dist/index.json
```

**在 lo 仓库中安装**：

```bash
# 进入你的 lo 仓库目录
cd my-lo-repo

# 配置插件仓库指向本地构建产物（PowerShell）
$env:LO_PLUGIN_REGISTRY = "file:///C:/path/to/lo-plugins/dist/index.json"

# 安装 epub-reader 插件
lo plugin install epub-reader

# 验证安装
lo plugin list          # 应显示 epub-reader
lo plugin info epub-reader  # 查看详情
```

> 插件安装到仓库的 `.repo/plugins/epub-reader/` 目录，安装后自动启用。

### 2. 导入 EPUB 文件

```bash
lo import book.epub
# 输出: 成功导入资源: 2024xxxx (importer: epub)
```

### 3. 使用 Web 阅读器

```bash
# 启动 lo serve
lo serve
# 输出: Server running at http://127.0.0.1:8765
```

浏览器打开：

```
http://127.0.0.1:8765/api/plugins/epub-reader/reader?rid=2024xxxx
```

> `rid` 替换为 `lo import` 返回的资源 ID。

### 4. 使用 CLI 命令

```bash
# 查看阅读信息
lo ext epub:info 2024xxxx

# 添加高亮
lo ext epub:highlight 2024xxxx "epubcfi(0!/4/2:12,/4/2:24)" "高亮文本"

# 添加书签
lo ext epub:bookmark 2024xxxx "epubcfi(0!/2:0,/2:0)" "书签标题"

# 创建笔记（自动创建 note Resource + source-of 关系）
lo ext epub:note 2024xxxx "我的阅读笔记" "epubcfi(0!/4/2:12,/4/2:24)" "引用原文"
```

### 5. 插件配置

```bash
# 查看全部配置
lo plugin config epub-reader

# 设置数据目录（默认 .lo/plugins/epub-reader）
lo plugin config epub-reader dataDir .lo/plugins/epub-reader
```

### 6. 卸载插件

```bash
# 卸载（保留文件，配置保留）
lo plugin uninstall epub-reader

# 彻底删除（同时删除文件和配置）
lo plugin uninstall epub-reader --delete
```

> 阅读状态、高亮、书签等插件私有数据存储在 `dataDir` 指定的目录中（默认 `.lo/plugins/epub-reader/database.sqlite`），`uninstall --delete` 不会删除该目录（它属于运行数据，不是插件文件）。如需彻底清理，手动删除该目录。

## 工作原理

### 数据流

```
EPUB 文件
  ↓
lo import book.epub       ← importers 扩展点
  ↓
epub Resource（type=epub）
  ↓
lo ext epub:open <rid>      ← commands 扩展点（在浏览器中打开 Web 阅读器）
  ↓
解析章节 → Web 阅读器 → 保存阅读状态
  ↓
标注 / 笔记
  ↓
Resource + source-of 关系
  ↓
lo 知识体系
```

### 数据归属

阅读过程产生的数据分为两类，存储位置严格隔离：

| 数据类型 | 内容 | 存储位置 |
|---------|------|---------|
| 插件私有数据 | 阅读状态、阅读设置、高亮、书签 | 插件独立 SQLite（`.lo/plugins/epub-reader/database.sqlite`） |
| 用户知识数据 | 阅读笔记、批注、总结 | lo Resource 体系（通过 `ctx.resources.create`） |

**核心原则**（依据插件数据存储设计说明）：

1. 插件运行状态属于插件，**不进入 lo 核心数据库**——避免核心被插件专用表污染
2. 用户知识资产属于 lo Resource，**不停留在插件内部**——参与搜索/关联/链接
3. 插件通过 lo 提供的能力产生知识，而不是通过共享数据库结构连接

> 为什么不写入 lo 核心 SQLite：如果 EPUB 插件在核心库建 `epub_reading_state`、`epub_highlight` 等表，未来 PDF/图片/视频插件都会要求修改核心，核心将依赖所有插件。插件独立 SQLite 保证：插件卸载时直接删除数据目录即可，不影响核心；插件内部数据结构演化无需修改核心。

## EPUB Resource 模型

| 字段 | 类型 | 说明 |
|------|------|------|
| type | `epub` | 资源类型 |
| path | string | EPUB 文件路径（不修改原文件） |
| title | string | 书名 |
| metadata.title | string | 书名（来自 dc:title） |
| metadata.author | string | 作者（来自 dc:creator） |
| metadata.publisher | string | 出版社 |
| metadata.language | string | 语言 |
| metadata.spineCount | number | 章节数量 |
| metadata.chapterTitles | array | 章节标题列表 |

EPUB 文件本身作为内容源：

- 不修改原始文件
- 不将笔记写入 EPUB
- 不改变 EPUB 内部结构

## 原文定位

EPUB 内容使用稳定的位置标识，不依赖页码或屏幕位置（不同环境下排版会变化）。

插件统一采用 EPUB CFI（Canonical Fragment Identifier）作为定位标识，基于 DOM 节点路径 + 文本偏移，可精确恢复文本选区：

```
epubcfi(<spineIndex>!<startPath>:<startOffset>,<endPath>:<endOffset>)
```

- `spineIndex` — spine 中的章节序号（从 0 开始）
- `<path>` — 元素/文本节点路径，编码规则：元素节点 `step=(childIndex+1)*2`，文本节点 `step=(childIndex+1)*2+1`，以 `/` 分隔
- `<offset>` — 文本节点内的字符偏移

示例：

```
epubcfi(2!/2:0,/2:0)              → 第 3 章开头（章节级）
epubcfi(2!/4/2:12,/4/2:24)        → 第 3 章中某段落的第 12-24 字符
```

> Web 阅读器保存阅读状态、高亮、书签、笔记时均使用 CFI 格式。

用于：

- 恢复阅读位置
- 恢复高亮标注
- 从笔记跳转回原文

## 命令

通过 `commands` 扩展点注册，用户通过 `lo ext epub:<name>` 调用。

### epub:open — 浏览器打开阅读器

```bash
lo ext epub:open <rid>
```

在系统默认浏览器中打开 Web 阅读器页面（`http://127.0.0.1:8765/api/plugins/epub-reader/reader?rid=<rid>`），需先启动 `lo serve`。

### epub:info — 元信息

```bash
lo ext epub:info <rid>
```

显示：

- 书名、作者、出版社、语言、章节数、总字数
- 阅读状态（进度、位置、更新时间）
- 标注统计（高亮数、书签数）
- 完整目录（含每章字数）

### epub:note — 创建笔记

```bash
lo ext epub:note <rid> [--quote <引用文本>] [--location <位置>]
```

创建笔记 Resource 并建立来源关系：

1. 交互式输入笔记内容（Markdown 格式，空行结束）
2. 创建 note Resource，metadata 包含 `sourceResource`、`location`、`quote`
3. 建立 `source-of` 关系：EPUB Resource → 笔记 Resource

> CLI 命令每次调用都会新建笔记，不进行去重；如需"同 location 仅一条笔记"的去重行为，请使用 Web 阅读器的 `POST /api/plugins/epub-reader/notes` 端点。

### epub:notes — 列出关联笔记

```bash
lo ext epub:notes <rid>
```

通过 `source-of` 关系查询并列出该 EPUB 的所有关联笔记。

### epub:highlight — 添加高亮

```bash
lo ext epub:highlight <rid> <location> <text>
# location 格式: epubcfi(<spineIndex>!<start>:<offset>,<end>:<offset>)
```

### epub:highlights — 列出高亮

```bash
lo ext epub:highlights <rid>
```

### epub:bookmark — 添加书签

```bash
lo ext epub:bookmark <rid> <location> [title]
```

### epub:bookmarks — 列出书签

```bash
lo ext epub:bookmarks <rid>
```

## 扩展点

插件注册 4 个扩展点：

| 扩展点 | key | 说明 |
|-------|-----|------|
| importers | `epub` | `lo import *.epub` 时解析并创建 epub Resource |
| commands | `epub:open` 等 8 个 | 浏览器打开阅读器、标注、笔记命令（CLI） |
| commands | `epub-reader:*` 12 个 | Web 阅读器 HTTP 端点（lo serve 挂载） |
| resourceTypes | `epub`、`note` | 注册 epub 资源类型与 note 笔记类型及 metadata schema（`epub-reader/src/manifest.cjs`） |
| relationTypes | `source-of` | EPUB 与笔记的来源关系 |

### importers 扩展点

```javascript
extRegistry.register(manifest.id, 'importers', 'epub', {
  supports: this._supportsEpub.bind(this),  // .epub 扩展名匹配
  import: this._importEpub.bind(this),      // 解析 EPUB → 创建 Resource
});
```

`lo import book.epub` 时：

1. `supports()` 判断文件扩展名是否为 `.epub`
2. `import()` 解析 EPUB（元数据、章节），调用 `ctx.resources.create()` 创建 epub Resource
3. 返回 `{ resources: [resource], relations: [] }`

## Web 阅读器

插件通过 `commands` 扩展点注册 12 个 HTTP 端点，`lo serve` 启动时自动挂载，提供浏览器内 EPUB 阅读器。

### 使用方式

```bash
# 1. 导入 EPUB 文件
lo import book.epub
# 输出: 成功导入资源: 2024xxxx

# 2. 启动 lo serve
lo serve

# 3. 浏览器打开阅读器
# http://127.0.0.1:8765/api/plugins/epub-reader/reader?rid=2024xxxx
```

### 阅读器功能

- **章节导航**：侧边栏目录跳转、上一章/下一章按钮、键盘左右箭头
- **文本选择 → 标注**：选中文字后弹出工具栏，支持高亮（4 色）、书签、笔记
- **高亮管理**：点击高亮可删除，4 种颜色（黄/绿/蓝/粉）
- **书签侧边栏**：点击跳转，悬停删除
- **笔记创建**：选中文字 → 笔记 → 输入内容 → 自动创建 note Resource + `source-of` 关系；同一 EPUB + 同一 location 只保留一条笔记，再次提交将更新已有笔记的 `content` / `quote`（按 `source-of` 关系 metadata 中的 `location` 去重）
- **阅读进度**：自动保存到插件 SQLite，重新打开时恢复
- **阅读设置**：字号（14-28px）、主题（浅色/深色/护眼），本地存储

### HTTP API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/plugins/epub-reader/reader` | 阅读器 HTML 页面（?rid=xxx） |
| GET | `/api/plugins/epub-reader/book` | 书籍元数据 + 章节目录（?rid=xxx） |
| GET | `/api/plugins/epub-reader/chapter` | 章节内容（?rid=xxx&index=0） |
| GET | `/api/plugins/epub-reader/state` | 获取阅读状态（?rid=xxx） |
| PUT | `/api/plugins/epub-reader/state` | 保存阅读状态（body: {rid, location, progress}） |
| GET | `/api/plugins/epub-reader/highlights` | 高亮列表（?rid=xxx） |
| POST | `/api/plugins/epub-reader/highlights` | 添加高亮（body: {rid, location, text, style?}） |
| DELETE | `/api/plugins/epub-reader/highlights` | 删除高亮（body: {rid, id}） |
| GET | `/api/plugins/epub-reader/bookmarks` | 书签列表（?rid=xxx） |
| POST | `/api/plugins/epub-reader/bookmarks` | 添加书签（body: {rid, location, title?}） |
| DELETE | `/api/plugins/epub-reader/bookmarks` | 删除书签（body: {rid, id}） |
| POST | `/api/plugins/epub-reader/notes` | 创建或更新笔记（同 EPUB + 同 location 去重；body: {rid, content, quote?, location?}） |

> 路由为精确匹配（非路径参数），rid 通过查询参数或 body 传递。
> `/notes` 端点的去重逻辑：先按 `rid` 查询所有 `source-of` 关系，匹配 metadata.location 与请求 location 相同的记录；命中则更新该 note 的 `content`/`quote` 与关系 metadata，未命中才新建 note Resource 并建立关系。`location` 为空字符串时按空字符串匹配（即每本书至多一条无定位笔记）。

## 内部模块

```
epub-reader/
├── src/
│   ├── epubParser.cjs   — 内容处理模块：解析 EPUB（container.xml → OPF → NCX/Nav → XHTML 文本）
│   ├── store.cjs        — 阅读状态/标注模块：插件独立 SQLite（阅读状态、设置、高亮、书签 CRUD）
│   ├── commands.cjs     — 笔记处理模块 + CLI 命令实现（open/info/note/highlight/bookmark）
│   ├── reader.cjs       — Web 阅读器后端：12 个 HTTP handler（API + HTML 页面）
│   ├── reader.html      — Web 阅读器前端：单页应用（章节导航/文本选择/高亮/书签/笔记）
│   ├── plugin.cjs       — 插件主类：注册扩展点
│   ├── manifest.cjs     — 插件清单：元信息 + 扩展点声明
│   └── index.cjs        — 入口
├── test/
│   ├── epubParser.test.cjs  — 解析器单元测试（纯函数 + 端到端）
│   ├── store.test.cjs       — 存储单元测试（CRUD + 持久化）
│   ├── reader.test.cjs      — Web 阅读器 handler 单元测试（12 端点 + 缓存）
│   └── plugin.test.cjs      — 插件单元测试（注册 + 导入 + HTTP 端点）
├── plugin.json          — 打包清单
└── package.json
```

### epubParser — 内容处理模块

解析流程：

1. `adm-zip` 打开 EPUB
2. `META-INF/container.xml` → 找到 OPF 路径
3. OPF → metadata + manifest + spine
4. NCX（EPUB2）或 Nav（EPUB3）→ 目录结构
5. 按 spine 顺序提取 XHTML → 纯文本

支持的 EPUB 特性：

- EPUB2（NCX 目录）和 EPUB3（Nav 目录）
- HTML 实体解码（`&amp;`、`&lt;`、`&nbsp;`、`&hellip;` 等）
- 块级元素换行保留
- 去除 `<script>`、`<style>`、`<head>`

### store — 阅读状态/标注模块

插件独立 SQLite 数据库（`.lo/plugins/epub-reader/database.sqlite`），与 lo 核心数据库隔离。

表结构：

```sql
-- 阅读状态（每本书一条）
reading_state (resource_id PK, location, progress, updated_at)

-- 阅读设置（字体/主题/布局）
reading_settings (resource_id PK, font_size, theme, layout_mode, updated_at)

-- 高亮标注
highlight (id PK, resource_id, location, text, style, note, created_at)
-- index: idx_highlight_rid(resource_id)

-- 书签
bookmark (id PK, resource_id, location, title, created_at)
-- index: idx_bookmark_rid(resource_id)
```

设计要点：

- **resource_id 是字符串引用**，指向 lo 中的 EPUB Resource rid，但不建立物理外键（Resource 在 lo 核心库，跨库无法外键）
- **WAL 模式**：启用 `PRAGMA journal_mode = WAL` 支持并发读写
- **建表幂等**：`CREATE TABLE IF NOT EXISTS`，多次 createStore 不报错
- **UPSERT**：阅读状态/设置用 `INSERT ... ON CONFLICT DO UPDATE`，避免先查后写的竞态
- **删除带 resource_id 校验**：`DELETE WHERE id = ? AND resource_id = ?`，防止跨资源误删
- **懒加载**：db 在首次数据操作时才初始化，createStore 本身同步返回
- **生命周期**：提供 `close()`（关闭连接）和 `_destroy()`（删除 db 文件，测试用）

## 数据关系

```
《某书.epub》Resource (type=epub)
    |
    | source-of 关系
    |
    +── 笔记1.md Resource (type=note)
    |
    +── 笔记2.md Resource (type=note)
```

打开 EPUB 时（`epub:info` / `epub:notes`）：

1. 加载 EPUB Resource
2. 查询 `source-of` 关系的关联笔记
3. 显示对应标注统计

## 配置

插件在 manifest 声明 `dataDir` 配置项（string 类型），默认 `.lo/plugins/epub-reader`：

```bash
# 查看当前配置
lo plugin config epub-reader

# 设置数据存储目录（相对 lo 仓库根目录）
lo plugin config epub-reader dataDir .lo/plugins/epub-reader
```

## 使用示例

```bash
# 1. 导入 EPUB
lo import book.epub
# → 成功导入 1 个资源 (importer: epub)
# → rid: res-xxxxx

# 2. 查看元信息
lo ext epub:info res-xxxxx

# 3. 浏览器阅读（需先启动 lo serve，或在 CLI 中用下面命令自动打开）
lo serve
lo ext epub:open res-xxxxx

# 4. 添加高亮
lo ext epub:highlight res-xxxxx "epubcfi(0!/4/2:12,/4/2:24)" "重要段落"

# 5. 添加书签
lo ext epub:bookmark res-xxxxx "epubcfi(1!/2:0,/2:0)" "第二章关键点"

# 6. 创建笔记（建立 source-of 关系）
lo ext epub:note res-xxxxx --quote "原文引用" --location "epubcfi(0!/4/2:12,/4/2:24)"

# 7. 查看关联笔记
lo ext epub:notes res-xxxxx

# 8. 查看高亮/书签
lo ext epub:highlights res-xxxxx
lo ext epub:bookmarks res-xxxxx
```
