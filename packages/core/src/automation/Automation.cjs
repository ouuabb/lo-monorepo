/**
 * Automation — Automation 定义（行为编排模型）
 *
 * Automation 是 lo 的行为层：描述"在什么条件下，由什么触发，自动执行什么行为"。
 * 它不直接修改 Resource，不保存业务状态，不替代 Agent。
 * 所有变化必须经过已有系统（ResourceService / OperationEngine / Workflow Engine / Suggestion）。
 *
 * 结构:
 *   id        — 唯一标识（如 knowledge.maintenance.daily）
 *   name      — 显示名称
 *   description — 描述
 *   source    — 来源 { type: 'builtin'|'user'|'agent'|'plugin', id }
 *   trigger   — 触发定义 { type: 'schedule'|'event'|'external', ... }
 *   condition — 条件定义 { expression }（空 = 直接执行）
 *   actions   — Action[] { id, type, params, dependsOn }
 *   policy    — 执行策略 { requireApproval, risk }
 *   status    — active | inactive
 *   metadata  — 扩展信息
 */

const TRIGGER_TYPES = new Set(["schedule", "event", "external"]);
const SOURCE_TYPES = new Set(["builtin", "user", "agent", "plugin"]);

class Automation {
  constructor({
    id,
    name,
    description,
    source = {},
    trigger = {},
    condition = {},
    actions = [],
    policy = {},
    status = "active",
    metadata = {},
  } = {}) {
    this.id = id;
    this.name = name || id;
    this.description = description || "";
    this.source = this._normalizeSource(source);
    this.trigger = this._normalizeTrigger(trigger);
    this.condition = condition || {};
    this.actions = (actions || []).map((a) => this._normalizeAction(a));
    this.policy = this._normalizePolicy(policy);
    this.status = status || "active";
    this.metadata = metadata || {};
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  _normalizeSource(source = {}) {
    return {
      type: SOURCE_TYPES.has(source.type) ? source.type : "user",
      id: source.id || null,
    };
  }

  _normalizeTrigger(trigger = {}) {
    const type = TRIGGER_TYPES.has(trigger.type) ? trigger.type : "external";
    return {
      type,
      schedule: trigger.schedule || null,
      event: trigger.event || null,
      match: trigger.match || null,
    };
  }

  _normalizeAction(action = {}) {
    return {
      id: action.id || `step_${Math.random().toString(36).slice(2, 8)}`,
      type: action.type,
      params: action.params || {},
      dependsOn: action.dependsOn || [],
    };
  }

  _normalizePolicy(policy = {}) {
    return {
      requireApproval: Boolean(policy.requireApproval),
      risk: policy.risk === "high" ? "high" : "low",
      failFast: Boolean(policy.failFast),
    };
  }

  /**
   * 校验定义，返回错误列表
   */
  validate() {
    const errors = [];
    if (!this.id || typeof this.id !== "string") {
      errors.push("id 必须是非空字符串");
    }
    if (!Array.isArray(this.actions) || this.actions.length === 0) {
      errors.push("actions 必须包含至少一个 Action");
    } else {
      const ids = new Set();
      for (const a of this.actions) {
        if (!a.type) errors.push(`Action '${a.id || "?"}' 缺少 type`);
        if (ids.has(a.id)) errors.push(`Action id 重复: ${a.id}`);
        ids.add(a.id);
        for (const dep of a.dependsOn || []) {
          if (!this.actions.some((x) => x.id === dep)) {
            errors.push(`Action '${a.id}' 依赖未定义的 Action: ${dep}`);
          }
        }
      }
    }
    return errors;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      source: this.source,
      trigger: this.trigger,
      condition: this.condition,
      actions: this.actions,
      policy: this.policy,
      status: this.status,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static fromJSON(json) {
    const a = new Automation(json);
    a.createdAt = json.createdAt || a.createdAt;
    a.updatedAt = json.updatedAt || a.updatedAt;
    return a;
  }
}

module.exports = Automation;
