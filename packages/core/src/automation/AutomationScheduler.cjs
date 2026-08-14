/**
 * AutomationScheduler — Automation 调度器
 *
 * 管理哪些 Automation 需要运行：
 *   - schedule 触发：通过 RuntimeScheduler 注册定时任务（daily/weekly/monthly/cron）
 *   - event 触发：订阅 EventBus，命中则触发 AutomationEngine
 *
 * 关系：
 *   RuntimeScheduler（什么时候运行，基础设施）
 *       ↓
 *   AutomationScheduler（管理哪些 Automation 需要运行）
 *       ↓
 *   AutomationEngine（怎么执行）
 */

class AutomationScheduler {
  /**
   * @param {object} services
   * @param {import('./AutomationRegistry.cjs')} services.registry
   * @param {import('./AutomationEngine.cjs')} services.engine
   * @param {import('./trigger/TriggerResolver.cjs')} services.triggerResolver
   * @param {object} [services.scheduler]  — RuntimeScheduler 实例
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.registry = services.registry;
    this.engine = services.engine;
    this.triggerResolver = services.triggerResolver;
    this.scheduler = services.scheduler || null;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;
    this._eventHandler = null;
  }

  /**
   * 启动调度器
   * - 为所有启用的 schedule automation 注册 RuntimeScheduler 定时任务
   * - 订阅 EventBus 处理 event automation
   */
  start() {
    this._stopEventSubscription();

    // 注册定时任务
    if (this.scheduler) {
      for (const a of this.registry.list()) {
        if (a.status !== 'active') continue;
        this._scheduleAutomation(a);
      }
    }

    // 订阅事件
    if (this.eventBus) {
      this._eventHandler = async (payload, event) => {
        try {
          await this.engine.triggerByEvent(event);
        } catch (e) {
          this.logger.error(`[automation:sched] event trigger failed: ${e.message}`);
        }
      };
      this.eventBus.on('*', this._eventHandler);
    }
  }

  /**
   * 为单个 automation 注册调度任务
   */
  _scheduleAutomation(a) {
    if (!this.scheduler) return;
    const schedule = a.trigger && a.trigger.schedule;
    if (!this.triggerResolver.isSchedule(a.trigger)) return;

    const cfg = this.triggerResolver.toSchedule(schedule);
    if (!cfg) return;

    const id = `automation:${a.id}`;
    this.scheduler.schedule(id, async () => {
      try {
        await this.engine.onSchedule(a.id);
      } catch (e) {
        this.logger.error(`[automation:sched] '${a.id}' 执行失败: ${e.message}`);
      }
    }, cfg);
  }

  /**
   * 启用/停用后重载调度
   */
  reload() {
    this.stop();
    this.start();
  }

  stop() {
    this._stopEventSubscription();
    // 定时任务由 RuntimeScheduler 管理，此处不持有
  }

  _stopEventSubscription() {
    if (this.eventBus && this._eventHandler) {
      this.eventBus.off('*', this._eventHandler);
      this._eventHandler = null;
    }
  }
}

module.exports = AutomationScheduler;