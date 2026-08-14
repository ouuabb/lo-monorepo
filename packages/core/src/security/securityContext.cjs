/**
 * SecurityContext — 安全上下文
 *
 * Phase 6.4: 保存当前执行环境的权限信息。
 * Phase 6.9: 集成 Identity、请求追踪、时间戳。
 */

const crypto = require("crypto");

class SecurityContext {
  /**
   * @param {object} opts
   * @param {import('./subject.cjs')|import('./identity.cjs')} [opts.subject]
   * @param {string[]} [opts.roles]        — 角色 ID 列表
   * @param {string[]} [opts.permissions]   — 直接授予的权限
   * @param {string} [opts.source]         — 来源（CLI/API/Plugin/Agent/Workflow）
   * @param {string} [opts.requestId]      — 请求追踪 ID
   * @param {number} [opts.timestamp]      — 创建时间戳
   */
  constructor({
    subject,
    roles,
    permissions,
    source,
    requestId,
    timestamp,
  } = {}) {
    this.subject = subject || require("./subject.cjs").currentUser();
    this.roles = roles || ["owner"];
    this.permissions = permissions || [];
    this.source = source || "cli";
    this.requestId = requestId || this._generateRequestId();
    this.timestamp = timestamp || Date.now();
  }

  /**
   * 从 Identity 创建
   * @param {import('./identity.cjs')} identity
   * @param {object} [opts]
   */
  static fromIdentity(identity, opts = {}) {
    const Subject = require("./subject.cjs");

    // 映射 identity type → subject 构造
    let subject;
    switch (identity.type) {
      case "user":
        subject = new Subject({
          id: identity.id,
          type: "user",
          attributes: identity.metadata,
        });
        break;
      case "agent":
        subject = Subject.aiAgent(identity.id);
        break;
      case "plugin":
        subject = new Subject({
          id: identity.id,
          type: "plugin",
          attributes: identity.metadata,
        });
        break;
      case "workflow":
        subject = new Subject({
          id: identity.id,
          type: "workflow",
          attributes: identity.metadata,
        });
        break;
      case "service":
        subject = new Subject({
          id: identity.id,
          type: "user",
          attributes: identity.metadata,
        });
        break;
      default:
        subject = new Subject({
          id: identity.id,
          type: "user",
          attributes: identity.metadata,
        });
    }

    return new SecurityContext({
      subject,
      roles: opts.roles || ["viewer"],
      permissions: opts.permissions || [],
      source: opts.source || identity.type,
      requestId: opts.requestId,
      timestamp: opts.timestamp || Date.now(),
    });
  }

  /**
   * 获取所有有效权限
   */
  getAllPermissions(permissionManager) {
    const perms = new Set();

    // 角色权限
    for (const roleId of this.roles) {
      if (permissionManager) {
        const role = permissionManager.getRole(roleId);
        if (role) {
          for (const p of role.permissionCodes) {
            perms.add(p);
          }
        }
      }
    }

    // 直接权限
    for (const p of this.permissions) {
      perms.add(p);
    }

    return Array.from(perms);
  }

  toJSON() {
    return {
      subject: this.subject
        ? typeof this.subject.toJSON === "function"
          ? this.subject.toJSON()
          : this.subject
        : null,
      roles: this.roles,
      permissions: this.permissions,
      source: this.source,
      requestId: this.requestId,
      timestamp: this.timestamp,
    };
  }

  _generateRequestId() {
    return `req_${crypto.randomBytes(8).toString("hex")}`;
  }
}

module.exports = SecurityContext;
