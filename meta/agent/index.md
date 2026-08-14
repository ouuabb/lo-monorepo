# lo-agent · 文档系统

> 文档基线：[`.baseline`](.baseline)（commit + 日期）。本文档描述均以基线为准。

## 项目定位

lo-agent 是 lo（lo Core）知识库的 **Electron 桌面端 + 客户端插件宿主**：

- **App**：通过 Electron 主进程 + `@lo/client`（本地 SDK）连接 lo Core 的 HTTP/SSH 协议——
  配置仓库地址、SSH 挑战-应答登录、获取仓库状态与资源列表、编辑笔记、关系与操作历史、
  实时事件刷新。
- **插件宿主**：加载 `{userData}/plugins/` 下的客户端插件（`@lo/agent-plugins-sdk`），
  提供命令/视图/面板/编辑器/服务扩展点 + **mountEl UI**（渲染进程 isolated world）。

## 生态链条

```
lo-agent（本仓库：Electron 桌面端 + 插件宿主）
  ├─ 主进程 src/main/
  │    ├─ LoCoreService（src/main/lo-core.cjs）封装 @lo/client
  │    ├─ ipc.cjs（lo-core:* 白名单） / plugin/plugin-ipc.cjs（agent-plugins:* 白名单）
  │    └─ plugin/ 插件宿主（PluginManager / Loader / Adapter / ExtensionRegistry / Installer / Store）
  ├─ preload src/preload/index.cjs（contextBridge 白名单 + pluginUi isolated world 桥）
  └─ 渲染进程 src/renderer/（React 19 + Vite；经 window.loAgent 白名单调用）
         │
         ▼ @lo/client（lo-client-sdk）
      lo Core（世界模型，唯一持有者）
```

依赖方向（单向）：`Plugin → ctx.lo(契约) → Host Adapter → @lo/client → lo Core`；
renderer → main 一律经 preload 白名单通道。

## 文档地图

| 文档 | 内容 |
|---|---|
| [`progress.md`](progress.md) | 项目进度：功能矩阵（实现/验证状态）+ 里程碑 + 未实现/未来 |
| [`architecture.md`](architecture.md) | 实现方式：主进程↔核心、IPC 白名单、插件宿主、mountEl、渲染进程 |
| [`boundary.md`](boundary.md) | 边界与铁律：IPC 白名单、安全基线、G2、插件宿主边界 |
| [`release.md`](release.md) | 构建与发布：dev/build/start、打包、CI |
| [`reference/ipc-channels.md`](reference/ipc-channels.md) | **IPC 白名单通道目录**（由 `scripts/docs-gen.cjs` 自动生成，勿手改） |

## 文档体系

- **机器事实层**：`reference/ipc-channels.md` 由 `scripts/docs-gen.cjs` 从源码 CHANNELS
  常量生成，永不漂移。
- **人工解释层**：architecture/boundary/progress/release 负责「为什么、怎么运行、边界、验证」。
- **一致性保障**：`npm run docs:check`（`scripts/docs-check.cjs`）校验生成幂等、
  白名单一致性（preload 只引用主进程已注册通道）、引用路径存在。
- 契约口径引用：生态总纲 `lo-meta/ecosystem/AGENTS.md`（§1 契约铁律、§2.6 本仓库速查、
  §12 不可触犯边界）、SDK `@lo/agent-plugins-sdk` `docs/manifest-spec.md`。

## 常用命令

```bash
npm run dev       # 并行启动 Vite dev server（5173）与 Electron（HMR）
npm run build     # Vite 构建渲染进程到 dist/
npm start         # 构建后启动 Electron 生产模式
npm test          # Jest（覆盖率默认开启；勿裸跑 npx jest）
npm run lint      # ESLint
npm run docs      # 重新生成 docs/reference/ipc-channels.md
npm run docs:check# 文档系统一致性校验
```

> 应用内另有一套面向用户的文档查看器（`src/renderer/src/docs/content/`，在 App 的「文档」
> 面板中渲染），与本仓库 `docs/` 相互独立、不重复。
