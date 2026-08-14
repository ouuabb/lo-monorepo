/**
 * ResourcePolicy — 资源级 ACL
 *
 * Phase 6.4: 为单个 Resource 定义访问控制。
 *
 * 例如: 某个特定笔记只允许特定用户读取。
 */

class ResourcePolicy {
  /**
   * @param {object} opts
   * @param {string} opts.resourceId
   * @param {Array<{ subjectId: string, permission: string }>} [opts.allow]
   * @param {Array<{ subjectId: string, permission: string }>} [opts.deny]
   */
  constructor({ resourceId, allow, deny } = {}) {
    this.resourceId = resourceId || '';
    this.allow = allow || [];
    this.deny = deny || [];
  }

  /**
   * 检查 subject 是否有某权限
   */
  check(subjectId, action) {
    // 先检查 deny
    for (const d of this.deny) {
      if (this._matchSubject(d.subjectId, subjectId) && d.permission === action) {
        return { allowed: false, reason: 'denied_by_acl' };
      }
    }

    // 检查 allow
    for (const a of this.allow) {
      if (this._matchSubject(a.subjectId, subjectId) &&
          (a.permission === action || a.permission === '*')) {
        return { allowed: true, reason: 'allowed_by_acl' };
      }
    }

    // 无匹配 => null 表示让上层策略决定
    return null;
  }

  _matchSubject(pattern, subjectId) {
    if (pattern === '*') return true;
    return pattern === subjectId;
  }

  toJSON() {
    return {
      resourceId: this.resourceId,
      allow: this.allow,
      deny: this.deny
    };
  }

  static fromJSON(json) {
    return new ResourcePolicy(json);
  }
}

module.exports = ResourcePolicy;
