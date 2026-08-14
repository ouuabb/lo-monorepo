/**
 * CollaborationScheduler — 协作调度器
 *
 * Phase 6.6: 监听 EventBus 触发团队协作。
 */

class CollaborationScheduler {
  /**
   * @param {object} services
   * @param {import('./collaborationEngine.cjs')} services.engine
   * @param {import('../event/eventBus.cjs')} services.eventBus
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.engine = services.engine;
    this.eventBus = services.eventBus;
    this.logger = services.logger || console;
  }

  start() {
    if (this.eventBus && this.engine) {
      this.eventBus.on('*', async (payload, event) => {
        try {
          await this.engine.triggerByEvent(event.type, payload);
        } catch (e) { this.logger.error('collaborationScheduler: trigger by event failed', e); }
      });
    }
  }
}

module.exports = CollaborationScheduler;
