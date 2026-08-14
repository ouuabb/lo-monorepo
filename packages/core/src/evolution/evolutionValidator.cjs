/**
 * EvolutionValidator — 进化验证器
 *
 * Phase 6.8: 对比进化前后的健康度，判断改进是否有效。
 */

class EvolutionValidator {
  /**
   * @param {object} [services]
   * @param {import('./systemObserver.cjs')} [services.observer]
   */
  constructor(services = {}) {
    this.observer = services.observer || null;
  }

  /**
   * 验证进化结果
   * @param {import('./evolutionState.cjs')} before
   * @param {import('./evolutionState.cjs')} after
   */
  validate(before, after) {
    const healthBefore = before ? before.health : 0;
    const healthAfter = after ? after.health : 0;
    const improvement = Math.max(0, healthAfter - healthBefore);

    return {
      success: healthAfter >= healthBefore,
      improvement: Math.round(improvement * 100) / 100,
      beforeScore: healthBefore,
      afterScore: healthAfter,
      delta: Math.round((healthAfter - healthBefore) * 100) / 100
    };
  }
}

module.exports = EvolutionValidator;
