/**
 * ResourceGuard — 资源操作守卫
 *
 * Phase 6.9: 保护 Resource 层的所有操作。
 * 所有 create/read/update/delete/link/export 操作经过守卫检查。
 */

class ResourceGuard {
  /**
   * @param {object} services
   * @param {import('./accessControl.cjs')} services.accessControl
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.accessControl = services.accessControl;
    this.logger = services.logger || console;
  }

  /**
   * 守卫资源操作
   * @param {string} action     — create|read|update|delete|link|export
   * @param {object} context    — SecurityContext
   * @param {string} resourceId — 资源 RID
   * @returns {Promise<{allowed: boolean, reason: string}>}
   */
  async guard(action, context, resourceId) {
    const permissionAction = `resource.${action}`;

    const allowed = await this.accessControl.can(
      context,
      permissionAction,
      resourceId,
    );

    if (!allowed) {
      const reason = `resource.${action} denied on ${resourceId}`;
      this.logger.warn(`[resource-guard] ${reason}`);
      return { allowed: false, reason };
    }

    return { allowed: true, reason: "allowed" };
  }

  /**
   * 批量守卫
   */
  async guardAll(actions, context, resourceId) {
    const results = {};
    for (const action of actions) {
      results[action] = await this.guard(action, context, resourceId);
    }
    return results;
  }
}

module.exports = ResourceGuard;
