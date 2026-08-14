/**
 * RuntimeKernel — 运行时核心
 *
 * Phase 6.10: Knowledge OS 的 Runtime Kernel。
 * 负责启动/停止 Runtime，初始化所有子系统，管理生命周期。
 *
 * 启动流程:
 *   Load Repository → Load Plugin → Start EventBus → Start Workflow
 *   → Start Agent → Start Scheduler → Runtime Ready
 */

const RuntimeContext = require('./runtimeContext.cjs');
const RuntimeState = require('./runtimeState.cjs');
const RuntimeRegistry = require('./runtimeRegistry.cjs');
const RuntimeStore = require('./runtimeStore.cjs');
const RuntimeScheduler = require('./runtimeScheduler.cjs');
const RuntimeLoop = require('./runtimeLoop.cjs');
const RuntimeMonitor = require('./runtimeMonitor.cjs');
const ResourceRuntime = require('./resourceRuntime.cjs');
const KnowledgeRuntime = require('./knowledgeRuntime.cjs');
const RuntimeEvolution = require('./runtimeEvolution.cjs');

class RuntimeKernel {
  /**
   * @param {object} services
   * @param {object} services.db          — SQLite 数据库
   * @param {object} [services.eventBus]
   * @param {object} [services.workflowEngine]
   * @param {object} [services.agentEngine]
   * @param {object} [services.aiOS]
   * @param {object} [services.security]
   * @param {object} [services.plugins]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.db = services.db;
    this.logger = services.logger || console;

    // 核心组件
    this.state = new RuntimeState();
    this.registry = new RuntimeRegistry();
    this.store = new RuntimeStore(this.db);

    // 上下文
    this.context = new RuntimeContext({
      repository: null, // 运行时注入
      eventBus: services.eventBus || null,
      workflowEngine: services.workflowEngine || null,
      agentEngine: services.agentEngine || null,
      aiOS: services.aiOS || null,
      security: services.security || null,
      plugins: services.plugins || null,
      evolution: services.evolution || null
    });

    // 调度器与循环
    this.scheduler = new RuntimeScheduler(this.context);
    this.loop = new RuntimeLoop({
      state: this.state,
      context: this.context,
      registry: this.registry,
      scheduler: this.scheduler,
      logger: this.logger
    });

    // 领域运行时
    this.knowledgeRuntime = new KnowledgeRuntime({
      context: this.context,
      registry: this.registry,
      logger: this.logger
    });

    this.evolution = new RuntimeEvolution({
      context: this.context,
      registry: this.registry,
      logger: this.logger
    });

    // 监控
    this.monitor = new RuntimeMonitor({
      state: this.state,
      registry: this.registry,
      store: this.store,
      logger: this.logger
    });

    // Runtime 状态监听
    this.state.on('started', () => {
      this.scheduler.start();
      this.loop.start(1000);
    });

    this.state.on('stopped', () => {
      this.loop.stop();
      this.scheduler.stop();
    });
  }

  // ─── 生命周期 ─────────────────────────────────────────

  /**
   * 启动 Runtime
   */
  async start() {
    this.state.transition('starting');

    // 1. Load Repository（数据库就绪）
    this.logger.log('[runtime] Repository loaded');

    // 2. 初始化调度器任务
    this._setupDefaultTasks();

    // 3. Runtime Ready
    this.state.transition('running');
    this.logger.log('[runtime] Knowledge Runtime ready');

    return this;
  }

  /**
   * 停止 Runtime
   */
  async stop() {
    this.state.transition('stopping');
    this.loop.stop();
    this.scheduler.stop();
    this.state.transition('stopped');
    this.logger.log('[runtime] Knowledge Runtime stopped');
  }

  /**
   * 重启 Runtime
   */
  async restart() {
    await this.stop();
    await this.start();
  }

  /**
   * 暂停
   */
  pause() {
    if (this.state.isRunning) {
      this.state.transition('paused');
      this.loop.stop();
      this.scheduler.stop();
      this.logger.log('[runtime] Knowledge Runtime paused');
    }
  }

  /**
   * 恢复
   */
  resume() {
    if (this.state.isPaused) {
      this.state.transition('running');
      this.scheduler.start();
      this.loop.start();
      this.logger.log('[runtime] Knowledge Runtime resumed');
    }
  }

  // ─── 资源管理 ─────────────────────────────────────────

  /**
   * 将资源注册为运行时对象
   */
  promote(rid, type, metadata) {
    const resource = new ResourceRuntime({ rid, type, metadata, state: 'indexed' });
    this.registry.registerResource(rid, resource);
    return resource;
  }

  /**
   * 批量注册资源
   */
  promoteAll(resources) {
    const results = [];
    for (const r of resources) {
      results.push(this.promote(r.rid || r.id, r.type || 'unknown', r.metadata));
    }
    return results;
  }

  // ─── 状态查询 ─────────────────────────────────────────

  status() {
    return this.monitor.status();
  }

  snapshot() {
    return this.monitor.snapshot();
  }

  // ─── 内部 ─────────────────────────────────────────────

  _setupDefaultTasks() {
    // 定期快照
    this.scheduler.schedule('runtime:snapshot', () => {
      this.monitor.snapshot();
    }, { mode: 'interval', intervalMs: 30000 }); // 30 秒

    // 定期演化检测
    this.scheduler.schedule('runtime:evolution', async () => {
      const opportunities = await this.evolution.detect();
      if (opportunities.length > 0) {
        this.logger.log(`[runtime] ${opportunities.length} improvement opportunities detected`);
      }
    }, { mode: 'interval', intervalMs: 60000 }); // 60 秒
  }
}

module.exports = RuntimeKernel;
