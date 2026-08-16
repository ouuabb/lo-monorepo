## HTTP API 参考

`lo serve` 在当前仓库启动一个本地 HTTP 服务器，对外提供 REST API。这是连接 lo 内部能力与外部世界的桥梁。

### 启动服务

```bash
lo serve                    # 默认 8765 端口
lo serve --port 9000        # 自定义端口
lo serve -p 8888 -r ~/notes # 完整参数
lo serve --admin-token mytoken   # 同时启用 Admin API 共享密钥认证
lo admin                    # 启动服务 + 托管 Admin SPA（http://127.0.0.1:8765/admin/）
```

> 只监听 127.0.0.1，不暴露到公网。如需远程访问，使用 frp/WireGuard/Tailscale 做端口转发。

### 认证机制

lo serve 使用 SSH 挑战-应答认证（复用 `lo auth` 注册的 SSH 公钥）：

1. `POST /api/auth/challenge` — 获取随机 nonce
2. `ssh-keygen -Y sign` — 用本地 SSH 私钥签名 nonce
3. `POST /api/auth/login` — 提交签名，获取 session token
4. 后续请求携带 `Authorization: Bearer <session-token>`

session 有效期 60 分钟。未注册 SSH 公钥的仓库不强制认证。

**Admin API 认证**：`/api/admin/*` 不走 SSH，改用共享密钥。通过环境变量 `LO_ADMIN_TOKEN` 或 `lo serve --admin-token` / `lo admin --admin-token` 设置后，Admin 请求需携带 `Authorization: Bearer <token>`；未设置密钥时 Admin 端点无认证保护（仅监听 127.0.0.1）。

### API 端点列表

所有请求以 JSON 格式交互，`Content-Type: application/json`。

#### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/challenge` | 请求 SSH 认证挑战 nonce |
| POST | `/api/auth/login` | 提交签名，获取 session token |
| POST | `/api/auth/reload` | 热刷新已注册 SSH 公钥列表（新增 `lo auth add` 后无需重启服务） |

**认证示例：**

```bash
# 步骤一：获取挑战
curl -X POST http://127.0.0.1:8765/api/auth/challenge
# → {"nonce":"abc123...","namespace":"lo-cli","registeredKeys":[...]}

# 步骤二：用 SSH 私钥签名
echo -n "<nonce>" > /tmp/challenge.txt
ssh-keygen -Y sign -f ~/.ssh/id_ed25519 -n lo-cli /tmp/challenge.txt

# 步骤三：提交签名获取 token
curl -X POST http://127.0.0.1:8765/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"nonce":"<nonce>","fingerprint":"SHA256:xxx","signature":"<base64-of-sig>"}'
# → {"token":"<session-token>","label":"我的电脑"}
```

#### 健康与统计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 + 仓库统计 |

```bash
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8765/api/health
```

#### 资源 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notes` | 资源列表，支持 `?type=note&limit=20&offset=0`，`?schema=<id>` 按 Schema 过滤 |
| GET | `/api/notes/:rid` | 资源详情（含解密后的内容）|
| POST | `/api/notes` | 创建资源（文本内容）|
| POST | `/api/notes/upload` | 上传文件（multipart）|
| PUT | `/api/notes/:rid` | 更新资源 |
| DELETE | `/api/notes/:rid` | 删除（`?hard=true` 硬删除）|

**创建笔记：**

```bash
curl -X POST \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"title":"新笔记","content":"内容...","tags":["test"],"category":"编程/Python/爬虫"}' \
     http://127.0.0.1:8765/api/notes
```

**上传文件：**

```bash
curl -X POST \
     -H "Authorization: Bearer <token>" \
     -F "file=@/path/to/photo.jpg" \
     -F "title=我的照片" \
     -F "tags=photo,trip" \
      http://127.0.0.1:8765/api/notes/upload
```

**资源类型认定（Core 模型层统一负责）：**

- 上传与创建时，`type` 由 Core 模型层按 filename 扩展名统一认定
  （`TypeRegistry` / `ResourceType` 为唯一事实源），serve 不做任何类型判断。
