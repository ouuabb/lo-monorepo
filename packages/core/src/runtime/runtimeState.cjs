/**
 * RuntimeState — 运行时状态管理
 *
 * Phase 6.10: 管理 Knowledge Runtime 的生命周期状态。
 * created → starting → running → paused → stopping → stopped
 */

const EventEmitter = require("events");

const VALID_TRANSITIONS = {
  created: ["starting"],
  starting: ["running", "stopping"],
  running: ["paused", "stopping"],
  paused: ["running", "stopping"],
  stopping: ["stopped"],
  stopped: ["starting"],
};

class RuntimeState extends EventEmitter {
  constructor() {
    super();
    this._status = "created";
    this._startedAt = null;
    this._stoppedAt = null;
    this._pausedAt = null;
    this._errors = [];
    this._stats = {
      eventsProcessed: 0,
      tasksExecuted: 0,
      agentsTriggered: 0,
      workflowsRun: 0,
    };
  }

  get status() {
    return this._status;
  }
  get isRunning() {
    return this._status === "running";
  }
  get isStopped() {
    return this._status === "stopped";
  }
  get isPaused() {
    return this._status === "paused";
  }
  get uptime() {
    if (!this._startedAt) return 0;
    const end = this._stoppedAt || Date.now();
    return end - this._startedAt;
  }
  get errors() {
    return [...this._errors];
  }
  get stats() {
    return { ...this._stats };
  }

  /**
   * 状态转换
   */
  transition(to) {
    const from = this._status;
    if (!VALID_TRANSITIONS[from] || !VALID_TRANSITIONS[from].includes(to)) {
      throw new Error(`Invalid state transition: ${from} → ${to}`);
    }

    this._status = to;
    const now = Date.now();

    switch (to) {
      case "starting":
        this._startedAt = now;
        break;
      case "running":
        break;
      case "paused":
        this._pausedAt = now;
        break;
      case "stopping":
        break;
      case "stopped":
        this._stoppedAt = now;
        break;
    }

    this.emit("stateChange", { from, to, timestamp: now });
    this.emit(to, { from, timestamp: now });
    return this;
  }

  /**
   * 记录错误
   */
  recordError(error) {
    this._errors.push({
      message: error.message || String(error),
      timestamp: Date.now(),
    });
    if (this._errors.length > 100) this._errors.shift();
  }

  /**
   * 更新统计
   */
  incrementStats(key, count = 1) {
    if (this._stats[key] !== undefined) {
      this._stats[key] += count;
    }
  }

  toJSON() {
    return {
      status: this._status,
      startedAt: this._startedAt,
      stoppedAt: this._stoppedAt,
      uptime: this.uptime,
      errors: this._errors.length,
      stats: this._stats,
    };
  }
}

module.exports = RuntimeState;
