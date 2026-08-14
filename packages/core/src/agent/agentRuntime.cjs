/**
 * AgentRuntime — Agent 运行时
 *
 * Phase 6.5: 管理单个 Agent 的执行生命周期。
 *
 * 流程:
 *   initialize → observe → think → plan → execute → record
 */

const AgentContext = require('./agentContext.cjs');
const AgentState = require('./agentState.cjs');
const AgentPlanner = require('./agentPlanner.cjs');

class AgentRuntime {
  /**
   * @param {object} services
   * @param {import('./agent.cjs')} services.agent
   * @param {import('./agentExecutor.cjs')} services.executor
   * @param {import('./agentMemory.cjs')} [services.memory]
   * @param {import('./agentStore.cjs')} [services.store]
   * @param {object} [services.repository]
   * @param {object} [services.workflowEngine]
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.agent = services.agent;
    this.executor = services.executor;
    this.memory = services.memory || null;
    this.store = services.store || null;
    this.repository = services.repository || null;
    this.workflowEngine = services.workflowEngine || null;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;

    this.state = new AgentState(services.agent ? services.agent.status : 'created');
    this.planner = new AgentPlanner();
  }

  /**
   * 初始化 Agent
   */
  async initialize() {
    const result = this.state.transition('initialized');
    if (!result.success) throw new Error(result.error);

    this.agent.status = 'initialized';
    this._updateAgent();

    if (this.memory) {
      await this.memory.save({
        agentId: this.agent.id,
        type: 'decision',
        content: { decision: 'initialize', reason: 'Agent activated' }
      });
    }

    return this.agent;
  }

  /**
   * 执行 Agent
   * @param {object} options
   * @param {object} [options.event] — 触发事件
   * @param {string} [options.goal] — 执行目标
   * @param {any} [options.input]
   */
  async run(options = {}) {
    const result = this.state.transition('running');
    if (!result.success && this.state.current !== 'running') {
      if (this.state.current !== 'initialized') {
        await this.initialize();
      }
    }

    // 1. 创建上下文
    const context = new AgentContext({
      agent: this.agent,
      event: options.event || null,
      memory: this.memory ? await this.memory.getRecent(this.agent.id, 5) : [],
      workflowEngine: this.workflowEngine,
      repository: this.repository,
      logger: this.logger
    });

    // 2. Observe — 观察
    if (options.event) {
      context.observe('event_triggered', {
        type: options.event.type || options.event,
        payload: options.event.payload || null
      });
    }

    // 3. Think — 决定目标
    const goal = options.goal || this._inferGoal(context);
    context.decide('select_goal', `Goal: ${goal}`);

    // 4. Plan — 生成计划
    const plan = this.planner.plan({ goal, context });
    context.decide('generate_plan', `Plan: ${plan.length} steps`);

    // Emit event
    if (this.eventBus) {
      try {
        await this.eventBus.emit({
          type: 'agent.started',
          payload: { agentId: this.agent.id, goal, planSteps: plan.length },
          source: 'agent'
        });
      } catch (e) { this.logger.error('agentRuntime: agent started event emit failed', e); }
    }

    // 5. Execute — 执行
    let executionResult;
    try {
      const results = await this.executor.executePlan(plan, context);
      executionResult = { success: true, results, steps: results.length };
    } catch (e) {
      executionResult = { success: false, error: e.message };
      context.decide('execution_error', e.message);
    }

    // 6. Record — 记录
    if (this.memory) {
      await this.memory.save({
        agentId: this.agent.id,
        type: 'action',
        content: { plan: plan.map(p => p.action), result: executionResult }
      });
    }

    // 保存执行记录
    if (this.store) {
      await this.store.saveRun({
        id: `arun_${Date.now().toString(36)}`,
        agentId: this.agent.id,
        status: executionResult.success ? 'completed' : 'failed',
        input: { goal, event: options.event },
        output: executionResult,
        createdAt: Date.now()
      });
    }

    // 发布完成事件
    if (this.eventBus) {
      try {
        await this.eventBus.emit({
          type: 'agent.finished',
          payload: { agentId: this.agent.id, success: executionResult.success },
          source: 'agent'
        });
      } catch (e) { this.logger.error('agentRuntime: agent finished event emit failed', e); }
    }

    // 回 waiting 状态
    this.state.transition('waiting');

    return {
      agentId: this.agent.id,
      goal,
      plan: plan.map(p => p.action),
      result: executionResult,
      context: context.toJSON()
    };
  }

  /**
   * 停止 Agent
   */
  async stop() {
    this.state.transition('disabled');
    this.agent.status = 'disabled';
    this._updateAgent();

    if (this.memory) {
      await this.memory.save({
        agentId: this.agent.id,
        type: 'decision',
        content: { decision: 'stop', reason: 'Agent disabled' }
      });
    }
  }

  /**
   * 根据上下文推理目标
   */
  _inferGoal(context) {
    // 有事件触发
    if (context.event) {
      const eventType = context.event.type || context.event;
      if (eventType === 'resource.created') return 'auto_tag';
      if (eventType === 'resource.updated') return 'review_graph';
      if (eventType.includes('sync')) return 'review_graph';
    }

    // 默认
    if (this.agent.type === 'maintenance') return 'cleanup_forgotten';
    if (this.agent.type === 'research') return 'expand_knowledge';
    if (this.agent.type === 'assistant') return 'auto_tag';

    return 'generic_analyze';
  }

  _updateAgent() {
    this.agent.updatedAt = Date.now();
  }
}

module.exports = AgentRuntime;
