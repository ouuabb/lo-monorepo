/**
 * ActionExecutor — Action 执行器
 *
 * 负责：
 *   1. 注册内置 Action（resource / workflow / suggestion / plugin / agent / knowledge）
 *   2. 按序执行 Automation Definition 的 actions（支持简单 dependsOn 顺序，不做完整 DAG）
 *   3. 高风险动作在 requireApproval 策略下路由到 Suggestion Pipeline（不直接执行）
 *   4. 单步失败隔离（记入 actions_result，不中断后续步骤，除非 failFast）
 */

const ActionRegistry = require('./ActionRegistry.cjs');

const resourceActions = require('./resource.cjs');
const workflowActions = require('./workflow.cjs');
const suggestionActions = require('./suggestion.cjs');
const pluginActions = require('./plugin.cjs');
const agentActions = require('./agent.cjs');
const knowledgeActions = require('./knowledge.cjs');

// 高风险动作：requireApproval 时生成 Suggestion 而不直接执行
const HIGH_RISK_ACTIONS = new Set([
  'resource.delete',
  'resource.move',
  'resource.merge',
  'workflow.transition'
]);

class ActionExecutor {
  /**
   * @param {object} services
   * @param {import('../repo/repository.cjs')} services.repo
   * @param {object} [services.extensionRegistry]
   * @param {object} [services.suggestionEngine]
   */
  constructor(services = {}) {
    this.repo = services.repo;
    this.registry = services.registry || new ActionRegistry();
    this.extensionRegistry = services.extensionRegistry || null;
    this.suggestionEngine = services.suggestionEngine || null;
    this._registerBuiltins();
  }

  _registerBuiltins() {
    const groups = [resourceActions, workflowActions, suggestionActions, pluginActions, agentActions, knowledgeActions];
    for (const group of groups) {
      for (const [type, handler] of Object.entries(group)) {
        this.registry.register(type, handler);
      }
    }
  }

  /**
   * 判断某动作是否高风险
   */
  isHighRisk(type) {
    return HIGH_RISK_ACTIONS.has(type);
  }

  /**
   * 执行一个动作
   * @returns {Promise<{ type: string, ok: boolean, result?: any, error?: string }>}
   */
  async _runStep(action, ctx, requireApproval) {
    const { type } = action;
    const params = action.params || {};

    // 高风险 + requireApproval → 生成 Suggestion
    if (requireApproval && this.isHighRisk(type)) {
      try {
        const engine = this.suggestionEngine || new (require('../repo/suggestionEngine.cjs'))(this.repo.db);
        const suggestion = await engine.create({
          type,
          source: params.resource || params.rid || params.from || null,
          target: params.to || params.target || null,
          reason: params.reason || `automation '${ctx.automationId}' 请求执行高风险动作 ${type}`,
          payload: { automationId: ctx.automationId, params },
          confidence: params.confidence || 0.9,
          priority: params.priority || 'high',
          sourceCategory: 'automation'
        });
        return { type, ok: true, result: { needApproval: true, suggestion } };
      } catch (e) {
        return { type, ok: false, error: e.message };
      }
    }

    // 普通执行
    try {
      const handler = this.registry.get(type);
      const ctx2 = { ...ctx, repo: this.repo, extensionRegistry: this.extensionRegistry, suggestionEngine: this.suggestionEngine };
      const result = await handler(ctx2, params);
      return { type, ok: result && result.ok === false && !result.needApproval ? false : true, result };
    } catch (e) {
      return { type, ok: false, error: e.message };
    }
  }

  /**
   * 按依赖序执行 actions
   * 简单依赖：先保证 dependsOn 中引用的 action 排在前面（不提供真正的并行 DAG）。
   * @returns {Promise<Array>} 每个 step 的结果
   */
  async executeActions(actions, ctx, options = {}) {
    const requireApproval = Boolean(options.requireApproval);
    const failFast = Boolean(options.failFast);

    const steps = actions.slice().sort((a, b) => a.order - b.order);
    const results = [];
    const runIds = new Set();

    // 简单依赖处理：循环解析直到无未满足依赖或不再有进展
    const pending = steps.slice();
    while (pending.length > 0) {
      let progress = false;
      for (let i = 0; i < pending.length; i++) {
        const step = pending[i];
        const depsSatisfied = (step.dependsOn || []).every((dep) => runIds.has(dep));
        if (depsSatisfied) {
          pending.splice(i, 1);
          runIds.add(step.id);
          const r = await this._runStep(step, ctx, requireApproval);
          results.push({ ...step, ...r });
          progress = true;
          if (failFast && !r.ok) {
            // failFast：插入一条标记并终止
            results._interrupted = true;
            return results;
          }
          break;
        }
      }
      if (!progress) {
        // 有无法满足的依赖（未定义依赖已在 validate 拦截，此处保守处理为跳过）
        pending.shift();
      }
    }

    return results;
  }
}

module.exports = ActionExecutor;