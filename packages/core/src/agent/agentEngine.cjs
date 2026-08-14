/**
 * AgentEngine — Agent 引擎
 *
 * Phase 6.5: 核心入口。
 *
 * API:
 *   register(agent)
 *   start(id)
 *   stop(id)
 *   execute(id, input)
 *   trigger(event)
 */

const AgentRuntime = require('./agentRuntime.cjs');
const AgentExecutor = require('./agentExecutor.cjs');
const AgentMemory = require('./agentMemory.cjs');

class AgentEngine {
  /**
   * @param {object} services
   * @param {import('./agentRegistry.cjs')} services.registry
   * @param {import('./agentStore.cjs')} services.store
   * @param {object} [services.repository]
   * @param {object} [services.workflowEngine]
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.registry = services.registry;
    this.store = services.store;
    this.repository = services.repository || null;
    this.workflowEngine = services.workflowEngine || null;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;

    this.memory = new AgentMemory(this.store.db || {});
    this._executor = new AgentExecutor({
      workflowEngine: this.workflowEngine,
      repository: this.repository,
      eventBus: this.eventBus,
      logger: this.logger
    });

    /** @type {Map<string, AgentRuntime>} */
    this._runtimes = new Map();

    // 监听事件
    if (this.eventBus) {
      this.eventBus.on('*', this._onEvent.bind(this));
    }
  }

  /**
   * 注册 Agent
   */
  async register(agent) {
    this.registry.register(agent);
    await this.store.saveAgent(agent);
  }

  /**
   * 启动 Agent
   */
  async start(id) {
    const agent = this.registry.get(id);
    if (!agent) throw new Error(`Agent '${id}' not found`);

    const runtime = new AgentRuntime({
      agent,
      executor: this._executor,
      memory: this.memory,
      store: this.store,
      repository: this.repository,
      workflowEngine: this.workflowEngine,
      eventBus: this.eventBus,
      logger: this.logger
    });

    await runtime.initialize();
    this._runtimes.set(id, runtime);

    agent.status = 'initialized';
    await this.store.saveAgent(agent);

    this.logger.log(`[agent:engine] Agent '${id}' started`);
    return agent;
  }

  /**
   * 停止 Agent
   */
  async stop(id) {
    const runtime = this._runtimes.get(id);
    if (runtime) {
      await runtime.stop();
      this._runtimes.delete(id);
    }

    const agent = this.registry.get(id);
    if (agent) {
      agent.status = 'disabled';
      await this.store.saveAgent(agent);
    }

    this.logger.log(`[agent:engine] Agent '${id}' stopped`);
  }

  /**
   * 执行 Agent
   */
  async execute(id, options = {}) {
    const agent = this.registry.get(id);
    if (!agent) throw new Error(`Agent '${id}' not found`);

    let runtime = this._runtimes.get(id);
    if (!runtime) {
      runtime = new AgentRuntime({
        agent,
        executor: this._executor,
        memory: this.memory,
        store: this.store,
        repository: this.repository,
        workflowEngine: this.workflowEngine,
        eventBus: this.eventBus,
        logger: this.logger
      });
      this._runtimes.set(id, runtime);
    }

    return runtime.run(options);
  }

  /**
   * 事件触发
   */
  async trigger(event) {
    const eventType = event.type || event;
    const agents = this.registry.list();

    for (const info of agents) {
      // 仅对 running/initialized/waiting 的 agent 触发
      if (!['initialized', 'running', 'waiting'].includes(info.status)) continue;

      const agent = this.registry.get(info.id);
      if (!agent) continue;

      if (agent.matchesEvent(eventType)) {
        try {
          await this.execute(info.id, {
            event,
            goal: this._eventToGoal(eventType)
          });
        } catch (e) {
          this.logger.error(`[agent:engine] Triggered agent '${info.id}' failed: ${e.message}`);
        }
      }
    }
  }

  /**
   * 列出 Agents
   */
  listAgents() {
    return this.registry.list();
  }

  /**
   * 获取 Agent 运行记录
   */
  async getRuns(agentId, limit) {
    return this.store.listRuns(agentId, limit);
  }

  /**
   * 获取 Agent Memory
   */
  async getMemory(agentId, limit) {
    return this.memory.getRecent(agentId, limit);
  }

  // ── Private ──

  _onEvent(payload, event) {
    this.trigger(event).catch(e => {
      this.logger.error(`[agent:engine] Event handler error: ${e.message}`);
    });
  }

  _eventToGoal(eventType) {
    const map = {
      'resource.created': 'auto_tag',
      'resource.updated': 'review_graph',
      'relation.created': 'review_graph',
      'relation.deleted': 'review_graph',
      'sync.completed': 'review_graph',
      'ai.suggestion.created': 'expand_knowledge',
      'knowledge.analyzed': 'cleanup_forgotten'
    };
    return map[eventType] || 'generic_analyze';
  }
}

module.exports = AgentEngine;
