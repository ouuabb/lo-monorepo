## 权限系统（Phase 6.4）

### 一、概述

lo 权限系统基于 RBAC（基于角色的访问控制）和 ABAC（基于属性的访问控制）混合模型，提供精细的访问控制能力。权限检查通过 PermissionEngine + PolicyEngine + ACLManager 三层架构实现。

**核心组件：**

| 组件 | 说明 |
|------|------|
| PermissionManager | 权限管理统一入口 |
| PermissionEngine | 权限检查引擎，综合 RBAC/ABAC/ACL 决策 |
| RoleManager | 角色定义与管理 |
| PolicyEngine | ABAC 策略引擎，基于属性决策 |
| ACLManager | 资源级访问控制列表 |
| AuditLogger | 审计日志记录 |

### 二、RBAC 角色模型

**预定义角色：**

| 角色 | 权限范围 |
|------|----------|
| admin | 完全控制：所有资源的读写删 |
| editor | 编辑权限：创建、修改资源 |
| viewer | 只读权限：查看资源、搜索 |
| contributor | 贡献权限：创建资源、修改自己的 |
| auditor | 审计权限：只读 + 审计日志查看 |

角色可以自定义，通过 `PermissionManager.createRole()` 创建新角色并指定权限码列表。

**角色管理命令：**

```bash
lo permission role create <name>   # 创建自定义角色
lo permission role list             # 列出所有角色
lo permission role assign <role>    # 分配角色给用户
```

**数据表结构：**

- `roles` — 角色定义（id, name, description）
- `role_permissions` — 角色权限绑定（role_id, permission），权限已从 roles 表的 JSON 列迁移到独立表
- `subjects_roles` — 角色分配（subject_id, role_id）
- `resource_acl` — 资源级 ACL（resource_id, subject_id, permission, deny）

### 三、ABAC 策略

ABAC 策略引擎根据资源属性、主体属性和环境上下文做动态决策：

**策略结构：**

```json
{
  "effect": "allow|deny",
  "subject": { "role": "editor" },
  "action": "resource.read|resource.write|...",
  "resource": { "type": "note", "tags": ["draft"] },
  "condition": { "time": "2025-01-01", "ip": "192.168.1.0/24" }
}
```

**策略优先级规则：**

> **显式 deny > 显式 allow > 默认 deny**

即：若任何策略明确拒绝，则拒绝；否则若有策略明确允许，则允许；否则默认拒绝。

### 四、资源级 ACL

每个资源可以有独立的访问控制列表（ACL）：

- 按用户/角色设置读写权限
- 支持继承（子资源继承父容器的 ACL）
- 可通过 `PermissionManager.setResourceACL()` 管理

**ACL 持久化：**`resource_acl` 表（resource_id, subject_id, permission, deny）

**ACL 管理命令：**

```bash
lo permission grant <user> <action> <resource>  # 授予权限
lo permission revoke <user> <action> <resource>  # 撤销权限
lo permission check <user> <action> <resource>   # 检查权限
```

### 五、审计日志

审计系统记录所有权限相关操作：

**记录内容：**
- 谁（subject）在何时（timestamp）
- 做了什么（action）
- 对哪个资源（resource）
- 结果如何（allow/deny）
- 来源 IP 和上下文

**审计命令：**

```bash
lo permission audit              # 查看审计日志
lo permission audit --user <id>  # 按用户过滤
lo permission audit --action <a> # 按操作过滤
```

### 六、权限检查流程

```
请求 → PermissionManager
         ├── 1. RBAC: 检查用户角色是否拥有所需权限
         ├── 2. ABAC: 基于资源/环境属性评估策略
         ├── 3. ACL:  检查资源级访问控制
         └── 4. 审计: 记录所有检查结果
              → allow / deny
```

权限检查遵循第一匹配原则：任何一层返回明确决策（deny 优先于 allow），立即返回结果。

---

**相关文档：**

- [插件系统](plugin.md) — 插件权限隔离
- [知识自动化](knowledge/automation.md) — 自动化管线权限控制
- [AI 知识操作系统](ai-os.md) — AI 操作权限控制