- 常见映射：`.md → note`（可编辑）、`.png/.jpg → image`、`.mp4 → video`、
  `.mp3 → audio`、`.txt → text`、`.py/.js/.ts → code`、`.pdf → pdf`、
  `.xls/.xlsx → spreadsheet`、`.ppt/.pptx → presentation`；未知扩展名 → `unknown`。
- 显式传入 `type`（如 `POST /api/notes` 的 `body.type`、CLI `--type`、插件调用）优先于扩展名认定。
- 无 `type` 且无 `filename` 时默认 `note`。

**获取笔记内容：**

```bash
curl -H "Authorization: Bearer <token>" \
     "http://127.0.0.1:8765/api/notes/res_xxxx"
```

**更新笔记：**

```bash
curl -X PUT \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"content":"新内容","title":"新标题","tags":["更新"],"category":"编程"}' \
     http://127.0.0.1:8765/api/notes/res_xxxx
```

#### 搜索

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/search` | 搜索 `?q=关键词` |

```bash
curl -H "Authorization: Bearer <token>" \
     "http://127.0.0.1:8765/api/search?q=关键词"
```

#### Schema 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/schemas` | Schema 列表，支持 `?status=active` |
| POST | `/api/schemas` | 创建 Schema |
| GET | `/api/schemas/:id` | Schema 详情（id 或 name）|
| PUT | `/api/schemas/:id` | 更新 Schema（结构变更自动升版）|
| DELETE | `/api/schemas/:id` | 删除 Schema（引用级联清除）|
| POST | `/api/schemas/:id/attach` | 绑定资源 `{"rid":"..."}` |
| POST | `/api/schemas/:id/detach` | 解除资源绑定 `{"rid":"..."}` |

**创建 Schema：**

```bash
curl -X POST \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"id":"followup","name":"FollowUp","fields":[{"name":"status","type":"enum","values":["waiting","done"]}],"behaviors":{"stateField":"status"}}' \
     http://127.0.0.1:8765/api/schemas
```

> relation 字段的 `target` 在创建 / 更新时强校验：目标 Schema 必须已存在，否则返回错误。
> `behaviors` 为语义声明（如 `stateField`、`titleField`、`sortableFields`），引用字段必须存在于 `fields` 中。

**查看 / 更新 / 删除：**

```bash
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8765/api/schemas/followup
curl -X PUT -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"fields":[{"name":"stage","type":"text"}]}' \
     http://127.0.0.1:8765/api/schemas/followup
curl -X DELETE -H "Authorization: Bearer <token>" http://127.0.0.1:8765/api/schemas/followup
```

**绑定 / 解除绑定资源：**

```bash
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"rid":"res_xxxx"}' http://127.0.0.1:8765/api/schemas/followup/attach
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"rid":"res_xxxx"}' http://127.0.0.1:8765/api/schemas/followup/detach
```

**按 Schema 过滤资源列表：**

```bash
curl -H "Authorization: Bearer <token>" \
     "http://127.0.0.1:8765/api/notes?schema=followup"
```

#### View 系统（资源观察层）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/views` | View 列表，支持 `?status=active` |
| POST | `/api/views` | 创建 View |
| GET | `/api/views/:id` | View 详情（id 或 name）|
| PUT | `/api/views/:id` | 更新 View |
| DELETE | `/api/views/:id` | 删除 View |
| POST | `/api/views/:id/run` | 执行 View（`{"limit":20,"offset":0}`），返回结构化结果 |
| GET | `/api/views/:id/export` | 导出 View 定义 |
| POST | `/api/views/import` | 导入 View 定义 |

**创建 View：**

```bash
curl -X POST \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"id":"reading","name":"阅读中","mode":"table","query":{"conditions":[{"field":"type","operator":"=","value":"book"}]},"fields":[{"name":"name","label":"名称"}]}' \
     http://127.0.0.1:8765/api/views
```
<!-- `mode` 为兼容别名，内部归一化为 `presentation: { type, config }` 存储；返回 / 导出统一为该结构。 -->

**执行 View：**

```bash
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"limit":20}' http://127.0.0.1:8765/api/views/reading/run
```

返回 `{ presentation, columns, rows, groups, total }`，其中 `total` 为满足 query 的资源总数（不受 limit 影响）。

> View 为只读观察层：不创建 / 不拥有 / 不修改资源。schema 条件引用不存在的 Schema 会报错（强校验）。

