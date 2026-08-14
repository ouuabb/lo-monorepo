/**
 * SecurityEvent — 安全事件发布
 *
 * Phase 6.9: 安全事件进入 EventBus，连接审计和监控。
 *
 * 事件类型：
 *   security.access.granted
 *   security.access.denied
 *   security.policy.changed
 *   security.identity.created
 *   security.token.expired
 *   security.credential.revoked
 *   security.audit.anomaly
 */

class SecurityEvent {
  constructor(eventBus) {
    this.eventBus = eventBus || null;
  }

  /**
   * 发布安全事件
   * @param {object} event
   * @param {string} event.type    — 事件类型
   * @param {string} [event.severity] — info|warning|error
   * @param {string} [event.actor] — 操作者
   * @param {string} [event.action]
   * @param {string} [event.resource]
   * @param {object} [event.payload] — 额外数据
   */
  emit(event) {
    if (!this.eventBus) return;

    try {
      this.eventBus.emit({
        type: event.type || 'security.event',
        source: 'security',
        payload: {
          severity: event.severity || 'info',
          actor: event.actor,
          action: event.action,
          resource: event.resource,
          timestamp: Date.now(),
          ...event.payload
        }
      });
    } catch (e) {
      // 静默失败，不阻塞正常流程
    }
  }

  accessGranted(actor, action, resource) {
    this.emit({ type: 'security.access.granted', severity: 'info', actor, action, resource });
  }

  accessDenied(actor, action, resource) {
    this.emit({ type: 'security.access.denied', severity: 'warning', actor, action, resource });
  }

  policyChanged(actor, policyId) {
    this.emit({ type: 'security.policy.changed', severity: 'info', actor, payload: { policyId } });
  }

  identityCreated(actor, identityId) {
    this.emit({ type: 'security.identity.created', severity: 'info', actor, payload: { identityId } });
  }

  tokenExpired(identityId, tokenId) {
    this.emit({ type: 'security.token.expired', severity: 'warning', actor: identityId, payload: { tokenId } });
  }

  credentialRevoked(actor, credentialId) {
    this.emit({ type: 'security.credential.revoked', severity: 'warning', actor, payload: { credentialId } });
  }

  auditAnomaly(actor, details) {
    this.emit({ type: 'security.audit.anomaly', severity: 'error', actor, payload: details });
  }
}

module.exports = SecurityEvent;
