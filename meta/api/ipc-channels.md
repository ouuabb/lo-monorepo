# IPC 白名单通道目录

> 由 `meta/scripts/docs-gen.cjs` 从 apps/agent 源码 CHANNELS 常量**自动生成**，勿手改。

## lo-core:*（App ↔ Core 能力桥）

| key | channel | 定义文件 |
|---|---|---|
| `CONFIG` | `lo-core:config` | `apps/agent/src/main/ipc.cjs` |
| `CONFIGURE` | `lo-core:configure` | `apps/agent/src/main/ipc.cjs` |
| `LOGIN` | `lo-core:login` | `apps/agent/src/main/ipc.cjs` |
| `STATUS` | `lo-core:status` | `apps/agent/src/main/ipc.cjs` |
| `LIST_NOTES` | `lo-core:list-notes` | `apps/agent/src/main/ipc.cjs` |
| `GET_NOTE` | `lo-core:get-note` | `apps/agent/src/main/ipc.cjs` |
| `CREATE_NOTE` | `lo-core:create-note` | `apps/agent/src/main/ipc.cjs` |
| `UPDATE_NOTE` | `lo-core:update-note` | `apps/agent/src/main/ipc.cjs` |
| `REMOVE_NOTE` | `lo-core:remove-note` | `apps/agent/src/main/ipc.cjs` |
| `UPLOAD_NOTES` | `lo-core:upload-notes` | `apps/agent/src/main/ipc.cjs` |
| `IMPORT_RESOURCE` | `lo-core:import-resource` | `apps/agent/src/main/ipc.cjs` |
| `RESOURCE_BINARY` | `lo-core:resource-binary` | `apps/agent/src/main/ipc.cjs` |
| `LOGOUT` | `lo-core:logout` | `apps/agent/src/main/ipc.cjs` |
| `RELATIONS` | `lo-core:relations` | `apps/agent/src/main/ipc.cjs` |
| `OPERATIONS` | `lo-core:operations` | `apps/agent/src/main/ipc.cjs` |
| `OPERATION_UNDO` | `lo-core:operation-undo` | `apps/agent/src/main/ipc.cjs` |
| `VIEWS_LIST` | `lo-core:views-list` | `apps/agent/src/main/ipc.cjs` |
| `VIEWS_GET` | `lo-core:views-get` | `apps/agent/src/main/ipc.cjs` |
| `VIEWS_RUN` | `lo-core:views-run` | `apps/agent/src/main/ipc.cjs` |
| `EVENTS_SUBSCRIBE` | `lo-core:events-subscribe` | `apps/agent/src/main/ipc.cjs` |
| `EVENTS_UNSUBSCRIBE` | `lo-core:events-unsubscribe` | `apps/agent/src/main/ipc.cjs` |
| `EVENTS_PUSH` | `lo-core:event` | `apps/agent/src/main/ipc.cjs` |
| `REPOSITORY_INFO` | `lo-core:repository-info` | `apps/agent/src/main/ipc.cjs` |
| `RESOURCE_LOCATION` | `lo-core:resource-location` | `apps/agent/src/main/ipc.cjs` |
| `REVEAL_RESOURCE` | `lo-core:reveal-resource` | `apps/agent/src/main/ipc.cjs` |
| `GRAPH` | `lo-core:graph` | `apps/agent/src/main/ipc.cjs` |
| `MODES_LIST` | `lo-core:modes` | `apps/agent/src/main/ipc.cjs` |
| `MODES_RESOLVE` | `lo-core:modes-resolve` | `apps/agent/src/main/ipc.cjs` |
| `VIEWERS_LIST` | `lo-core:viewers` | `apps/agent/src/main/ipc.cjs` |
| `SEARCH` | `lo-core:search` | `apps/agent/src/main/ipc.cjs` |

## agent-plugins:*（插件能力白名单）

| key | channel | 定义文件 |
|---|---|---|
| `LIST_COMMANDS` | `agent-plugins:list-commands` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `EXECUTE_COMMAND` | `agent-plugins:execute-command` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `LIST_VIEWS` | `agent-plugins:list-views` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `RENDER_VIEW` | `agent-plugins:render-view` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `LIST_PANELS` | `agent-plugins:list-panels` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `RENDER_PANEL` | `agent-plugins:render-panel` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `LIST_EDITORS` | `agent-plugins:list-editors` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `RENDER_EDITOR` | `agent-plugins:render-editor` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `LIST_VIEWERS` | `agent-plugins:list-viewers` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `RENDER_VIEWER` | `agent-plugins:render-viewer` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `LIST_SERVICES` | `agent-plugins:list-services` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `GET_UI_MODULE` | `agent-plugins:get-ui-module` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `CTX` | `agent-plugins:ctx` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `INSTALL` | `agent-plugins:install` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `LIST_PLUGINS` | `agent-plugins:list-plugins` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `ENABLE` | `agent-plugins:enable` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `DISABLE` | `agent-plugins:disable` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `UNINSTALL` | `agent-plugins:uninstall` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `GET_PLUGIN_CONFIG` | `agent-plugins:get-plugin-config` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |
| `SET_PLUGIN_CONFIG` | `agent-plugins:set-plugin-config` | `apps/agent/src/main/plugin/plugin-ipc.cjs` |

## window:*（窗口控制）

| key | channel | 定义文件 |
|---|---|---|

## 说明

- renderer 只经 preload 白名单调用；通道逐一绑定主进程具体方法，不透传任意调用/实例。
- 渲染侧映射见 `meta/architecture/agent.md`。
