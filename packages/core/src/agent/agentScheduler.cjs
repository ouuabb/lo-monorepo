/**
 * AgentScheduler — Agent 调度器
 *
 * Phase 6.5: 管理定时触发的 Agent。
 *
 * 触发: daily / weekly / cron / event
 */

class AgentScheduler {
  /**
   * @param {object} services
   * @param {import('./agentEngine.cjs')} services.agentEngine
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.agentEngine = services.agentEngine;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;
    this._timers = new Map();
  }

  /**
   * 启动调度器（监听 EventBus）
   */
  start() {
    // 通过 EventBus 处理事件触发的 agent
    if (this.eventBus && this.agentEngine) {
      this.eventBus.on('*', async (payload, event) => {
        try {
          await this.agentEngine.trigger(event);
        } catch (e) { this.logger.error('agentScheduler: trigger agent by event failed', e); }
      });
    }
  }

  /**
   * 调度定时 Agent
   * @param {import('./agent.cjs')} agent
   */
  schedule(agent) {
    const trigger = agent.scheduleTrigger;
    if (!trigger) return;

    const { cron, time } = trigger.schedule || trigger;

    if (cron === 'daily') {
      const [h, m] = (time || '01:00').split(':').map(Number);
      const now = new Date();
      const target = new Date(now);
      target.setHours(h || 1, m || 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      const delay = target.getTime() - now.getTime();

      const timer = setInterval(async () => {
        try {
          this.logger.log(`[agent:sched] Running: ${agent.id}`);
          await this.agentEngine.execute(agent.id, { goal: 'cleanup_forgotten' });
        } catch (e) {
          this.logger.error(`[agent:sched] Agent '${agent.id}' failed: ${e.message}`);
        }
      }, delay);

      this._timers.set(agent.id, timer);
    }
  }

  stop() {
    for (const timer of this._timers.values()) {
      clearInterval(timer);
    }
    this._timers.clear();
  }
}

module.exports = AgentScheduler;
