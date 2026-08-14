/**
 * SelfImprovementLoop — 自我改进循环
 *
 * Phase 6.8: 核心 OODA 循环（Observe-Analyze-Detect-Plan-Execute-Validate-Remember-Repeat）。
 */

class SelfImprovementLoop {
  /**
   * @param {object} services
   * @param {import('./systemObserver.cjs')} services.observer
   * @param {import('./knowledgeHealthAnalyzer.cjs')} services.healthAnalyzer
   * @param {import('./evolutionDetector.cjs')} services.detector
   * @param {import('./evolutionStrategy.cjs')} services.strategy
   * @param {import('./evolutionPlanner.cjs')} services.planner
   * @param {import('./evolutionExecutor.cjs')} services.executor
   * @param {import('./evolutionValidator.cjs')} services.validator
   * @param {import('./evolutionMemory.cjs')} services.memory
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.observer = services.observer;
    this.healthAnalyzer = services.healthAnalyzer;
    this.detector = services.detector;
    this.strategy = services.strategy;
    this.planner = services.planner;
    this.executor = services.executor;
    this.validator = services.validator;
    this.memory = services.memory;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;
  }

  /**
   * 执行一次完整的自我改进循环
   */
  async run() {
    this.logger.log('[evolution] Self-improvement loop started');
    this._emit('evolution.started', {});

    // 1. Observe
    const snapshot = await this.observer.observe();
    const beforeState = require('./evolutionState.cjs');
    const before = new beforeState({
      health: snapshot.health,
      complexity: snapshot.complexity,
      connectivity: snapshot.connectivity,
      snapshot
    });
    this._emit('system.snapshot.created', { snapshot });

    // 2. Analyze
    const healthReport = await this.healthAnalyzer.analyze(snapshot);
    this._emit('knowledge.health.analyzed', { healthReport });

    // 3. Detect
    const opportunities = await this.detector.detect(snapshot, healthReport);
    this._emit('evolution.detected', { opportunities });

    if (opportunities.length === 0) {
      this.logger.log('[evolution] No improvements needed.');
      this._emit('evolution.completed', { actionCount: 0, improvement: 0 });
      return { evolved: false, reason: 'No improvements needed', before: before.toJSON() };
    }

    // 4. Strategize
    const strategies = this.strategy.generate(opportunities);

    // 5. Plan
    const plan = this.planner.plan(strategies);

    // 6. Execute
    const results = await this.executor.execute(plan);

    // 7. Observe again
    const afterSnapshot = await this.observer.observe();
    const after = new beforeState({
      health: afterSnapshot.health,
      complexity: afterSnapshot.complexity,
      connectivity: afterSnapshot.connectivity,
      snapshot: afterSnapshot
    });

    // 8. Validate
    const validation = this.validator.validate(before, after);
    this._emit(validation.success ? 'system.improved' : 'evolution.failed', { validation });

    // 9. Remember
    await this.memory.record({
      fromState: before,
      action: plan.goal,
      result: results,
      improvement: validation.improvement
    });

    this._emit('evolution.completed', { actionCount: results.length, improvement: validation.improvement });

    return {
      evolved: true,
      before: before.toJSON(),
      after: after.toJSON(),
      validation,
      results
    };
  }

  _emit(type, payload) {
    if (this.eventBus) {
      try { this.eventBus.emit({ type, payload, source: 'evolution' }); } catch (e) { this.logger.error('selfImprovementLoop: event emit failed', e); }
    }
  }
}

module.exports = SelfImprovementLoop;
