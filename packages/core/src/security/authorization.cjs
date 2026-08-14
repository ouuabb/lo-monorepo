/**
 * Authorization — 授权引擎
 *
 * Phase 6.9: 在现有 PolicyEngine 之上封装授权决策。
 * 核心：authorize(context, action, resource) → { allowed, reason }
 */

class Authorization {
  /**
   * @param {object} services
   * @param {import('./policyEngine.cjs')} services.policyEngine
   * @param {import('./permissionManager.cjs')} services.permissionManager
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.policyEngine = services.policyEngine;
    this.permissionManager = services.permissionManager;
    this.logger = services.logger || console;
  }

  /**
   * 授权决策
   * @param {object} context     — SecurityContext 或 { subject }
   * @param {string} action      — 如 "resource.read"
   * @param {string} [resource]  — 资源 RID
   * @returns {Promise<{allowed: boolean, reason: string}>}
   */
  async authorize(context, action, resource) {
    const subject = context && context.subject
      ? context.subject
      : (context && typeof context === 'object' && context.id ? context : null);
    if (!subject) {
      return { allowed: false, reason: 'no subject in context' };
    }

    try {
      const result = await this.policyEngine.check(subject, action, resource);
      return {
        allowed: result.allowed !== false,
        reason: result.reason || (result.allowed !== false ? 'access granted' : 'access denied')
      };
    } catch (e) {
      this.logger.error(`[authorization] check failed: ${e.message}`);
      return { allowed: false, reason: `authorization error: ${e.message}` };
    }
  }

  /**
   * 快速权限检查
   */
  async can(context, action, resource) {
    const result = await this.authorize(context, action, resource);
    return result.allowed;
  }

  /**
   * 批量权限检查
   */
  async batchAuthorize(context, actions, resource) {
    const results = {};
    for (const action of actions) {
      results[action] = await this.authorize(context, action, resource);
    }
    return results;
  }

  /**
   * 检查是否拥有所有指定权限
   */
  async canAll(context, actions, resource) {
    for (const action of actions) {
      const allowed = await this.can(context, action, resource);
      if (!allowed) return false;
    }
    return true;
  }
}

module.exports = Authorization;
