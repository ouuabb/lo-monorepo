/**
 * AutomationContext — 执行上下文
 *
 * 为 Automation 执行提供运行时上下文，Action 根据 context 工作。
 * 对应文档第十节 Execution Context：
 *   { event, resource, workflow, state, input, actor }
 */

class AutomationContext {
  /**
   * @param {object} opts
   * @param {string} opts.automationId
   * @param {string} opts.triggerSource — scheduler | event | cli | plugin | agent
   * @param {object} [opts.event]       — 触发事件 { type, payload }
   * @param {object} [opts.resource]    — 关联资源（可由 resource 引用解析而来）
   * @param {object} [opts.workflow]    — 关联工作流信息
   * @param {object} [opts.input]       — 外部输入（如 Agent 生成的目标/参数）
   * @param {string} [opts.actor]       — 执行主体，默认 'automation'
   */
  constructor(opts = {}) {
    this.automationId = opts.automationId;
    this.triggerSource = opts.triggerSource || 'cli';
    this.event = opts.event || null;
    this.resource = opts.resource || null;
    this.workflow = opts.workflow || null;
    this.input = opts.input || null;
    this.actor = opts.actor || 'automation';
    this.startedAt = Date.now();
  }

  /**
   * 序列化为可持久化的 context（automation_runs.execution_context）
   */
  toJSON() {
    return {
      automationId: this.automationId,
      triggerSource: this.triggerSource,
      event: this.event,
      resource: this.resource,
      workflow: this.workflow,
      input: this.input,
      actor: this.actor,
      startedAt: this.startedAt
    };
  }

  /**
   * 从存储的 JSON 还原
   */
  static fromJSON(json) {
    const ctx = new AutomationContext({
      automationId: json.automationId,
      triggerSource: json.triggerSource,
      event: json.event,
      resource: json.resource,
      workflow: json.workflow,
      input: json.input,
      actor: json.actor
    });
    if (json.startedAt) ctx.startedAt = json.startedAt;
    return ctx;
  }
}

module.exports = AutomationContext;