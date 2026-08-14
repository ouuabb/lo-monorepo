/**
 * PolicyEngine — 策略引擎（增强版）
 *
 * Phase 6.4: 核心权限决策模块。
 * Phase 6.9: 集成 Policy 声明式策略评估，deny > allow 规则。
 *
 * 流程:
 *   Can(subject, action, resource)?
 *     1. 检查声明式 Policy（deny 优先于 allow）
 *     2. 检查 Role 权限
 *     3. 检查 Subject 直接权限
 *     4. 检查 Resource ACL（如果指定了 resource）
 *     5. 返回 { allowed, reason }
 */

const Permission = require("./permission.cjs");
const Policy = require("./policy.cjs");

class PolicyEngine {
  /**
   * @param {object} services
   * @param {import('./permissionManager.cjs')} services.permissionManager
   * @param {import('./permissionAudit.cjs')} [services.audit]
   * @param {object} [services.db]            — 用于加载声明式策略
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.permissionManager = services.permissionManager || null;
    this.audit = services.audit || null;
    this.db = services.db || null;
    this.logger = services.logger || console;
    this._policies = null; // 懒加载
  }

  /**
   * 加载声明式策略（从 DB）
   */
  async loadPolicies() {
    if (this._policies !== null) return this._policies;
    if (!this.db) {
      this._policies = [];
      return [];
    }

    try {
      const rows = await this.db.all(
        "SELECT * FROM policies ORDER BY priority DESC",
      );
      this._policies = [];
      for (const r of rows) {
        const actionRows = await this.db.all(
          "SELECT action FROM policy_actions WHERE policy_id = ?",
          [r.id],
        );
        this._policies.push(
          new Policy({
            id: r.id,
            subject: r.subject,
            resource: r.resource,
            actions: actionRows.map((a) => a.action),
            effect: r.effect,
            priority: r.priority || 0,
            condition: r.condition_JSON ? JSON.parse(r.condition_JSON) : null,
            metadata: r.metadata ? JSON.parse(r.metadata) : {},
          }),
        );
      }
    } catch {
      this._policies = [];
    }
    return this._policies;
  }

  /**
   * 清除策略缓存
   */
  invalidatePolicyCache() {
    this._policies = null;
  }

  /**
   * 检查权限
   * @param {string|object} subject
   * @param {string} action — 权限代码，如 'resource.read'
   * @param {string} [resource] — 资源 RID（可选，用于 ACL）
   * @returns {Promise<{ allowed: boolean, reason: string }>}
   */
  async check(subject, action, resource) {
    const subjectId = typeof subject === "string" ? subject : subject.id;
    const perm = new Permission(action);

    if (this.permissionManager) {
      // 1. 检查声明式 Policy（Phase 6.9）
      const policies = await this.loadPolicies();
      let explicitDecision = null; // null 表示无匹配

      for (const policy of policies) {
        const context = {
          subject: typeof subject === "object" ? subject : { id: subjectId },
          resource: resource ? { id: resource } : undefined,
        };

        if (policy.matches(subjectId, action, resource || "")) {
          if (policy.evaluateCondition(context)) {
            if (policy.effect === "deny") {
              await this._audit(
                subjectId,
                action,
                resource,
                false,
                `policy:${policy.id}`,
              );
              return { allowed: false, reason: `policy:${policy.id}` };
            }
            // allow 匹配 — 记录但不立即返回，因为后面可能有 deny
            if (!explicitDecision) {
              explicitDecision = {
                allowed: true,
                reason: `policy:${policy.id}`,
              };
            }
          }
        }
      }

      if (explicitDecision) {
        await this._audit(
          subjectId,
          action,
          resource,
          explicitDecision.allowed,
          explicitDecision.reason,
        );
        return explicitDecision;
      }

      // 2. 检查 Role 权限
      const roles = this.permissionManager.getSubjectRoles(subjectId);
      for (const role of roles) {
        if (role.hasPermission(action)) {
          await this._audit(
            subjectId,
            action,
            resource,
            true,
            `role:${role.id}`,
          );
          return { allowed: true, reason: `role:${role.id}` };
        }
      }

      // 3. 检查直接权限
      const directPerms =
        this.permissionManager.getSubjectPermissions(subjectId);
      for (const dp of directPerms) {
        if (perm.matches(dp)) {
          await this._audit(subjectId, action, resource, true, "direct_grant");
          return { allowed: true, reason: "direct_grant" };
        }
      }

      // 4. 检查 Resource ACL
      if (resource) {
        const acl = this.permissionManager.getResourceACL(resource);
        if (acl) {
          const aclResult = acl.check(subjectId, action);
          if (aclResult !== null) {
            await this._audit(
              subjectId,
              action,
              resource,
              aclResult.allowed,
              aclResult.reason,
            );
            return aclResult;
          }
        }
      }
    }

    // 默认：单用户系统允许所有操作
    await this._audit(subjectId, action, resource, true, "default_allow");
    return { allowed: true, reason: "default_allow" };
  }

  /**
   * 快速检查（不审计）
   */
  async can(subject, action, resource) {
    const result = await this.check(subject, action, resource);
    return result.allowed;
  }

  /**
   * 批量检查
   */
  async batchCheck(subject, actions, resource) {
    const results = {};
    for (const action of actions) {
      results[action] = await this.check(subject, action, resource);
    }
    return results;
  }

  async _audit(subject, action, resource, allowed, reason) {
    if (this.audit) {
      try {
        await this.audit.record(subject, action, resource, allowed, reason);
      } catch (e) {
        this.logger.error("policyEngine: audit record failed", e);
      }
    }
  }
}

module.exports = PolicyEngine;
