/**
 * EvolutionState — 系统进化状态
 *
 * Phase 6.8: 描述当前 Knowledge OS 的进化位面。
 */

class EvolutionState {
  /**
   * @param {object} opts
   * @param {string} [opts.version]
   * @param {number} [opts.health] — 0-1
   * @param {number} [opts.complexity] — 0-1
   * @param {number} [opts.connectivity] — 0-1
   * @param {'seed'|'growing'|'advanced'|'mature'} [opts.maturity]
   * @param {object} [opts.snapshot]
   */
  constructor(opts = {}) {
    this.id = `evs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.version = opts.version || '1.0';
    this.health = typeof opts.health === 'number' ? opts.health : 0.5;
    this.complexity = typeof opts.complexity === 'number' ? opts.complexity : 0.5;
    this.connectivity = typeof opts.connectivity === 'number' ? opts.connectivity : 0.5;
    this.maturity = opts.maturity || 'growing';
    this.snapshot = opts.snapshot || {};
    this.timestamp = Date.now();
  }

  /**
   * 综合评分
   */
  get score() {
    return Math.round((this.health * 0.4 + this.connectivity * 0.3 + (1 - this.complexity * 0.1) * 0.3) * 100);
  }

  toJSON() {
    return {
      id: this.id,
      version: this.version,
      health: this.health,
      complexity: this.complexity,
      connectivity: this.connectivity,
      maturity: this.maturity,
      snapshot: this.snapshot,
      score: this.score,
      timestamp: this.timestamp
    };
  }

  static get maturities() {
    return ['seed', 'growing', 'advanced', 'mature'];
  }
}

module.exports = EvolutionState;
