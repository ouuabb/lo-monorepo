/**
 * AccessControl — 统一访问控制 API
 *
 * Phase 6.9: 提供统一的 can() API，整合授权和审计。
 */

class AccessControl {
  /**
   * @param {object} services
   * @param {import('./authorization.cjs')} services.authorization
   * @param {import('./auditLogger.cjs')} services.auditLogger
   * @param {import('./securityEvent.cjs')} [services.eventEmitter]
   */
  constructor(services = {}) {
    this.authorization = services.authorization;
    this.auditLogger = services.auditLogger;
    this.eventEmitter = services.eventEmitter || null;
    this.logger = services.logger || console;
  }

  /**
   * 检查主体能否执行操作
   * @param {object|string} subject — SecurityContext 或主体 ID
   * @param {string} action         — 如 "note.write"
   * @param {string} [resource]     — 资源 RID
   * @returns {Promise<boolean>}
   */
  async can(subject, action, resource) {
    const context = typeof subject === 'string' ? { id: subject, type: 'user' } : subject;

    const allowed = await this.authorization.can(context, action, resource);

    // 审计
    await this.auditLogger.log({
      actor: context.id || context.subject?.id || 'unknown',
      action,
      resource: resource || '',
      result: allowed ? 'granted' : 'denied',
      reason: allowed ? 'access granted' : 'access denied'
    });

    // 发布事件
    if (this.eventEmitter) {
      this.eventEmitter.emit({
        type: allowed ? 'security.access.granted' : 'security.access.denied',
        severity: allowed ? 'info' : 'warning',
        actor: context.id || 'unknown',
        action,
        resource
      });
    }

    return allowed;
  }

  /**
   * deny > allow 检查
   */
  async canAll(subject, actions, resource) {
    for (const action of actions) {
      if (!(await this.can(subject, action, resource))) return false;
    }
    return true;
  }
}

module.exports = AccessControl;
