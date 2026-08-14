/**
 * Policy — 声明式策略模型
 *
 * Phase 6.9: 支持声明式策略定义，用于策略引擎评估。
 * 策略格式：subject × resource × action → allow/deny，带优先级和条件。
 */

class Policy {
  /**
   * @param {object} opts
   * @param {string} opts.id         — 策略 ID
   * @param {string} opts.subject    — 主体模式（支持 * 通配）
   * @param {string} opts.resource   — 资源模式（支持 * 通配）
   * @param {string[]} opts.actions  — 操作列表
   * @param {'allow'|'deny'} opts.effect  — 效果
   * @param {number} [opts.priority] — 优先级（越大越高，默认 0）
   * @param {object} [opts.condition] — 条件（{ field, op, value }）
   * @param {object} [opts.metadata] — 元数据
   */
  constructor(opts = {}) {
    this.id = opts.id || "";
    this.subject = opts.subject || "*";
    this.resource = opts.resource || "*";
    this.actions = opts.actions || [];
    this.effect = opts.effect || "allow";
    this.priority = opts.priority || 0;
    this.condition = opts.condition || null;
    this.metadata = opts.metadata || {};
  }

  /**
   * 检查是否匹配给定请求
   * @param {string} subjectId
   * @param {string} action
   * @param {string} resourceId
   * @returns {boolean}
   */
  matches(subjectId, action, resourceId) {
    // 主体匹配
    if (!this._matchPattern(this.subject, subjectId)) return false;
    // 资源匹配
    if (!this._matchPattern(this.resource, resourceId)) return false;
    // 操作匹配
    if (!this.actions.includes(action) && !this.actions.includes("*"))
      return false;
    return true;
  }

  /**
   * 评估条件
   * @param {object} context — { resource, subject, ... }
   * @returns {boolean}
   */
  evaluateCondition(context = {}) {
    if (!this.condition) return true;

    const { field, op, value } = this.condition;
    const actual = this._getNestedValue(context, field);

    switch (op) {
      case "eq":
        return actual === value;
      case "neq":
        return actual !== value;
      case "in":
        return Array.isArray(value) && value.includes(actual);
      case "not_in":
        return Array.isArray(value) && !value.includes(actual);
      case "contains":
        return typeof actual === "string" && actual.includes(value);
      case "starts_with":
        return typeof actual === "string" && actual.startsWith(value);
      case "gt":
        return actual > value;
      case "lt":
        return actual < value;
      case "gte":
        return actual >= value;
      case "lte":
        return actual <= value;
      case "exists":
        return actual !== undefined && actual !== null;
      case "not_exists":
        return actual === undefined || actual === null;
      default:
        return true;
    }
  }

  _matchPattern(pattern, value) {
    if (pattern === "*") return true;
    if (pattern === value) return true;
    // 支持 glob 风格通配
    if (pattern.includes("*")) {
      const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
      return regex.test(value);
    }
    return false;
  }

  _getNestedValue(obj, path) {
    if (!path) return obj;
    const keys = path.split(".");
    let current = obj;
    for (const key of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return current;
  }

  toJSON() {
    return {
      id: this.id,
      subject: this.subject,
      resource: this.resource,
      actions: this.actions,
      effect: this.effect,
      priority: this.priority,
      condition: this.condition,
      metadata: this.metadata,
    };
  }

  static fromJSON(json) {
    return new Policy(json);
  }
}

module.exports = Policy;
