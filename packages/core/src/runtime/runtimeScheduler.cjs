/**
 * RuntimeScheduler — 统一调度器
 *
 * Phase 6.10: 整合 Workflow Scheduler 和 Agent Scheduler，
 * 形成统一的 Runtime 调度层。
 * 支持 startup / interval / cron / event 四种调度模式。
 */

class RuntimeScheduler {
  constructor(context = null) {
    this.context = context;
    this._tasks = new Map();
    this._running = false;
    this._timer = null;
  }

  // ─── 任务管理 ─────────────────────────────────────────

  /**
   * 注册定时任务
   */
  schedule(id, fn, options = {}) {
    this._tasks.set(id, {
      id,
      fn,
      mode: options.mode || 'interval',
      cronExpr: options.cron || null,
      intervalMs: options.intervalMs || 60000,
      lastRun: null,
      running: false
    });
  }

  /**
   * 取消任务
   */
  unschedule(id) {
    this._tasks.delete(id);
  }

  /**
   * 待处理任务数
   */
  pendingCount() {
    let count = 0;
    for (const [, task] of this._tasks) {
      if (!task.running) {
        const shouldRun = this._shouldRun(task);
        if (shouldRun) count++;
      }
    }
    return count;
  }

  // ─── 启动/停止 ────────────────────────────────────────

  start(tickMs = 1000) {
    if (this._running) return;
    this._running = true;
    this._timer = setInterval(() => this.tick(), tickMs);
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // ─── Tick ─────────────────────────────────────────────

  async tick() {
    if (!this._running) return;

    for (const [, task] of this._tasks) {
      if (task.running) continue;
      if (!this._shouldRun(task)) continue;

      task.running = true;
      task.lastRun = Date.now();

      try {
        await task.fn(this.context);
      } catch (e) {
        // 任务错误不中断调度器
      } finally {
        task.running = false;
      }
    }
  }

  _shouldRun(task) {
    if (task.mode === 'event') return false; // 事件驱动的不在此调度

    const now = Date.now();
    const lastRun = task.lastRun || 0;

    if (task.mode === 'interval' || task.mode === 'startup') {
      return (now - lastRun) >= task.intervalMs;
    }

    if (task.mode === 'cron' && task.cronExpr) {
      // 同一分钟内已运行过则不再触发（防止 tick 重复触发）
      if (lastRun && now - lastRun < 60000) return false;
      return this._matchCron(task.cronExpr, task.lastRun);
    }

    return false;
  }

  _matchCron(expr, lastRun) {
    try {
      const fields = this._parseCron(expr);
      if (!fields) return false;

      const now = new Date();

      const minute = now.getMinutes();
      const hour = now.getHours();
      const day = now.getDate();
      const month = now.getMonth() + 1;
      const dow = now.getDay(); // 0=周日

      return (
        this._cronMatch(fields[0], minute) &&
        this._cronMatch(fields[1], hour) &&
        this._cronMatch(fields[2], day) &&
        this._cronMatch(fields[3], month) &&
        this._cronMatch(fields[4], dow)
      );
    } catch (e) {
      // 表达式非法时安全降级为不触发
      return false;
    }
  }

  /**
   * 解析五段式 cron 表达式: 分 时 日 月 周
   * 支持: 星号 / 星号斜杠n / n,n,n / n-m
   * @returns {Array<Array<number>>|null}
   */
  _parseCron(expr) {
    if (typeof expr !== 'string') return null;
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const ranges = [0, 59, 0, 23, 1, 31, 1, 12, 0, 6];
    const out = [];
    for (let i = 0; i < 5; i++) {
      const min = ranges[i * 2];
      const max = ranges[i * 2 + 1];
      out.push(this._cronField(parts[i], min, max));
      if (!out[i]) return null;
    }
    return out;
  }

  _cronField(field, min, max) {
    const values = new Set();
    for (const part of field.split(',')) {
      const m = /^(\*|\d+)(?:\/(\d+))?$/.exec(part.trim());
      if (m) {
        if (m[1] === '*') {
          const step = m[2] ? parseInt(m[2], 10) : 1;
          if (step <= 0) return null;
          for (let v = min; v <= max; v += step) values.add(v);
        } else {
          const v = parseInt(m[1], 10);
          const step = m[2] ? parseInt(m[2], 10) : null;
          if (v < min || v > max || (step !== null && step <= 0)) return null;
          if (step === null) {
            // 无步进 = 单值
            values.add(v);
          } else {
            // 有步进 = 从 v 开始按步进填充
            for (let cur = v; cur <= max; cur += step) values.add(cur);
          }
        }
      } else {
        const range = /^(\d+)-(\d+)(?:\/(\d+))?$/.exec(part.trim());
        if (range) {
          const lo = parseInt(range[1], 10);
          const hi = parseInt(range[2], 10);
          const step = range[3] ? parseInt(range[3], 10) : 1;
          if (lo > hi || lo < min || hi > max || step <= 0) return null;
          for (let cur = lo; cur <= hi; cur += step) values.add(cur);
        } else {
          return null;
        }
      }
    }
    return values;
  }

  _cronMatch(fieldValues, value) {
    return fieldValues.has(value);
  }
}

module.exports = RuntimeScheduler;
