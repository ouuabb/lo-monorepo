# lo-agent 桌面端使用指南

> 核对基线：见 `meta/setup/.baseline`。面向最终用户的「如何连上 lo 核心并浏览仓库」。

## 功能概览

lo-agent 桌面端经 `@lo/client` 提供四块能力：

- **仓库地址配置**：`host/port/protocol` 三元组定义 `lo serve` 位置（默认 `127.0.0.1:8765`，http/https）。
- **SSH 挑战-应答登录**：直接提供 **SSH 私钥路径**（`login({ privateKeyPath })`），SDK 内部完成签名。
- **仓库状态（统计）**：`health.stats()`（serve `GET /api/stats`），展示资源/关系数。
- **资源列表**：`notes.list()`（`GET /api/notes`，支持 type/schema/limit/offset），渲染 rid/标题/类型。

## 快速开始

1. **准备 lo 核心**：`lo init` 初始化仓库；`lo new "第一篇笔记"` 添加资源；
   注册本机 SSH 公钥 `lo auth add -k ~/.ssh/id_ed25519 -l "笔记本"`。
2. **启动 serve**：在仓库目录 `lo serve`（默认 `127.0.0.1:8765`）。
3. **应用内**：填入仓库地址 + 私钥路径 → 登录 → 浏览资源。

## 连接配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `protocol` | `http` | `http` / `https` |
| `host` | `127.0.0.1` | serve 监听地址 |
| `port` | `8765` | serve 监听端口 |

- 点击「连接」→ `loCore.configure(config)`（IPC `lo-core:configure`）→ 主进程
  `LoCoreService.configure()` 创建 `LoClient`，归一化 `port/timeout`（默认 15000ms）。
- 配置持久化到应用 `userData/lo-agent.json`（`src/main/config-store.cjs`）；启动时回填。
- 登录成功后 `LoClient` 持有 token + fingerprint，后续请求自动 `Authorization: Bearer`。

> `privateKeyPath` 只用于登录签名，密钥不离开本机；配置文件保存的是**路径**，非私钥内容。

## SSH 挑战-应答认证

```
renderer ─login({ privateKeyPath })→ main ──@lo/client──► serve
1. POST /api/auth/challenge   → { nonce, namespace: 'lo-cli', registeredKeys }
2. ssh-keygen -Y sign -f <privateKeyPath> -n lo-cli <nonce>
3. POST /api/auth/login { nonce, fingerprint, signature } → { token }
```

- 挑战环节由 SDK 自动完成，UI 不暴露 nonce/signature。

## 笔记操作（侧边栏「资源」+ 编辑器）

| 操作 | 入口 | 链路 |
|---|---|---|
| 新建笔记 | 侧边栏「资源」`+` | `loCore.createNote({ content:'', title:'未命名笔记' })` → IPC `lo-core:create-note` → `client.notes.create` → `POST /api/notes` |
| 导入文件 | 侧边栏「资源」导入按钮（多选） | `loCore.uploadNotes(files, {})` → IPC `lo-core:upload-notes` → `client.notes.upload`（multipart 构造在 SDK 内部）→ `POST /api/notes/upload` |
| 编辑与保存 | 编辑器；`Ctrl+S` | 内容/标题/标签/分类变化后 `loCore.updateNote(rid, { content?, title?, tags?, category? })` → IPC `lo-core:update-note` → `client.operations.execute('resource.update', …)` |
| 重命名 | 编辑器标题输入框 | 同上（`title` 字段） |
| 标签/分类 | 编辑器标签与分类输入框（标签逗号分隔） | 同上（`tags` 数组落 `resource_tags` 表、`category` 字符串存 `metadata`） |
| 删除笔记 | 编辑器「删除」→ 确认弹窗 | `loCore.removeNote(rid)` → IPC `lo-core:remove-note` → `client.operations.execute('resource.delete', { rid })`（默认软删） |
| 撤销最近操作 | 编辑器「撤销」 | `loCore.operations.list({ limit:1 })` 取最近操作 → `loCore.operations.undo(opId)` → IPC `lo-core:operation-undo` |

- 新建/删除后侧边栏列表自动刷新；删除可在「功能面板 → 历史」中撤销恢复。
- 导入文件为独立链路：renderer 读取 `ArrayBuffer`（结构化克隆传主进程），不接触 Node Buffer。

## 安全基线

- Electron 最严格配置：`contextIsolation:true`、`nodeIntegration:false`、`sandbox:true`
  （`apps/agent/src/main/index.cjs`）。
- 受控 IPC：只注册白名单通道（`lo-core:*`），不透传任意调用。
- preload 只暴露 `window.loAgent` 受控 API；renderer 不接触 Node API。
- 外部链接交给系统浏览器打开。

> 架构/边界细节见 [`../architecture/agent.md`](../architecture/agent.md)、
> [`../boundary` 相关](../architecture/agent.md)；IPC 通道目录见
> [`../api/ipc-channels.md`](../api/ipc-channels.md)。