#### 标签与统计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tags` | 所有标签列表 |
| GET | `/api/stats` | 仓库统计数据 |

#### 同步

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sync` | 本地同步 `?full=true` 全量 |
| POST | `/api/sync/push` | 推送到远程 `{"remote":"..."}` |
| POST | `/api/sync/pull` | 从远程拉取 `{"remote":"..."}` |

```bash
# 本地同步
curl -X POST -H "Authorization: Bearer <token>" \
     http://127.0.0.1:8765/api/sync

# 推送到远程
curl -X POST -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"remote":"myserver"}' \
     http://127.0.0.1:8765/api/sync/push

# 从远程拉取
curl -X POST -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"remote":"myserver"}' \
     http://127.0.0.1:8765/api/sync/pull
```

#### Admin API（管理后台）

`/api/admin/*` 供 Admin SPA 与自动化脚本使用，认证走 `LO_ADMIN_TOKEN` 共享密钥（设置后需 `Authorization: Bearer <token>`），与 SSH session 互不影响。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/stats` | 仪表盘统计（资源/关系/标签/建议数） |
| GET | `/api/admin/resources` | 资源列表（搜索/过滤/分页） |
| GET | `/api/admin/resources/:rid` | 资源详情 |
| POST | `/api/admin/resources` | 创建笔记（仅 note 类型） |
| PUT | `/api/admin/resources/:rid` | 更新资源（标题/内容/元数据/改类型） |
| DELETE | `/api/admin/resources/:rid` | 删除资源 |
| POST | `/api/admin/import` | 批量导入文件（绝对路径列表） |
| POST | `/api/admin/resources/:rid/link` | 建立资源链接 |
| DELETE | `/api/admin/resources/:rid/link/:target` | 断开资源链接 |
| PUT | `/api/admin/resources/:rid/tags` | 更新资源标签 |
| DELETE | `/api/admin/resources/:rid/tags/:tag` | 删除资源标签 |
| POST | `/api/admin/commit` | 提交暂存区 |
| GET | `/api/admin/status` | 工作区状态（暂存/未跟踪/合并标记） |
| GET | `/api/admin/graph` | 关系图数据（力导向图） |
| GET | `/api/admin/graph/path` | 路径查询 |
| GET | `/api/admin/suggestions` | AI 建议列表 |
| POST | `/api/admin/suggestions/:id/accept` | 接受建议 |
| POST | `/api/admin/suggestions/:id/reject` | 拒绝建议 |
| POST | `/api/admin/suggestions/:id/execute` | 执行已接受建议 |
| GET | `/api/admin/containers` | 容器列表 |
| GET | `/api/admin/containers/:id` | 容器详情 + 成员 |
| POST | `/api/admin/containers/:id/scan` | 扫描容器新成员 |
| POST | `/api/admin/containers/:id/sync` | 同步容器成员（`{"dryRun":true}` 只出差异不落库） |
| GET | `/api/admin/containers/:id/diff` | 容器成员差异（待同步变更） |
| GET | `/api/admin/containers/:id/stats` | 容器成员统计 |
| POST | `/api/admin/containers/:id/members/promote` | 提升成员为 Resource（`{"memberPath":"...","type":"note","metadata":{}}`） |
| POST | `/api/admin/containers/:id/members/demote` | 降级成员 |
| GET | `/api/admin/relations` | 关系列表 |
| DELETE | `/api/admin/relations/:id` | 删除关系 |
| GET | `/api/admin/audit` | 操作审计日志 |
| GET | `/api/admin/types` | 资源类型列表 |
| PUT | `/api/admin/types/:name` | 重命名资源类型 |
| GET | `/api/admin/tags` | 标签列表 |
| PUT | `/api/admin/tags/:name` | 重命名标签 |
| DELETE | `/api/admin/tags/:name` | 删除标签 |
| GET | `/api/admin/categories` | 分类列表 |
| PUT | `/api/admin/categories/:name` | 重命名分类 |
| DELETE | `/api/admin/categories/:name` | 删除分类 |

#### Workflow（状态机）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workflows` | 工作流列表 |
| POST | `/api/workflows` | 创建工作流（`{"id","states"}`，缺 states 时 400） |
| GET | `/api/workflows/:id` | 工作流详情 |
| PUT | `/api/workflows/:id` | 更新定义（结构变更时传 `version` 显式升版） |
| DELETE | `/api/workflows/:id` | 软删除（status → deprecated；`?purge=true` 彻底清理） |
| GET | `/api/workflows/:id/versions` | 定义版本快照列表；`?version=N` 获取指定版本 |
| POST | `/api/workflows/:id/attach` | 绑定资源 `{"resourceRid":"...","state?"}`，返回实例 |
| POST | `/api/workflows/:id/detach` | 解除绑定 `{"instanceId":"..."}` |
| POST | `/api/workflows/:id/resume` | 恢复 detached 实例 `{"instanceId":"..."}` |
| POST | `/api/workflows/:id/transition` | 状态转换 `{"resourceRid","targetState","actor?"}` |
| POST | `/api/workflows/:id/can` | 转换预检 `{"resourceRid","targetState"}` |
| GET | `/api/workflow/instances` | 实例列表 `?wf=...&rid=...` |
| GET | `/api/workflow/instances/:id` | 实例详情 |
| GET | `/api/workflows/history` | 转换历史 `?id=<instanceId|workflowId|resourceRid>` |

#### Automation（行为编排）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/automations` | 自动化列表 |
| POST | `/api/automations` | 创建自动化（缺 `id` 时 400） |
| GET | `/api/automations/:id` | 自动化详情 |
| PUT | `/api/automations/:id` | 更新自动化 |
| DELETE | `/api/automations/:id` | 删除自动化 |
| POST | `/api/automations/:id/enable` | 启用 |
| POST | `/api/automations/:id/disable` | 禁用 |
| POST | `/api/automations/:id/run` | 立即执行 `{"triggerSource?","input?"}` |
| GET | `/api/automations/history` | 执行历史 `?automationId=...&status=...&limit=50` |

#### Evolution（知识自演化）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/evolution/status` | 演化状态 |
| GET | `/api/evolution/observe` | 系统快照 |
| GET | `/api/evolution/health` | 知识健康分析 |
| GET | `/api/evolution/detect` | 检测演化机会 |
| GET | `/api/evolution/plan` | 生成演化计划 |
| POST | `/api/evolution/execute` | 执行演化 |
| GET | `/api/evolution/history` | 演化历史 `?limit=50` |
| POST | `/api/evolution/rollback` | 回滚最近一次演化 |

**使用示例：**

```bash
# 带 Admin token 获取统计
curl -H "Authorization: Bearer mytoken" \
     http://127.0.0.1:8765/api/admin/stats

# 创建笔记
curl -X POST -H "Authorization: Bearer mytoken" -H "Content-Type: application/json" \
     -d '{"title":"新笔记","content":"内容..."}' \
     http://127.0.0.1:8765/api/admin/resources
```

---

### 并发与写锁

SQLite 不支持高并发写入。lo serve 通过写锁排队处理：

- 读操作（GET）无锁，并行执行
- 写操作（POST/PUT/DELETE）自动排队依次执行

### 集成架构

```
lo serve (:8765)  ← lo 核心
    │  HTTP
    ▼
外部适配器（独立项目）:
├── Telegram Bot      ← 将消息翻译为 HTTP 请求
├── iOS 快捷指令       ← 通过捷径调用 API
├── Web Dashboard     ← 浏览器管理面板
└── 自定义脚本        ← Python/Bash 自动化
```

### 注意事项

- 不要改为 `0.0.0.0` 监听——那样会暴露到局域网/公网
- 服务停止后所有 HTTP 端点不可用
- session token 有效期 60 分钟
- 未注册 SSH 公钥的仓库不强制认证（建议执行 `lo auth add`）

### 相关命令

- `lo serve` — 启动服务
- `lo admin` — 启动服务 + 管理后台 SPA
- `lo auth add` — 注册 SSH 公钥（新增后调用 `POST /api/auth/reload` 热刷新）
- `lo manual serve` — 查看完整手册

### 相关文档

- [SSH 身份认证](../core/auth.md) — 认证机制详解
- [远程同步](../core/sync.md) — 同步 API 使用
- [架构分析](../advanced/architecture.md) — 模块 HTTP 路由注册
