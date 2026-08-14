/**
 * Workflow — Workflow 定义（过程模型）
 *
 * Workflow 是独立一等系统，描述"某类对象、事件或过程在现实中的变化规律"。
 * 它不属于 Resource，不是 Resource 的字段扩展，也不是简单的状态字段管理。
 * 状态机是其核心执行模型，但 Workflow 定位为过程模型：除状态流转外，
 * 还承载事件输出、条件与动作声明，为未来 Automation / Agent 提供运行规则。
 *
 * 结构:
 *   id               — 唯一标识
 *   name             — 显示名称
 *   description      — 描述
 *   version          — 定义版本（实例创建时记录该版本，支持定义演进）
 *   applicableSchemas — 可选作用域限制：可作用于这些 Schema（id/name）
 *                      空数组 = 不限制。语义是"可以作用于"，不是"属于"。
 *   states           — State[]
 *   transitions      — Transition[]
 *   status           — active | inactive | deprecated
 *   metadata         — 扩展信息
 *
 * State:
 *   { id, name?, description?, metadata? }  — 状态只描述位置，不修改 Resource
 *
 * Transition:
 *   { id, from, to, name?, rules[], events[], actions?, metadata? }
 *   — 允许的变化；rules 只判断不执行（决定是否允许转换）；
 *     events 声明转换完成时对外发出的事件类型（作为与外部系统连接的接口）；
 *     actions 为预留声明，动作执行归属 Automation，Workflow 只声明不执行。
 *
 * Workflow 是唯一合法状态变化入口：禁止直接修改资源状态，
 * 必须通过 workflow.transition(instance, targetState)。
 */

// Workflow 系统事件保留名：业务事件（transition.events 声明的类型）不得与其冲突。
// 系统事件由 Workflow 引擎产生；业务事件是用户声明、对外广播的事件接口。
const WORKFLOW_SYSTEM_EVENTS = new Set([
  "WorkflowInstanceCreated",
  "WorkflowTransitionCompleted",
  "WorkflowInstanceCompleted",
  "WorkflowInstanceDetached",
  "WorkflowInstanceResumed",
]);

class Workflow {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {string} [opts.name]
   * @param {string} [opts.description]
   * @param {number} [opts.version]
   * @param {Array} [opts.applicableSchemas]
   * @param {Array} [opts.states]
   * @param {Array} [opts.transitions]
   * @param {string} [opts.status]
   * @param {object} [opts.metadata]
   */
  constructor({
    id,
    name,
    description,
    version,
    applicableSchemas,
    states,
    transitions,
    status,
    metadata,
  } = {}) {
    if (!id) throw new Error("Workflow must have an id");

    this.id = id;
    this.name = name || id;
    this.description = description || "";
    this.version = version || 1;
    this.applicableSchemas = Array.isArray(applicableSchemas)
      ? applicableSchemas.slice()
      : [];
    this.states = (states || []).map((s) => this._normalizeState(s));
    this.transitions = (transitions || []).map((t) =>
      this._normalizeTransition(t),
    );
    this.status = status || "active";
    this.metadata = metadata || {};
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
  }

  _normalizeState(s) {
    if (typeof s === "string") return { id: s, name: s };
    if (!s || typeof s !== "object")
      throw new Error(`Workflow '${this.id}': 非法 state 定义`);
    if (!s.id || typeof s.id !== "string")
      throw new Error(`Workflow '${this.id}': state 必须包含非空 id`);
    return {
      id: s.id,
      name: s.name !== undefined ? s.name : s.id,
      description: s.description || "",
      metadata: s.metadata || {},
    };
  }

  _normalizeTransition(t) {
    if (!t || typeof t !== "object")
      throw new Error(`Workflow '${this.id}': 非法 transition 定义`);
    if (!t.id && (t.from === undefined || t.to === undefined)) {
      throw new Error(`Workflow '${this.id}': transition 必须包含 from/to`);
    }
    return {
      id: t.id || `${t.from}__${t.to}`,
      from: t.from,
      to: t.to,
      name: t.name || `${t.from} → ${t.to}`,
      rules: Array.isArray(t.rules) ? t.rules : [],
      events: Array.isArray(t.events) ? t.events : [],
      actions: Array.isArray(t.actions) ? t.actions : [],
      metadata: t.metadata || {},
    };
  }

  /**
   * 获取状态
   */
  getState(id) {
    return this.states.find((s) => s.id === id) || null;
  }

  /**
   * 获取转换（from → to）
   */
  getTransition(from, to) {
    return this.transitions.find((t) => t.from === from && t.to === to) || null;
  }

  /**
   * 初始状态（默认第一个 state）
   */
  get initialState() {
    return this.states.length ? this.states[0].id : null;
  }

  /**
   * 验证 Workflow 定义
   * @returns {string[]} 错误列表（空数组表示通过）
   */
  validate() {
    const errors = [];

    if (this.states.length === 0) {
      errors.push("Workflow must have at least one state");
    }

    const stateIds = new Set(this.states.map((s) => s.id));

    if (this.transitions.length === 0) {
      errors.push("Workflow must have at least one transition");
    }

    for (const t of this.transitions) {
      if (t.from === undefined || t.to === undefined) {
        errors.push(`Transition '${t.id}': 必须包含 from/to`);
        continue;
      }
      if (t.from !== undefined && !stateIds.has(t.from)) {
        errors.push(`Transition '${t.id}': from state '${t.from}' 不存在`);
      }
      if (t.to !== undefined && !stateIds.has(t.to)) {
        errors.push(`Transition '${t.id}': to state '${t.to}' 不存在`);
      }
    }

    // from→to 不允许重复
    const seen = new Set();
    for (const t of this.transitions) {
      const key = `${t.from}->${t.to}`;
      if (seen.has(key)) {
        errors.push(`Transition '${key}' 重复定义`);
      }
      seen.add(key);
    }

    // 业务事件不得使用 Workflow 系统事件保留名（系统事件由引擎产生，业务事件对外广播）
    for (const t of this.transitions) {
      for (const evtType of t.events || []) {
        if (WORKFLOW_SYSTEM_EVENTS.has(evtType)) {
          errors.push(
            `Transition '${t.id}': 事件类型 '${evtType}' 为 Workflow 系统事件保留名，业务事件不能使用`,
          );
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
      version: this.version,
      applicableSchemas: this.applicableSchemas,
      states: this.states,
      transitions: this.transitions,
      status: this.status,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static fromJSON(json) {
    const wf = new Workflow({
      id: json.id,
      name: json.name,
      description: json.description,
      version: json.version,
      applicableSchemas: json.applicableSchemas,
      states: json.states,
      transitions: json.transitions,
      status: json.status,
      metadata: json.metadata,
    });
    wf.createdAt = json.createdAt || Date.now();
    wf.updatedAt = json.updatedAt || wf.createdAt;
    return wf;
  }
}

module.exports = Workflow;
