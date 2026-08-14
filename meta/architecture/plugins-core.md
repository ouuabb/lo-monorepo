# lo-plugins（plugins/core）架构

> 核对基线：见 `meta/setup/.baseline`。以当前代码为准；`@lo/plugins-sdk` 为 devDep（workspace）。

`plugins/core` 是 **lo Core 插件源码 + 分发仓库**：存放插件源码（`plugins/core/packages/` 下
`<id>/`，含 `plugin.json` manifest + `src/`），`scripts/build.cjs` 打包 tar.gz + `index.json`
分发清单。**本身不是运行环境**——插件运行发生在 lo Core 插件系统内。

## 插件

| 插件 | 说明 |
|---|---|
| `plugins/core/packages/epub-reader` | EPUB 阅读插件（commands + HTTP 阅读器 + 笔记/标注） |
| `plugins/core/packages/epub-library` | EPUB 书库展示（HTTP 页面 + JSON） |
| `plugins/core/packages/chrome-translate` | Chrome 划词翻译（content/background script） |

（插件目录清单由 `meta/scripts/docs-gen.cjs` 从 plugin.json 生成，见 `meta/plugins/core.md`。）

## 分发

- `plugins/core/scripts/build.cjs`：扫描 `packages/`，校验 manifest（id/name/version/main），打包
  `dist/<id>-<version>.tar.gz` + `index.json`（含 sha256 checksum）。
- 排除 `test/`、`node_modules/`、`*.md`；`--plugin <id>` 单包构建。

## 契约铁律（插件收敛）

epub-reader 是 facade 收敛的基准实现——插件**只经 SDK facade**
（`ctx.resources / ctx.relations / ctx.config / ctx.repoPath / ctx.logger`）：

- **禁止** `ctx.getRepository()`、裸 `repo`、`resourceService`/`relationService` 直连、
  插件内嵌 `@lo/client`、硬编码端口（如 reader 端口须经 `ctx.config(...)` 下发）。
- CLI 命令 handler 签名：`async run(args, ctx)`。
- 文件路径用 `path.join(__dirname, ...)`/`os.tmpdir()`，**禁止硬编码盘符**（Linux CI 会失败）。

## 测试

- 单测在 `plugins/core/packages/` 下各插件 `test/`（commands/reader/store/epubParser/plugin 等）。
- Mock 用 SDK facade 形状，不 mock 裸 repo；`pnpm --filter lo-plugins test`（jest）。

## 边界

- 跨包依赖走 workspace（`@lo/plugins-sdk` devDep）；分发产物 `dist/` 不入库。
- 正式文档唯一在 `meta/`（本文件 + 生成的插件目录）。
