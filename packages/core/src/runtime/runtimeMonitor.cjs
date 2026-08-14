/**
 * RuntimeMonitor — 运行监控
 *
 * Phase 6.10: 收集 Runtime 运行指标，提供 status() 查询。
 */

class RuntimeMonitor {
  /**
   * @param {object} services
   * @param {import('./runtimeState.cjs')} services.state
   * @param {import('./runtimeRegistry.cjs')} services.registry
   * @param {import('./runtimeStore.cjs')} [services.store]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.state = services.state;
    this.registry = services.registry;
    this.store = services.store || null;
    this.logger = services.logger || console;

    this._snapshots = [];
    this._maxSnapshots = 60; // 保留最近 60 次快照
  }

  /**
   * 获取当前状态
   */
  status() {
    const registryStats = this.registry ? this.registry.stats() : {};
    const stateInfo = this.state ? this.state.toJSON() : {};

    return {
      status: stateInfo.status || 'unknown',
      uptime: stateInfo.uptime || 0,
      startedAt: stateInfo.startedAt,
      resources: registryStats.resources || 0,
      agents: registryStats.agents || 0,
      workflows: registryStats.workflows || 0,
      plugins: registryStats.plugins || 0,
      events: stateInfo.stats ? stateInfo.stats.eventsProcessed : 0,
      tasksExecuted: stateInfo.stats ? stateInfo.stats.tasksExecuted : 0,
      errors: stateInfo.errors || 0,
      timestamp: Date.now()
    };
  }

  /**
   * 创建快照
   */
  snapshot() {
    const snap = this.status();
    this._snapshots.push(snap);
    if (this._snapshots.length > this._maxSnapshots) {
      this._snapshots.shift();
    }
    return snap;
  }

  /**
   * 获取历史快照
   */
  history(count = 10) {
    return this._snapshots.slice(-count);
  }

  /**
   * 获取趋势分析
   */
  trends() {
    if (this._snapshots.length < 2) return null;

    const first = this._snapshots[0];
    const last = this._snapshots[this._snapshots.length - 1];
    const duration = (last.timestamp - first.timestamp) / 1000; // 秒

    return {
      duration,
      resourceDelta: last.resources - first.resources,
      eventsDelta: last.events - first.events,
      tasksDelta: last.tasksExecuted - first.tasksExecuted,
      errorsDelta: last.errors - first.errors
    };
  }

  /**
   * 持久化快照
   */
  async persist() {
    if (!this.store) return;
    const snap = this.snapshot();
    await this.store.saveState('monitor:lastSnapshot', snap);
  }
}

module.exports = RuntimeMonitor;
