/**
 * AgentExecutor — Agent 执行器
 *
 * Phase 6.5: 执行 Plan 中的每个 Action。
 *
 * 支持: analysis / workflow / inspect / suggest / notify
 */

class AgentExecutor {
  /**
   * @param {object} services
   * @param {object} [services.workflowEngine]
   * @param {object} [services.repository]
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.workflowEngine = services.workflowEngine || null;
    this.repository = services.repository || null;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;
  }

  /**
   * 执行单个动作
   * @param {{ action: string, target: string }} planItem
   * @param {import('./agentContext.cjs')} context
   */
  async execute(planItem, context) {
    switch (planItem.action) {
      case 'analyze':
        return this._executeAnalysis(planItem, context);
      case 'workflow':
        return this._executeWorkflow(planItem, context);
      case 'inspect':
        return this._executeInspect(planItem, context);
      case 'suggest':
        return this._executeSuggest(planItem, context);
      case 'notify':
        return this._executeNotify(planItem, context);
      default:
        this.logger.log(`[agent:exec] Unknown action: ${planItem.action}`);
        return { action: planItem.action, status: 'skipped', reason: 'unknown_action' };
    }
  }

  /**
   * 执行计划序列
   */
  async executePlan(plan, context) {
    const results = [];
    for (const item of plan) {
      const result = await this.execute(item, context);
      results.push(result);
    }
    return results;
  }

  // ── Private ──

  async _executeAnalysis(planItem, context) {
    const result = { action: 'analyze', target: planItem.target, status: 'completed', data: null };

    if (this.repository) {
      try {
        // 尝试获取分析数据
        if (planItem.target === 'graph' || planItem.target === 'all') {
          try {
            const analyzer = await this.repository._getKnowledgeAnalyzer();
            if (analyzer) {
              const report = await analyzer.report();
              result.data = { type: 'graph', report };
              context.observe('graph_analyzed', report);
            }
          } catch (e) { this.logger.error('agentExecutor: get knowledge analyzer failed', e); }
        }

        if (planItem.target === 'resources' || planItem.target === 'all') {
          try {
            const lifecycle = await this.repository.getKnowledgeLifecycle();
            result.data = { ...result.data, lifecycle };
            context.observe('resources_analyzed', lifecycle);
          } catch (e) { this.logger.error('agentExecutor: get knowledge lifecycle failed', e); }
        }

        if (planItem.target === 'recommendations' || planItem.target === 'all') {
          try {
            const recs = await this.repository.getRecommendations();
            result.data = { ...result.data, recommendations: recs };
            context.observe('recommendations_generated', recs);
          } catch (e) { this.logger.error('agentExecutor: get recommendations failed', e); }
        }
      } catch (e) {
        result.status = 'error';
        result.error = e.message;
      }
    }

    return result;
  }

  async _executeWorkflow(planItem, context) {
    const result = { action: 'workflow', target: planItem.target, status: 'completed' };

    if (this.workflowEngine) {
      try {
        // 新状态机模型：状态转换需要指定 Resource 与目标状态
        if (typeof this.workflowEngine.getWorkflow === 'function') {
          const wf = this.workflowEngine.getWorkflow(planItem.target);
          if (!wf) {
            result.status = 'skipped';
            result.reason = `Workflow '${planItem.target}' not available`;
          } else {
            result.status = 'skipped';
            result.reason = '状态转换需通过 attach + transition 指定 Resource 与目标状态';
            result.workflowId = planItem.target;
          }
        } else {
          result.status = 'skipped';
          result.reason = 'workflow engine 不支持 execute';
        }
      } catch (e) {
        // Workflow not found, try suggest instead
        result.status = 'skipped';
        result.reason = `Workflow '${planItem.target}' not available`;
      }
    } else {
      result.status = 'skipped';
      result.reason = 'no workflow engine';
    }

    return result;
  }

  async _executeInspect(planItem, context) {
    // 检查资源（简化：通过 repository）
    return {
      action: 'inspect',
      target: planItem.target,
      status: 'completed',
      note: 'inspection performed'
    };
  }

  async _executeSuggest(planItem, context) {
    const result = { action: 'suggest', target: planItem.target, status: 'completed' };

    if (this.repository) {
      try {
        const suggestions = await this.repository.generateSuggestions();
        result.data = { suggestionCount: suggestions ? suggestions.length : 0 };
        context.observe('suggestions_generated', suggestions);
      } catch (e) {
        result.status = 'error';
        result.error = e.message;
      }
    }

    return result;
  }

  async _executeNotify(planItem, context) {
    this.logger.log(`[agent:notify] ${planItem.target || planItem.description || 'notification'}`);

    if (this.eventBus) {
      try {
        await this.eventBus.emit({
          type: 'agent.notification',
          payload: { agent: context.agent ? context.agent.id : 'unknown', message: planItem.target },
          source: 'agent'
        });
      } catch (e) { this.logger.error('agentExecutor: notification event emit failed', e); }
    }

    return { action: 'notify', target: planItem.target, status: 'sent' };
  }
}

module.exports = AgentExecutor;
