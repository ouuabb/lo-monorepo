## import — 导入资源

**用法:** `lo import <路径> [--type <类型>] [--category <分类>]`

将外部文件或整个目录导入到资源仓库。

- **导入单个文件:** 将文件复制到 resources/ 并注册到数据库
- **导入目录:** 递归扫描目录中的支持文件并批量导入
- **同名冲突:** 导入资源若与已有活跃资源同名，自动入栈（分配下一个空闲 layer），不覆盖已有数据
- **加密行为:** 全仓库加密模式下自动加密；明文模式下明文存储。可通过 `lo encrypt <rid>` 随时加密导入的文件

**默认分类:** 与 lo new 一样，笔记归入默认分类（"未分类"），其他类型归入"其他资源"。可通过 --category 显式指定分类（支持多级路径），或通过 lo config 修改默认值。

### 选项

| 选项 | 说明 |
|------|------|
| `--type` | 统一指定资源类型（如不指定则根据扩展名推断） |
| `--category` | 分类名，支持多级路径如 编程/Python/爬虫 |

### 示例

```bash
lo import ~/文档/笔记.md                            # 导入（自动默认分类）
lo import ~/文档/算法.md --category 编程/算法         # 导入并指定分类
lo import ~/Pictures --type image                   # 导入整个目录
lo import ~/电子书/book.epub                         # 导入插件扩展类型（需安装相应插件）
```

**内置支持的扩展名:** .md, .txt, .pdf, .png, .jpg, .mp4, .mp3, .html

**插件扩展类型:** 安装插件后，插件声明的文件扩展名（如 epub-reader 插件的 `.epub`）会自动注册到 TypeRegistry，`lo import` 会识别并正确推断类型。详见 [插件系统 - resourceTypes.extensions](../systems/plugin.md#resourcetypesextensions-文件类型扩展)。

**不支持的文件类型:** 当导入的文件类型既不在内置支持列表中，也无插件声明支持，且未通过 `--type` 显式指定类型时，`lo import` 会输出统一提示信息：

```
[warn] 不支持的文件类型: .xxx。lo 核心与已安装插件均未声明该扩展名。
       如需支持，请安装相应插件，或使用 --type <类型> 指定类型。
```

提示后仍会继续导入（创建 `type: unknown` 的 Resource），不会阻断流程。若通过 `--type` 显式指定类型，则不输出此提示。
