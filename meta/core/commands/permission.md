## permission — 权限管理

**用法:** `lo permission <role|check|grant|audit> [选项...]`

管理知识库的访问控制和权限。权限系统基于 RBAC+ABAC 混合模型，支持角色管理、资源级 ACL 和审计日志。

### 子命令

- `role list` — 列出所有角色（含权限数）
- `check <subject> <action>` — 检查主体是否有指定权限
- `grant <subject> <action>` — 授予权限
- `audit` — 查看审计日志（拒绝统计 + 近期记录）

### 选项

**check:**
- `--resource <RID>` — 指定资源 RID（资源级权限检查）

### 示例

```
lo permission role list                     # 列出角色
lo permission check current-user resource.read  # 权限检查
lo permission check alice resource.write --resource res_abc
lo permission grant bob resource.read       # 授予权限
lo permission audit                         # 审计日志
```

### 工作机制

- **RBAC+ABAC 混合模型**: 结合角色（RBAC）和属性（ABAC）两种访问控制方式
- **角色管理**: 系统预定义角色（如 admin、editor、viewer），每个角色绑定权限集
- **资源级 ACL**: 可通过 `--resource` 参数检查特定资源的访问权限
- **审计日志**: 所有权限检查结果记录到审计日志，支持按主体和操作统计

### 注意事项

- 权限系统为 Phase 6.4 扩展功能
- 默认情况下仓库不强制权限校验
- 建议通过 `lo auth add` 注册密钥后启用完整权限体系

### 相关命令

- lo docs permission
