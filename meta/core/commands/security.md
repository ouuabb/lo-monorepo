## security — 安全系统

**用法:** `lo security <子命令>`

Phase 6.9 安全系统，提供身份管理、权限检查、策略管理和安全审计的统一入口。

### 文档系统的设计

`lo security` 是 SecurityManager 的 CLI 入口。底层架构：

```
SecurityManager (repo.security)
    │
    ├── Identity (user/agent/plugin/workflow/service/system)
    ├── Authentication (local/token/api-key/plugin/remote)
    ├── Authorization (策略 → 角色 → 直接权限 → ACL)
    ├── AccessControl (统一 can() API)
    ├── ResourceGuard (资源层守卫)
    ├── AuditLogger (安全审计)
    └── SecurityEvent → EventBus
```

权限决策流程：Policy(deny > allow) → Role → Direct Permission → Resource ACL → default_allow

### 子命令

#### identity list — 列出身份

```
lo security identity list
```

列出所有身份（内置 + 数据库中的自定义身份）。

#### identity create — 创建身份

```
lo security identity create <type> <id> [name]
```

创建指定类型的身份。type 可选值：`user`、`agent`、`plugin`、`workflow`、`service`。

示例：
```
lo security identity create agent knowledge-reviewer "知识审核"
lo security identity create service remote-server "远程同步"
```

#### check — 权限检查

```
lo security check <subject> <action> [-r <resource>]
```

检查主体是否能执行指定操作。

示例：
```
lo security check current-user resource.read                          # 检查读取权限
lo security check agent:reviewer resource.delete -r note:123          # 检查删除权限
lo security check plugin:formatter resource.update                    # 检查插件权限
```

#### policy list — 策略列表

```
lo security policy list
```

列出所有安全策略。默认策略：Deny > Allow，无匹配时默认允许。

#### audit — 安全审计

```
lo security audit [--actor <id>] [--limit <n>]
```

查看安全审计日志，支持按操作者过滤。

### 示例

```
# 创建 Agent 身份
lo security identity create agent reviewer "知识审核者"

# 检查权限
lo security check agent:reviewer resource.read -r note:123

# 查看审计日志
lo security audit --limit 50

# 查看 24h 拒绝统计
lo security audit
```

### 数据库表

V22 迁移新增 4 张表：

| 表名 | 用途 |
|------|------|
| `identities` | 多类型身份（user/agent/plugin/workflow/service/system） |
| `policies` | 声明式安全策略（subject × resource × action → allow/deny） |
| `security_audit` | 安全审计日志（actor/action/resource/result） |
| `credentials` | 认证凭据（token/api-key） |

### 事件类型

通过 EventBus 发布的安全事件：

- `security.access.granted` — 访问授权
- `security.access.denied` — 访问拒绝
- `security.policy.changed` — 策略变更
- `security.identity.created` — 身份创建
- `security.token.expired` — 令牌过期
- `security.credential.revoked` — 凭据吊销

### 注意事项

- `lo security check` 在未连接仓库时默认允许所有操作（本地模式）
- 策略系统遵循 Deny > Allow 规则
- 审计日志独立存储，不影响业务性能

### 相关命令

- [permission](permission.md) — 权限管理（Phase 6.4）
- [agent](agent.md) — Agent 系统（Phase 6.5）
- [team](team.md) — 团队协作（Phase 6.6）
- [evolution](evolution.md) — 自演化系统（Phase 6.8）
- [docs/security](../../advanced/security.md) — 安全设计摘要
