# 构建与发布

> 文档基线：[`.baseline`](.baseline)。

## 命令

```bash
yarn install            # 安装依赖（file: 依赖 @lo/client、@lo/agent-plugins-sdk 从同级仓库检出）
npm run dev             # 并行：Vite dev server（端口 5173）+ Electron（HMR）
npm run build           # Vite 构建渲染进程 → dist/
npm start               # 构建后启动 Electron 生产模式
npm test                # Jest（含 --experimental-vm-modules；勿裸跑 npx jest）
npm run lint            # ESLint
npm run docs            # 重新生成 docs/reference/ipc-channels.md
npm run docs:check      # 文档系统一致性校验
```

## 进程加载

- 开发模式：主进程经 `ELECTRON_RENDERER_URL` 加载 Vite dev server（`src/main/index.cjs`）。
- 生产模式：`loadFile(dist/index.html)`；preload 始终为 `src/preload/index.cjs`。

## 打包

- `npm run build`（Vite）只构建渲染进程到 `dist/`；主进程与 preload 为原生 CJS，
  由 Electron 直接加载，不经打包。
- 运行所需：`src/`（main + preload + renderer）+ 构建产物 `dist/`。

## 依赖

| 依赖 | 类型 | 说明 |
|---|---|---|
| `@lo/client` | file: | 访问 lo Core 的 HTTP 客户端（LoCoreService 使用） |
| `@lo/agent-plugins-sdk` | file: | 客户端插件契约（插件宿主 + 测试使用） |
| react / react-dom | 运行时 | 渲染进程 |
| monaco-editor / react-markdown / remark-gfm | 运行时 | 编辑器 / 文档渲染 |
| electron / vite / jest / eslint / prettier | 开发 | 桌面运行时 + 构建测试 |

> `file:` 依赖：宿主 CI 从远程检出同级 `lo-client-sdk`、`lo-agent-plugins-sdk`；
> 多仓库联动先推 SDK 再推宿主（生态总纲 §3.4）。

## CI

- `.github/workflows/ci.yml`：push/PR → ubuntu + windows × Node 20/22 →
  yarn install（frozen-lockfile）→ test → lint → build。
- 注意：CI 需检出同级 `lo-client-sdk` + `lo-agent-plugins-sdk`（`file:` 依赖）。

## 发布 checklist

- [ ] `npm run build` 成功
- [ ] `npm test` + `npm run lint` 全绿
- [ ] `npm run docs:check` 通过
- [ ] 未误提交 `dist/` / `node_modules/` / 锁文件（除非有意）
