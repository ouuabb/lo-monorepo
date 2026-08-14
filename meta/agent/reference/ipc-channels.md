# IPC 白名单通道目录

> 本文档由 `scripts/docs-gen.cjs` 从源码 CHANNELS/CHANNEL 常量**自动生成**，请勿手改。
> 修改通道后运行 `npm run docs` 重新生成。

## lo-core:*（App ↔ Core 能力桥）

| key | channel | 定义文件 |
|---|---|---|
| `CONFIG` | `lo-core:config` | `src/main/ipc.cjs` |
| `CONFIGURE` | `lo-core:configure` | `src/main/ipc.cjs` |
| `LOGIN` | `lo-core:login` | `src/main/ipc.cjs` |
| `STATUS` | `lo-core:status` | `src/main/ipc.cjs` |
| `LIST_NOTES` | `lo-core:list-notes` | `src/main/ipc.cjs` |
| `GET_NOTE` | `lo-core:get-note` | `src/main/ipc.cjs` |
| `UPDATE_NOTE` | `lo-core:update-note` | `src/main/ipc.cjs` |
| `LOGOUT` | `lo-core:logout` | `src/main/ipc.cjs` |
| `RELATIONS` | `lo-core:relations` | `src/main/ipc.cjs` |
| `OPERATIONS` | `lo-core:operations` | `src/main/ipc.cjs` |
| `OPERATION_UNDO` | `lo-core:operation-undo` | `src/main/ipc.cjs` |
| `EVENTS_SUBSCRIBE` | `lo-core:events-subscribe` | `src/main/ipc.cjs` |
| `EVENTS_UNSUBSCRIBE` | `lo-core:events-unsubscribe` | `src/main/ipc.cjs` |
| `EVENTS_PUSH` | `lo-core:event` | `src/main/ipc.cjs` |

## agent-plugins:*（插件能力白名单）

| key | channel | 定义文件 |
|---|---|---|
| `LIST_COMMANDS` | `agent-plugins:list-commands` | `src/main/plugin/plugin-ipc.cjs` |
| `EXECUTE_COMMAND` | `agent-plugins:execute-command` | `src/main/plugin/plugin-ipc.cjs` |
| `LIST_VIEWS` | `agent-plugins:list-views` | `src/main/plugin/plugin-ipc.cjs` |
| `RENDER_VIEW` | `agent-plugins:render-view` | `src/main/plugin/plugin-ipc.cjs` |
| `LIST_PANELS` | `agent-plugins:list-panels` | `src/main/plugin/plugin-ipc.cjs` |
| `RENDER_PANEL` | `agent-plugins:render-panel` | `src/main/plugin/plugin-ipc.cjs` |
| `LIST_EDITORS` | `agent-plugins:list-editors` | `src/main/plugin/plugin-ipc.cjs` |
| `RENDER_EDITOR` | `agent-plugins:render-editor` | `src/main/plugin/plugin-ipc.cjs` |
| `LIST_SERVICES` | `agent-plugins:list-services` | `src/main/plugin/plugin-ipc.cjs` |
| `GET_UI_MODULE` | `agent-plugins:get-ui-module` | `src/main/plugin/plugin-ipc.cjs` |
| `CTX` | `agent-plugins:ctx` | `src/main/plugin/plugin-ipc.cjs` |
| `INSTALL` | `agent-plugins:install` | `src/main/plugin/plugin-ipc.cjs` |
| `LIST_PLUGINS` | `agent-plugins:list-plugins` | `src/main/plugin/plugin-ipc.cjs` |
| `ENABLE` | `agent-plugins:enable` | `src/main/plugin/plugin-ipc.cjs` |
| `DISABLE` | `agent-plugins:disable` | `src/main/plugin/plugin-ipc.cjs` |
| `UNINSTALL` | `agent-plugins:uninstall` | `src/main/plugin/plugin-ipc.cjs` |
| `GET_PLUGIN_CONFIG` | `agent-plugins:get-plugin-config` | `src/main/plugin/plugin-ipc.cjs` |
| `SET_PLUGIN_CONFIG` | `agent-plugins:set-plugin-config` | `src/main/plugin/plugin-ipc.cjs` |

## window:*（窗口控制）

| key | channel | 定义文件 |
|---|---|---|
| `WIN_MINIMIZE` | `window:minimize` | `src/main/index.cjs` |
| `WIN_TOGGLE_MAXIMIZE` | `window:toggle-maximize` | `src/main/index.cjs` |
| `WIN_CLOSE` | `window:close` | `src/main/index.cjs` |
| `WIN_IS_MAXIMIZED` | `window:is-maximized` | `src/main/index.cjs` |
| `WIN_ON_MAXIMIZE_CHANGE` | `window:maximized-change` | `src/main/index.cjs` |

## 说明

- renderer 只经 preload 白名单调用；通道逐一绑定主进程具体方法，不透传任意调用/实例。
- renderer 侧 API 映射见 [`architecture.md`](../architecture.md)「IPC 白名单」。
- 通道值一致性由 `scripts/docs-check.cjs` 校验（preload 只引用主进程已注册通道）。
