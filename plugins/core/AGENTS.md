# AGENTS.md — lo-plugins（Core 插件仓库）

本文件是 **薄入口**。lo 生态唯一权威总纲已由 **opencode 全局配置自动加载**
（`~/.config/opencode/opencode.jsonc` → `instructions`）；工作区布局下亦可读
`../meta/AGENTS.md`。
（含：契约铁律 §1、不可触犯边界 §12、开发流程 §3、测试 §4、文档 §5、审查 §6、陷阱 §7、
边界速查 §8、各仓库速查 §2）。**开始任何改动前，先读总纲。**

## 本仓库定位

`lo-plugins` 是 **lo Core 插件源码 + 分发仓库**：存放插件源码（`packages/<id>/`，含
`plugin.json` manifest + `src/`），`scripts/build.cjs` 打包 tar.gz + `index.json` 分发清单
（GitHub Pages 发布）。**本身不是运行环境**——插件运行发生在 lo Core 插件系统内。

## 包

| 包 | 说明 |
|---|---|
| `packages/epub-reader` | EPUB 阅读插件（commands + HTTP 阅读器 + 笔记/标注） |
| `packages/epub-library` | EPUB 书库展示（HTTP 页面 + JSON） |
| `packages/chrome-translate` | Chrome 划词翻译（content/background script） |

## 技术栈与命令

- 纯 CommonJS；Node >= 20；Yarn。
- `yarn test` / `npm test`（Jest，209+ 用例）；`yarn run build`（打包）；`yarn run docs:build`。

## 契约铁律（插件收敛，速记）

epub-reader 是 facade 收敛的基准实现——插件**只经 SDK facade**
（`ctx.resources/ctx.relations/ctx.config/ctx.repoPath/ctx.logger`）；**禁止**
`ctx.getRepository()`、裸 `repo`、`resourceService`/`relationService` 直连、内嵌 `@lo/client`、
硬编码端口（如 reader 8765 须经 `ctx.config('readerBaseUrl')` 下发）；CLI handler 签名
`async run(args, ctx)`；文件路径用 `path.join(__dirname, ...)`/`os.tmpdir()`，**禁止硬编码盘符**
（Linux CI 会失败）。

## 提交要点

- Conventional Commits（type 英文小写 + subject 中文，header ≤ 72 字符）；husky 强制。
- 不提交 `dist/`、`node_modules/`、`coverage/`。
- CI：ubuntu + windows × Node 20/22；需检出同级 `lo-plugins-sdk`。

## 完整细节

测试方式（mock facade 形状）、契约铁律 → 见总纲 **§2.5**。
