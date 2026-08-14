## serve — 启动本地 HTTP API 服务

**用法:** `lo serve [--port <端口>] [--repo <路径>] [--admin-token <密钥>]`

在当前仓库启动一个本地 HTTP 服务，提供 REST API 接口。

### 安全设计

- 默认只监听 `127.0.0.1`（本机回环地址），不对外暴露
- 使用 SSH 挑战-应答认证（复用 `lo auth` 注册的密钥）
- 加密仓库需先通过 SSH 认证
- 仓库在服务运行期间保持打开状态
- Admin API（`/api/admin/*`）使用共享密钥认证（`LO_ADMIN_TOKEN`），设置密钥后未带 Bearer token 的请求返回 401

### 选项

| 选项 | 说明 |
|------|------|
| `--port`、`-p` | 监听端口（默认: 8765） |
| `--repo`、`-r` | 仓库路径（默认: 当前目录） |
| `--admin-token` | Admin API 共享密钥（也可通过环境变量 `LO_ADMIN_TOKEN` 设置；不设置则 `/api/admin/*` 无认证保护） |

### 认证流程（SSH 挑战-应答）

```
1. POST /api/auth/challenge       获取挑战 nonce
2. ssh-keygen -Y sign             用本地 SSH 私钥签名
3. POST /api/auth/login           提交签名，获取 session token
4. 后续请求带 Authorization: Bearer <session-token>
```

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/challenge` | 请求认证挑战 |
| POST | `/api/auth/login` | 提交 SSH 签名获取 token |
| POST | `/api/auth/reload` | 热刷新已注册 SSH 公钥列表 |
| GET | `/api/health` | 健康检查 + 仓库统计 |
| GET | `/api/notes` | 获取资源列表（`?type=&limit=&offset=&schema=`） |
| GET | `/api/notes/:rid` | 获取资源详情（含内容） |
| POST | `/api/notes` | 创建文本资源（`{ type, content, title, tags, metadata }`） |
| POST | `/api/notes/upload` | 上传文件（multipart: `file, title, tags`） |
| PUT | `/api/notes/:rid` | 更新资源（`{ content, title, tags, metadata }`） |
| DELETE | `/api/notes/:rid` | 删除资源（`?hard=true` 永久删除） |
| GET | `/api/search` | 搜索资源（`?q=关键词`） |
| GET | `/api/stats` | 仓库统计 |
| GET | `/api/tags` | 所有标签列表 |
| POST | `/api/sync` | 触发本地同步（`?full=true` 全量） |
| POST | `/api/sync/push` | 推送到远程（`{ remote }`） |
| POST | `/api/sync/pull` | 从远程拉取（`{ remote }`） |

Schema / View / Admin 端点详见 [HTTP API 参考](../reference/api.md)。

### 示例

```
lo serve                                 # 默认端口 8765
lo serve --port 9000                      # 自定义端口
lo serve -p 8888 -r ~/notes               # 完整参数
```

### curl 测试（SSH 认证）

```bash
# 获取挑战
curl -X POST http://127.0.0.1:8765/api/auth/challenge

# 签名（需 OpenSSH >= 8.1）
echo -n "<nonce>" > /tmp/challenge.txt
ssh-keygen -Y sign -f ~/.ssh/id_ed25519 -n lo-cli /tmp/challenge.txt

# 登录获取 token
curl -X POST -H "Content-Type: application/json" \
     -d '{"nonce":"<nonce>","fingerprint":"SHA256:xxx","signature":"<base64>"}' \
     http://127.0.0.1:8765/api/auth/login

# 使用 token 调用业务接口
curl -H "Authorization: Bearer <token>" \
     http://127.0.0.1:8765/api/health

# 创建笔记
curl -X POST -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"title":"新笔记","content":"内容..."}' \
     http://127.0.0.1:8765/api/notes

# 上传文件
curl -X POST \
     -H "Authorization: Bearer <token>" \
     -F "file=@photo.jpg" \
     -F "title=我的照片" \
     -F "tags=photo,trip" \
     http://127.0.0.1:8765/api/notes/upload
```

### 插件端点（P2-0）

`lo serve` 启动时会自动初始化插件系统，并把插件通过 `commands` 扩展点注册的 HTTP 端点挂载为动态路由：

- 插件端点的 path 形如 `/api/plugins/<plugin-id>/...`（由插件自行定义）
- 插件端点**豁免 SSH 认证**：面向外部系统（如 Chrome 扩展）的推送入口，访问策略由插件自身控制
- 启动日志会打印已挂载的插件端点清单
- 详见 [插件系统文档](../systems/plugin.md)「commands HTTP 端点形式」小节

### 注意事项

- 端口仅建议用 `127.0.0.1`，不要改为 `0.0.0.0` 暴露公网
- 仓库注册 SSH 公钥后自动启用认证（`lo auth add`）
- 未注册公钥时不强制认证（任何本机程序均可调用）
- session token 有效期 60 分钟，过期后需重新登录
- SQLite 不支持高并发写入，本服务通过写锁排队保证数据安全
- 加密仓库在服务启动时完成一次性认证，运行期间不重复认证

### 相关命令

- [remote](remote.md) — 管理远程仓库
- [push](push.md) — 推送变更
- [pull](pull.md) — 拉取变更
