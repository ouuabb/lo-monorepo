# 权限与安全系统

Phase 6.9: Permission & Security System

## Identity（身份）

多类型身份模型，支持六种身份：

| 类型 | ID 格式 | 说明 |
|------|---------|------|
| `user` | `alice` | 本地用户（默认） |
| `agent` | `agent:reviewer` | 知识智能体 |
| `plugin` | `plugin:formatter` | 插件实例 |
| `workflow` | `workflow:auto-review` | 工作流 |
| `service` | `service:remote-01` | 远程服务 |
| `system` | `system` | 系统内部身份 |

```javascript
const identity = repo.security.createIdentity('agent', 'reviewer', '审核员');
```

## Authentication（认证）

多提供者认证，支持五种方式：

| 提供者 | 凭据 | 说明 |
|--------|------|------|
| `local` | 无 | 默认当前用户 |
| `token` | 令牌 + 过期时间 | 临时令牌认证 |
| `api-key` | API Key | 长期不过期 |
| `plugin` | 插件 ID | 插件身份认证 |
| `remote` | 远程仓库 ID | 远程仓库认证 |

## Authorization（授权）

权限决策流程（deny > allow）：

```
Policy（声明式策略）→ Role → Direct Permission → Resource ACL → default_allow
```

1. **声明式 Policy** — subject × resource × action → allow/deny，支持条件和优先级
2. **Role** — 预定义角色（owner/admin/editor/viewer/ai-agent）
3. **Direct Permission** — 直接授予主体的权限
4. **Resource ACL** — 资源级别的访问控制
5. **default_allow** — 无匹配时默认允许（本地优先策略）

## AccessControl（统一入口）

```javascript
// 权限检查
await repo.security.check(subject, 'resource.read', 'note:123');
// → true / false

// 授权决策
await repo.security.authorize(context, 'resource.delete', 'note:456');
// → { allowed: false, reason: '...' }
```

## ResourceGuard（资源守卫）

保护资源操作：create / read / update / delete / link / export

## Audit（审计）

安全审计日志，支持按 actor/action/result/since 查询，异常检测。

## 事件类型

通过 EventBus 发布的安全事件：

- `security.access.granted` / `security.access.denied`
- `security.policy.changed` / `security.identity.created`
- `security.token.expired` / `security.credential.revoked`

## CLI

```
lo security identity list                         # 身份列表
lo security identity create <type> <id> [name]    # 创建身份
lo security check <subject> <action>              # 权限检查
lo security policy list                           # 策略列表
lo security audit [--actor] [--limit]            # 审计日志
```

## 数据库

V22 迁移：`identities` / `policies` / `security_audit` / `credentials`
