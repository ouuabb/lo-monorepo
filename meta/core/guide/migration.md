## 迁移指南

本文档描述如何从其他笔记工具迁移到 lo。

### 迁移总览

| 来源 | 迁移方式 | 保留内容 |
|------|---------|---------|
| Obsidian | 直接复制 `resources/` + `lo sync` | 笔记内容、[[wikilink]] |
| Notion | 导出 Markdown + `lo import` | 笔记内容、基本结构 |
| 纯文件夹 | 复制到 `resources/` + `lo sync` | 全部文件 |
| 其他 Markdown 工具 | 复制 + `lo sync` | 笔记内容 |

### 从 Obsidian 迁移

Obsidian 和 lo 有很好的兼容性，因为两者都使用 Markdown 文件和 `[[wikilink]]` 语法。

**步骤 1：准备工作**

```bash
# 创建 lo 仓库
mkdir ~/lo-vault
cd ~/lo-vault
lo init

# （可选）启用加密
lo auth add -k ~/.ssh/id_ed25519 -l "我的电脑"
```

**步骤 2：复制文件**

```bash
# 将 Obsidian vault 中的所有内容复制到 lo 的 resources/ 目录
cp -r ~/obsidian-vault/* ~/lo-vault/resources/
```

> 如果 Obsidian vault 中有 `.obsidian/` 配置目录，不需要复制到 lo 中。lo 只关心 `.md` 等资源文件。

**步骤 3：导入到 lo 数据库**

```bash
# lo sync 会自动扫描并导入所有文件
lo sync

# 重建 wikilink 索引
lo sync --wikilinks
```

**步骤 4：验证**

```bash
# 检查导入的笔记数量
lo list --limit 100

# 检查链接是否正常
lo list
```

**迁移后的注意事项：**

- Obsidian 特有的插件语法（如 Dataview 查询）在 lo 中不会生效，但会作为纯文本保留。
- Obsidian 的 `[[笔记名]]` 语法会被 lo 识别并建立 wikilink，但如果标题有重复，**建议逐步将链接改为 RID 格式 `[[res_xxx]]`**，以获得精确无歧义的链接。
- Obsidian 的 YAML front matter 会被保留在笔记内容中，但 lo 不会自动解析它。
- Obsidian 附件（图片、PDF 等）可以被识别为资源并入库，但不会自动提取内容。

**关于 Obsidian 文件夹结构：**

lo 不使用文件夹来组织笔记——它使用标签（tags）和分类（category）。迁移后，建议：

1. 将 Obsidian 的文件夹路径映射为 lo 的**分类**（category）
2. 使用**标签**替代跨文件夹的主题标注

```bash
# 示例：将 Obsidian 的 "编程/Python/" 文件夹中的笔记归入对应分类
lo category set res_xxx 编程/Python
lo tag add res_xxx 教程 爬虫
```

### 从 Notion 迁移

Notion 的导出格式为 Markdown + CSV，可以批量导入 lo。

**步骤 1：从 Notion 导出**

1. 在 Notion 中，进入"设置与成员" → "设置"
2. 选择"导出所有工作区内容"
3. 导出格式选择 **Markdown & CSV**
4. 下载导出的 ZIP 文件并解压

**步骤 2：导入到 lo**

```bash
cd ~/lo-vault

# 批量导入 Markdown 文件
for file in ~/Downloads/notion-export/*.md; do
    lo import "$file"
done

# 导入附件（CSV、图片等）
for file in ~/Downloads/notion-export/*.{csv,png,jpg,pdf}; do
    lo import "$file"
done
```

或者直接复制文件后执行 sync：

```bash
cp -r ~/Downloads/notion-export/* ~/lo-vault/resources/
lo sync
```

**步骤 3：整理**

```bash
# 批量添加标签
lo tag add res_xxx notion-import

# 设置分类
lo category set res_xxx 待整理
```

**Notion 特有问题：**

- Notion 的数据库（Database）会导出为 CSV 文件和 Markdown 文件，CSV 文件会被当作资源入库，但不会像在 Notion 中那样以表格形式呈现。
- Notion 的子页面会导出为子文件夹。
- Notion 内的图片嵌入会保留为本地文件引用。

### 从纯文件夹迁移

如果你的笔记是分散在各处的 `.md` / `.txt` / 图片 / PDF 文件：

**批量迁移：**

```bash
# 方法一：直接复制（最快）
cd ~/my-notes
cp -r ~/old-notes/* resources/

# 然后扫描导入
lo sync
```

```bash
# 方法二：逐个导入（保留精确控制）
cd ~/my-notes
lo import ~/old-notes/note1.md
lo import ~/old-notes/photo.jpg
lo import ~/old-notes/document.pdf
```

**针对大量文件的脚本化导入（Linux/macOS）：**

```bash
#!/bin/bash
# 批量导入脚本
SOURCE_DIR="$HOME/old-notes"
DEST_DIR="$HOME/lo-vault"

cd "$DEST_DIR"

# 复制所有文件
find "$SOURCE_DIR" -type f | while read file; do
    rel_path="${file#$SOURCE_DIR/}"
    mkdir -p "$(dirname "resources/$rel_path")"
    cp "$file" "resources/$rel_path"
done

# 一次性扫描入库
lo sync
```

### 从其他 Markdown 工具迁移

以下工具都可以通过复制文件 + `lo sync` 迁移：

| 工具 | 迁移方式 |
|------|---------|
| Typora | 直接复制 `.md` 文件到 `resources/` |
| Joplin | 导出为 Markdown 后复制 |
| Logseq | 直接复制 `pages/` 和 `journals/` 中的文件 |
| Roam Research | 导出为 Markdown 后复制 |
| Bear | 导出为 Markdown 后复制 |
| VS Code / 编辑器 | 直接复制 `.md` 文件到 `resources/` |

### 迁移后的整理建议

迁移完成后，建议按以下步骤整理知识库：

```bash
# 1. 查看统计信息
lo stats

# 2. 批量添加分类（按目录结构映射）
# 将旧笔记统一归入"待整理"
lo list | while read rid; do
    lo category set "$rid" 待整理
done

# 3. 搜索特定内容，打标签
lo find "关键词" --limit 100

# 4. 重建 wikilink
lo sync --wikilinks

# 5. 如果内容无误，提交
lo add .
lo commit -m "迁移完成，初始导入"
```

### 注意事项

- **文件名冲突**：如果迁移的文件名与 lo 的命名规范冲突，lo 的资源栈机制会自动处理同名冲突（后来的文件入栈 layer 1~19）。
- **大文件**：对于超大的二进制文件（>100MB），建议评估是否真的需要存入 lo。lo 更适合管理知识性内容。
- **加密**：如果在 `lo init` 后启用了加密，所有导入的文件都会以 LOEC 加密格式存储。未启用加密则保持明文。
- **文件类型**：lo 支持所有文件类型。未知类型会被标记为 `type: unknown`，但仍可作为资源管理。

### 相关文档

- [快速上手](getting-started.md) — 从零开始使用 lo
- [日常工作流](workflow.md) — 日常操作流程
- [资源模型](../core/resource-model.md) — 理解资源、标签与分类
- [Wikilink 双向链接](../core/wikilink.md) — [[wikilink]] 语法详解
