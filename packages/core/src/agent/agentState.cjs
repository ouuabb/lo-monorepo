/**
 * AgentState — Agent 状态机
 *
 * Phase 6.5: 管理 Agent 生命周期状态。
 *
 * 状态转换:
 *   created → initialized → running → waiting ⇄ paused
 *                                    ↓         ↓
 *                                disabled   disabled
 */

const STATES = ['created', 'initialized', 'running', 'waiting', 'paused', 'disabled'];

const TRANSITIONS = {
  created:     ['initialized'],
  initialized: ['running', 'disabled'],
  running:     ['waiting', 'paused', 'disabled'],
  waiting:     ['running', 'paused', 'disabled'],
  paused:      ['running', 'disabled'],
  disabled:    ['created']
};

class AgentState {
  constructor(initial = 'created') {
    this._state = initial;
  }

  get current() {
    return this._state;
  }

  /**
   * 尝试转换
   * @returns {{ success: boolean, from: string, to: string, error?: string }}
   */
  transition(to) {
    const from = this._state;
    const allowed = TRANSITIONS[from] || [];

    if (!allowed.includes(to)) {
      return {
        success: false,
        from,
        to,
        error: `Cannot transition from '${from}' to '${to}'. Allowed: ${allowed.join(', ')}`
      };
    }

    this._state = to;
    return { success: true, from, to };
  }

  /**
   * 是否在活跃状态
   */
  get isActive() {
    return ['initialized', 'running', 'waiting'].includes(this._state);
  }

  static get states() {
    return STATES;
  }

  toJSON() {
    return this._state;
  }
}

module.exports = AgentState;
