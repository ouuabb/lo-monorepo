/**
 * RuntimeLoop — Knowledge OS 主循环
 *
 * Phase 6.10: 实现 Observe → Analyze → React → Execute → Learn → Repeat 循环。
 * 类似操作系统的 CPU Loop，这里是 Knowledge Loop。
 */

class RuntimeLoop {
  /**
   * @param {object} services
   * @param {import('./runtimeState.cjs')} services.state
   * @param {import('./runtimeContext.cjs')} services.context
   * @param {import('./runtimeRegistry.cjs')} services.registry
   * @param {import('./runtimeScheduler.cjs')} [services.scheduler]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.state = services.state;
    this.context = services.context;
    this.registry = services.registry;
    this.scheduler = services.scheduler || null;
    this.logger = services.logger || console;

    this._tickInterval = null;
    this._tickMs = 1000; // 默认 1 秒
  }

  /**
   * 启动主循环
   */
  start(tickMs) {
    if (tickMs) this._tickMs = tickMs;
    this.logger.log(`[runtime] Loop started (${this._tickMs}ms tick)`);
    this._tick();
    this._tickInterval = setInterval(() => this._tick(), this._tickMs);
  }

  /**
   * 停止主循环
   */
  stop() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    this.logger.log('[runtime] Loop stopped');
  }

  /**
   * 修改 tick 频率
   */
  setTickMs(ms) {
    this._tickMs = ms;
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = setInterval(() => this._tick(), this._tickMs);
    }
  }

  // ─── Tick ─────────────────────────────────────────────

  async _tick() {
    if (!this.state.isRunning) return;

    try {
      // 1. Observe — 收集系统状态
      await this._observe();

      // 2. Analyze — 分析变化
      const insights = await this._analyze();

      // 3. React — 决定响应
      const actions = await this._react(insights);

      // 4. Execute — 执行操作
      await this._execute(actions);

      // 5. Learn — 从结果中学习
      await this._learn(actions);

      this.state.incrementStats('eventsProcessed');
    } catch (e) {
      this.state.recordError(e);
    }
  }

  async _observe() {
    // 收集系统快照
    const snapshot = {
      timestamp: Date.now(),
      registry: this.registry ? this.registry.stats() : {},
      state: this.state ? this.state.toJSON() : {}
    };

    // 发布到 EventBus
    if (this.context && this.context.eventBus) {
      try {
        this.context.eventBus.emit({
          type: 'runtime.loop.observed',
          source: 'runtime',
          payload: snapshot
        });
      } catch {}
    }
  }

  async _analyze() {
    // 分析是否有待处理任务
    const insights = [];

    // 检查调度器
    if (this.scheduler) {
      const pending = this.scheduler.pendingCount();
      if (pending > 0) {
        insights.push({ type: 'pending_tasks', count: pending });
      }
    }

    // 检查 EventBus
    if (this.context && this.context.eventBus) {
      // 不实际消费事件，只是标记有待处理事件
      insights.push({ type: 'event_bus_active', timestamp: Date.now() });
    }

    return insights;
  }

  async _react(insights) {
    const actions = [];
    for (const insight of insights) {
      switch (insight.type) {
        case 'pending_tasks':
          actions.push({ type: 'process_tasks', count: insight.count });
          break;
        case 'event_bus_active':
          actions.push({ type: 'acknowledge_events', timestamp: insight.timestamp });
          break;
      }
    }
    return actions;
  }

  async _execute(actions) {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'process_tasks':
            if (this.scheduler) {
              await this.scheduler.tick();
            }
            break;
          case 'acknowledge_events':
            // 事件确认 — 无需额外操作
            break;
        }
        this.state.incrementStats('tasksExecuted');
      } catch (e) {
        this.state.recordError(e);
      }
    }
  }

  async _learn(actions) {
    // 记录执行结果用于学习
    if (this.context && this.context.eventBus && actions.length > 0) {
      try {
        this.context.eventBus.emit({
          type: 'runtime.loop.learned',
          source: 'runtime',
          payload: { actionsExecuted: actions.length, timestamp: Date.now() }
        });
      } catch {}
    }
  }
}

module.exports = RuntimeLoop;
