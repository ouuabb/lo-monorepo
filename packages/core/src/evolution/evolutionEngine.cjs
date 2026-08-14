/**
 * EvolutionEngine — 进化引擎（总控制器）
 *
 * Phase 6.8: Knowledge OS 自演化系统的总入口。
 *
 * API:
 *   start() / observe() / diagnose() / evolve() / rollback() / history() / status()
 */

const EvolutionState = require('./evolutionState.cjs');
const SystemObserver = require('./systemObserver.cjs');
const KnowledgeHealthAnalyzer = require('./knowledgeHealthAnalyzer.cjs');
const EvolutionDetector = require('./evolutionDetector.cjs');
const EvolutionStrategy = require('./evolutionStrategy.cjs');
const EvolutionPlanner = require('./evolutionPlanner.cjs');
const EvolutionExecutor = require('./evolutionExecutor.cjs');
const EvolutionValidator = require('./evolutionValidator.cjs');
const EvolutionMemory = require('./evolutionMemory.cjs');
const SelfImprovementLoop = require('./selfImprovementLoop.cjs');

class EvolutionEngine {
  /**
   * @param {object} [services]
   * @param {object} [services.repository]
   * @param {object} [services.graphEngine]
   * @param {object} [services.agentEngine]
   * @param {object} [services.workflowEngine]
   * @param {object} [services.permissionManager]
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.logger = services.logger || console;

    this.memory = new EvolutionMemory(services.repository ? services.repository.db : null);

    this.observer = new SystemObserver({
      repository: services.repository,
      graphEngine: services.graphEngine,
      agentEngine: services.agentEngine,
      workflowEngine: services.workflowEngine,
      logger: this.logger
    });

    this.healthAnalyzer = new KnowledgeHealthAnalyzer({
      repository: services.repository,
      graphEngine: services.graphEngine
    });

    this.detector = new EvolutionDetector({
      repository: services.repository,
      agentEngine: services.agentEngine,
      workflowEngine: services.workflowEngine
    });

    this.strategy = new EvolutionStrategy();
    this.planner = new EvolutionPlanner();

    this.executor = new EvolutionExecutor({
      repository: services.repository,
      agentEngine: services.agentEngine,
      workflowEngine: services.workflowEngine,
      permissionManager: services.permissionManager
    });

    this.validator = new EvolutionValidator({ observer: this.observer });

    this.loop = new SelfImprovementLoop({
      observer: this.observer,
      healthAnalyzer: this.healthAnalyzer,
      detector: this.detector,
      strategy: this.strategy,
      planner: this.planner,
      executor: this.executor,
      validator: this.validator,
      memory: this.memory,
      eventBus: services.eventBus,
      logger: this.logger
    });

    this._running = false;
  }

  start() { this._running = true; }
  shutdown() { this._running = false; }
  get running() { return this._running; }

  /**
   * 观察系统
   */
  async observe() {
    return this.observer.observe();
  }

  /**
   * 诊断
   */
  async diagnose() {
    const snapshot = await this.observer.observe();
    const healthReport = await this.healthAnalyzer.analyze(snapshot);
    const opportunities = await this.detector.detect(snapshot, healthReport);
    const strategies = this.strategy.generate(opportunities);

    return {
      state: new EvolutionState({
        health: snapshot.health,
        complexity: snapshot.complexity,
        connectivity: snapshot.connectivity,
        snapshot
      }).toJSON(),
      health: healthReport,
      opportunities,
      strategies
    };
  }

  /**
   * 进化
   */
  async evolve() {
    if (!this._running) this.start();
    const result = await this.loop.run();
    return result;
  }

  /**
   * 回滚（简化：返回最近历史）
   */
  async rollback() {
    const last = await this.memory.last();
    if (last) {
      return { rolledBack: true, fromState: last.fromState };
    }
    return { rolledBack: false, reason: 'No evolution history' };
  }

  /**
   * 进化历史
   */
  async history(limit = 50) {
    return this.memory.history(limit);
  }

  /**
   * 状态
   */
  async status() {
    const snapshot = await this.observer.observe();
    const healthReport = await this.healthAnalyzer.analyze(snapshot);
    const evoState = new EvolutionState({
      health: snapshot.health,
      connectivity: snapshot.connectivity,
      complexity: snapshot.complexity,
      snapshot
    });

    return {
      state: evoState.toJSON(),
      health: healthReport,
      memory: await this.memory.stats()
    };
  }
}

module.exports = EvolutionEngine;
