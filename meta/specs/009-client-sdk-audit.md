# 009 · Client SDK Audit

> 状态：v0.1 · 实现审计
> 范围：`@lo/client`（lo-client-sdk）当前实现
> 方法：以代码为准，核对 SDK 方法与 serve.cjs 实际路由，找协议断层
> 基准：003（SDK 协议，已确定）· 006（生态边界，已确认）

---

## 1. 定位（来自 006，已确认）

`lo-client-sdk`（`@lo/client`）是 **Core Client SDK**，面向所有 Core 外部消费者，
当前消费者是 lo-agent，未来可有 CLI / 其他客户端 / 自动化程序。
职责 = 通信能力层，不拥有业务模型（见 003）。

## 2. 实现盘点（代码实测）

```
src/
  index.cjs   # 出口：LoClient / AuthClient / LoApiError / LoHttpError / signWithSshKeygen / SDK_VERSION
  client.cjs  # LoClient：请求管线 + 10 命名空间
  http.cjs    # 底层请求 + 错误类型
  auth.cjs    # SSH 挑战-应答认证
```

- 纯 CJS、零运行时依赖。
- transport 可注入（测试/代理）。
- token 注入：admin token 优先，SSH token 其次，skipAuth 豁免 `/api/auth/*`。

## 3. namespace 覆盖核对（SDK 方法 ↔ serve.cjs 路由）

### 3.1 全量核对结果（100 个 serve 路由逐一比对）

**SDK 所有已实现方法对应的 HTTP 端点，100% 存在于 serve.cjs。**
含参数化端点（`GET /api/notes/:rid`、`POST /api/automations/:id/enable` 等，
serve 用多行 `route(...)` + matchRoute 正则匹配）。

| namespace | 方法 | 端点核对 |
|---|---|---|
| `health` | ping/stats/tags | ✅ |
| `notes` | list/get/create/update/remove | ✅ |
| `search` | search | ✅ |
| `schemas` | list/get/create/update/remove/attach/detach | ✅ |
| `views` | list/get/create/update/remove/run/export/importDef | ✅ |
| `workflows` | list/get/create/update/remove/versions/attach/detach/resume/transition/can/instances/instance/history | ✅ |
| `automations` | list/get/create/update/remove/enable/disable/run/history | ✅ |
| `evolution` | status/observe/health/detect/plan/execute/history/rollback | ✅ |
| `sync` | sync/push/pull | ✅ |
| `admin` | stats/resources/link/tags/graph/containers/relations/audit/import/commit/suggestions/types/categories/tags | ✅ |

### 3.2 SDK 未封装但 serve 存在的端点（次要断层）

| 端点 | 说明 |
|---|---|
| `POST /api/auth/reload` | 热重载注册密钥，SDK 未暴露 |
| `POST /api/notes/upload` | 资源上传，SDK 未暴露 |

> 这两个是**反向断层**（serve 有、SDK 无），非阻断。

## 4. 协议断层分析

### 4.1 正向断层（SDK 有、Core 无）

**无**。SDK 所有方法对应的端点都存在于 serve。

### 4.2 反向断层（Core 有、SDK 无）

| 项 | 严重度 | 说明 |
|---|---|---|
| `POST /api/auth/reload` | 低 | 管理员操作，非消费者路径 |
| `POST /api/notes/upload` | 中 | 文件上传能力未封装，lo-agent 导入文件时缺失 |

### 4.3 能力面缺口（003 已定义目标，当前未实现）

以下**不是"SDK 缺失"而是"Core 尚未暴露"**（见 007 §6）：

| 能力 | SDK 状态 | Core HTTP 状态 |
|---|---|---|
| `operations.*`（Operation 语义） | 无 | 无 `/api/operations` |
| `events.*`（事件订阅） | 无 | 无 SSE |
| `relations.create/remove`（关系写） | 无 | admin 仅 list/delete |

**判定**：这些是**协议层未就绪**，SDK 无对应方法属正确（不设计不存在的能力）。

## 5. 与 Core 当前 API 的一致性

| 维度 | 结论 |
|---|---|
| 方法 ↔ 端点映射 | ✅ 100% 一致 |
| 参数化路由 | ✅ 全部匹配 |
| 错误模型 | ✅ LoApiError/LoHttpError 已实现，与 003 §9 一致 |
| 认证 | ✅ SSH 挑战-应答完整 |
| 版本 | ✅ SDK_VERSION 导出 |
| 类型声明 | ✅ types/index.d.ts 覆盖主要 API |

## 6. 结论

1. **lo-client-sdk 与 lo Core 当前 HTTP API 完全一致**，无正向断层。
2. **协议断层仅 2 处反向缺口**（auth/reload、notes/upload），非阻断。
3. **能力面缺口（operations/events/relation 写）不是 SDK 缺陷**，而是 Core HTTP 面
   未就绪（007 §6 一致）。
4. **SDK 是稳定的协议客户端**，符合 003 定位与 006 边界。

## 7. 工程缺口（记录，不设计）

- 若 lo-agent 需要文件导入，`notes.upload` 需补封装（属需求驱动）。
- operations/events/relation 写能力：等待 Core HTTP 面落地（002 §4），届时 SDK 增加
  对应 namespace（003 §4 已定义目标形态）。
