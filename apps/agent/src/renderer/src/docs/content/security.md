# 安全基线

本应用遵循 Electron 最严格的安全配置。

## 渲染进程隔离（src/main/index.cjs）

```js
webPreferences: {
  preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
  contextIsolation: true,   // 渲染进程与 preload 隔离
  nodeIntegration: false,   // 渲染进程禁用 Node
  sandbox: true,            // 开启沙箱
}
```

## 受控 IPC（src/main/ipc.cjs）

- 只注册白名单通道：`lo-core:config / configure / login / status / list-notes / logout`。
- 不透传任意调用；每个 handler 只调用 `LoCoreService` 的对应方法。

## preload 只暴露受控 API

- `contextBridge.exposeInMainWorld('loAgent', ...)` 只暴露：
  `version` + `loCore.getConfig/configure/login/getStatus/listNotes/logout`。
- 每个方法都是 `ipcRenderer.invoke('lo-core:*')`，不接触 Node API。

## 外部链接

- 由 `setWindowOpenHandler` 捕获，交给 `shell.openExternal`（系统浏览器），
  并 `return { action: 'deny' }` 阻止窗口内导航。

## 密钥与凭据

- SSH 私钥**绝不离开本机**：`privateKeyPath` 仅用于签名，配置只存路径。
- session token 仅存于 `LoClient` 内存（主进程），登出即清。
- 连接/认证走 lo 核心既有加密与认证体系。

## 常见安全提示

| 场景 | 建议 |
| --- | --- |
| 非本机 serve | 不要随意连不可信的 host |
| 密钥路径 | 使用受保护的家目录私钥，不共享 |
| 升级 | 及时升级 electron 修复 CVE |