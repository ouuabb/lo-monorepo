# lo-plugins

lo Core **官方插件源码 + 分发仓库**（`plugins/core`）。本身不是运行环境——插件运行在
lo Core 插件系统内。

## 插件

| 插件 | 说明 |
|---|---|
| `packages/chrome-translate` | Chrome 划词翻译，同步翻译记录到 lo 仓库 |
| `packages/epub-reader` | EPUB 阅读、标注、笔记（Web 阅读器 + CLI 命令） |
| `packages/epub-library` | EPUB 书库展示，读取 epub Resource 渲染书架 |

（完整目录由 `meta/plugins/core.md` 生成。）

## 命令

```bash
pnpm --filter lo-plugins test              # jest
pnpm --filter lo-plugins build             # 打包 dist/（tar.gz + index.json）
pnpm --filter lo-plugins build -- --plugin <id>   # 只打包指定插件
```

## 文档

正式架构/契约文档统一在 **lo 生态文档中心**（唯一 Source of Truth）：
`meta/architecture/plugins-core.md`、`meta/AGENTS.md`、`meta/specs/`。

## 开发规范

见 [`AGENTS.md`](AGENTS.md)（薄入口）与生态总纲 `meta/AGENTS.md`。
