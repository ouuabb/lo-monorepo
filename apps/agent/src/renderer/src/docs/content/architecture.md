# 架构总览

本应用遵循 Electron 标准三层结构，并坚持「渲染进程不接触 Node API」的安全基线。

```
┌────────────┐  window.loAgent    ┌─────────────┐  IPC(invoke)  ┌──────────────────┐
│  renderer   │ ────────────────▶ │  preload     │ ─────────────▶ │  main (主进程)     │
│ React/Vite  │  contextBridge    │ contextBridge│  lo-core:*    │  LoCoreService     │
└────────────┘                    └─────────────┘               └─────────┬────────┘
                                                                          │ @lo/client
                                                                          ▼
                                                              ┌────────────────────┐
                                                              │ lo serve (HTTP API) │
                                                              └────────────────────┘
```

## 主进程（src/main）

| 文件 | 职责 |
| --- | --- |
| `index.cjs` | 入口：创建 BrowserWindow、装配 LoCoreService 与 IPC |
| `lo-core.cjs` | `LoCoreService`：封装 `@lo/client` 的 configure/login/getStatus/listNotes/logout |
| `ipc.cjs` | 白名单通道 `lo-core:*` 的 `ipcMain.handle` 注册 |
| `config-store.cjs` | 配置持久化到 `userData/lo-agent.json` |

主进程方法一律返回**可序列化**数据：`{ ok: true, ... }` 或
`{ ok: false, error: 'api'|'http'|'unknown', message, ... }`，避免把 Error 实例跨 IPC 抛出。

## preload（src/preload/index.cjs）

通过 `contextBridge.exposeInMainWorld('loAgent', ...)` 暴露受控 API：

- `loAgent.version`
- `loAgent.loCore.{ getConfig, configure, login, getStatus, listNotes, logout }`

每个方法仅是对应白名单 IPC 通道的 `ipcRenderer.invoke` 转发，不暴露原生 IPC。

## renderer（src/renderer）

- React 19 + Vite，入口 `src/renderer/src/App.jsx`。
- 通过 `window.loAgent.loCore` 访问全部能力。
- 当前为单页工作台：连接表单 / 登录 / 状态 / 资源列表。

## 关键约束

- 渲染进程无 Node 能力（`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`）。
- 外部链接一律交给系统浏览器（`setWindowOpenHandler` + `shell.openExternal`）。