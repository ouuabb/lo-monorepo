/**
 * AutomationEngine — Automation 执行引擎
 *
 * 完整执行流程（对应文档第九节）:
 *   Trigger发生 → 加载 Automation Definition → 检查 Condition
 *   → 生成 Execution Context → 执行 Action → 记录 Execution Event → 完成
 *
 * 同时是 Agent 可调用的统一执行入口：
 *   AutomationEngine.executeAutomation(id, { context, triggerSource })
 * （核心层不含 intent 匹配，意图归 Agent 层）
 */

const AutomationContext = require('./AutomationContext.cjs');
const TriggerResolver = require('./trigger/TriggerResolver.cjs');
const RuleEngine = require('../workflow/ruleEngine.cjs');

// 生成运行记录 id（与现有 store 风格一致）
function genRunId() {
  return `arun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

class AutomationEngine {
  /**
   * @param {object} services
   * @param {import('../repo/repository.cjs')} services.repo
   * @param {AutomationRegistry} services.registry
   * @param {ActionExecutor} services.executor
   * @param {AutomationStore} services.store
   * @param {object} [services.eventBus]
   * @param {object} [services.ruleEngine]
   * @param {object} [services.triggerResolver]
   * @param {object} [services.suggestionEngine]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.repo = services.repo;
    this.registry = services.registry;
    this.executor = services.executor;
    this.store = services.store;
    this.eventBus = services.eventBus || null;
    this.ruleEngine = services.ruleEngine || new RuleEngine({ logger: services.logger || console });
    this.triggerResolver = services.triggerResolver || new TriggerResolver();
    this.suggestionEngine = services.suggestionEngine || null;
    this.logger = services.logger || console;
  }

  /**
   * 评估 condition（空 condition 直接通过）
   * @param {object} condition — { expression }
   * @param {object} context   — 规则求值上下文 { resource, instance, ... }
   * @returns {boolean}
   */
  _evaluateCondition(condition, context) {
    if (!condition || !condition.expression) return true;
    return this.ruleEngine.evaluateRules(condition.expression, context);
  }

  /**
   * 获取待执行资源（由 context 的 resource 引用解析）
   */
  async _resolveResourceFromContext(ctx) {
    const ref = ctx.resource;
    if (!ref) return null;
    if (typeof ref === 'string') {
      return this.repo.resolveResource(ref);
    }
    if (ref && typeof ref === 'object') {
      const input = ref.rid || ref.name || ref.path;
      if (input) return this.repo.resolveResource(input);
      return ref; // 已解析对象原样返回
    }
    return null;
  }

  /**
   * 执行单个 Automation
   * @param {string} id
   * @param {object} [opts]
   * @param {string} [opts.triggerSource] — scheduler | event | cli | plugin | agent
   * @param {object} [opts.event]         — 触发事件
   * @param {object} [opts.input]         — 外部输入
   * @param {object} [opts.resource]      — 资源引用
   * @param {object} [opts.workflow]      — 工作流信息
   * @param {string} [opts.actor]
   * @returns {Promise<object>} 执行记录
   */
  async executeAutomation(id, opts = {}) {
    const automation = this.registry.get(id);
    if (!automation) throw new Error(`Automation '${id}' 不存在`);

    const ctx = new AutomationContext({
      automationId: id,
      triggerSource: opts.triggerSource || 'cli',
      event: opts.event || null,
      input: opts.input || null,
      resource: opts.resource || null,
      workflow: opts.workflow || null,
      actor: opts.actor || 'automation'
    });

    const run = {
      id: genRunId(),
      automation_id: id,
      trigger_source: ctx.triggerSource,
      execution_context: ctx.toJSON(),
      actions_result: [],
      status: 'running',
      started: Date.now(),
      finished: null,
      error: ''
    };

    this._emit('automation.started', { automationId: id, runId: run.id, triggerSource: ctx.triggerSource });

    try {
      if (automation.status !== 'active') {
        throw new Error(`Automation '${id}' 未启用（${automation.status}）`);
      }

      // 解析关联资源，注入求值上下文
      const resource = await this._resolveResourceFromContext(ctx);
      const ruleContext = {
        resource,
        workflow: ctx.workflow ? { ...ctx.workflow } : null,
        input: ctx.input,
        event: ctx.event ? ctx.event.payload || ctx.event : null
      };

      // 检查 Condition
      if (!this._evaluateCondition(automation.condition, ruleContext)) {
        run.status = 'skipped';
        run.finished = Date.now();
        await this.store.saveRun(run);
        this._emit('automation.finished', { automationId: id, runId: run.id, status: 'skipped' });
        return run;
      }

      // 执行 Action
      const actionCtx = {
        ...ctx.toJSON(),
        automationId: id,
        triggerSource: ctx.triggerSource,
        suggestionEngine: this.suggestionEngine,
        extensionRegistry: this.executor.extensionRegistry
      };

      const results = await this.executor.executeActions(automation.actions, actionCtx, {
        requireApproval: automation.policy.requireApproval,
        failFast: automation.policy.failFast
      });

      run.actions_result = Array.isArray(results) ? results : [];
      const hasError = run.actions_result.some((r) => r.ok === false);
      const needsApproval = run.actions_result.some((r) => r.result && r.result.needApproval);
      run.status = hasError ? 'failed' : needsApproval ? 'pending_approval' : 'completed';
      run.finished = Date.now();
      await this.store.saveRun(run);

      if (hasError) {
        const errMsg = run.actions_result.find((r) => r.ok === false);
        run.error = errMsg ? errMsg.error : 'action failed';
      }

      if (needsApproval) {
        this._emit('automation.suggestion.created', { automationId: id, runId: run.id });
      }
      this._emit('automation.finished', { automationId: id, runId: run.id, status: run.status });

      return run;
    } catch (e) {
      run.status = 'failed';
      run.error = e.message;
      run.finished = Date.now();
      try { await this.store.saveRun(run); } catch { /* 记录失败不影响上报 */ }
      this._emit('automation.finished', { automationId: id, runId: run.id, status: 'failed', error: e.message });
      throw e;
    }
  }

  /**
   * 事件触发入口（由 AutomationScheduler 调用）
   */
  async onEvent(event) {
    return this.triggerByEvent(event);
  }

  /**
   * 根据事件匹配并执行 automation
   * @param {object} event — { type, payload }
   */
  async triggerByEvent(event) {
    const matched = this.registry.list().filter((a) => {
      if (a.status !== 'active') return false;
      if (a.trigger && a.trigger.type !== 'event') return false;
      return this.triggerResolver.matchesEvent(a.trigger, event);
    });

    const results = [];
    for (const a of matched) {
      try {
        results.push(await this.executeAutomation(a.id, { triggerSource: 'event', event }));
      } catch (e) {
        this.logger.error(`[automation] '${a.id}' 事件触发失败: ${e.message}`);
        results.push({ automationId: a.id, ok: false, error: e.message });
      }
    }
    return results;
  }

  /**
   * 调度触发的执行（由 RuntimeScheduler 任务调用，无事件上下文）
   */
  async onSchedule(id) {
    return this.executeAutomation(id, { triggerSource: 'scheduler' });
  }

  _emit(type, payload) {
    if (!this.eventBus) return;
    try {
      this.eventBus.emit({ type, payload, source: 'automation' });
    } catch (e) {
      this.logger.error(`[automation] emit ${type} failed: ${e.message}`);
    }
  }
}

module.exports = AutomationEngine;