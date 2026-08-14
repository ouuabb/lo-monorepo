/**
 * ResourceRuntime — 资源运行时
 *
 * Phase 6.10: 把静态 Resource 变成 Runtime Object（带生命周期、状态、行为、事件）。
 *
 * 生命周期: Created → Indexed → Linked → Analyzed → Evolved
 */

const LIFECYCLE = ['created', 'indexed', 'linked', 'analyzed', 'evolved'];

class ResourceRuntime {
  /**
   * @param {object} opts
   * @param {string} opts.rid       — 资源 RID
   * @param {string} [opts.type]    — 资源类型
   * @param {object} [opts.metadata]
   */
  constructor(opts = {}) {
    this.rid = opts.rid || '';
    this.type = opts.type || 'unknown';
    this.metadata = opts.metadata || {};

    this._state = opts.state || 'created';
    this._createdAt = opts.createdAt || Date.now();
    this._updatedAt = opts.updatedAt || Date.now();

    this._behaviors = new Map();
    this._events = [];
  }

  get state() { return this._state; }
  get id() { return this.rid; }

  /**
   * 状态转移
   */
  transition(to) {
    const fromIdx = LIFECYCLE.indexOf(this._state);
    const toIdx = LIFECYCLE.indexOf(to);
    if (toIdx < 0) throw new Error(`Invalid state: ${to}`);
    if (toIdx < fromIdx) return; // 不允许回退

    this._state = to;
    this._updatedAt = Date.now();
    this._events.push({ type: 'state_change', from: this._state, to, timestamp: Date.now() });
    return this;
  }

  /**
   * 注册行为
   */
  registerBehavior(name, fn) {
    this._behaviors.set(name, fn);
  }

  /**
   * 执行行为
   */
  async executeBehavior(name, ...args) {
    const fn = this._behaviors.get(name);
    if (!fn) throw new Error(`Unknown behavior: ${name}`);
    this._events.push({ type: 'behavior_executed', behavior: name, timestamp: Date.now() });
    return fn(this, ...args);
  }

  /**
   * 索引完成
   */
  indexed() {
    return this.transition('indexed');
  }

  /**
   * 关联建立
   */
  linked() {
    return this.transition('linked');
  }

  /**
   * 分析完成
   */
  analyzed() {
    return this.transition('analyzed');
  }

  /**
   * 演化完成
   */
  evolved() {
    return this.transition('evolved');
  }

  get recentEvents() {
    return this._events.slice(-20);
  }

  toJSON() {
    return {
      rid: this.rid,
      type: this.type,
      state: this._state,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      events: this._events.length,
      behaviors: Array.from(this._behaviors.keys())
    };
  }
}

module.exports = ResourceRuntime;
