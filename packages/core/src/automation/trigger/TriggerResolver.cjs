/**
 * TriggerResolver — Trigger 解析器
 *
 * 将 Automation Definition 中的 trigger 归一化为可执行结构：
 *   - schedule: 转成 RuntimeScheduler 可用的 cron / interval
 *   - event:    判定某个事件是否命中（type + match 过滤）
 *   - external: CLI / 插件 / Agent 显式触发（无需解析）
 *
 * 核心层不包含 intent 触发：意图匹配归属 Agent 层，
 * Agent 通过 AutomationEngine.executeAutomation(id, context) 接入。
 */

const SCHEDULE_CADENCES = new Set(['daily', 'weekly', 'monthly']);

class TriggerResolver {
  /**
   * 解析 schedule 触发，返回 RuntimeScheduler 可用的调度配置
   * @param {object} schedule — { cadence, time?, cron? }
   * @returns {{ mode: string, cron?: string, intervalMs?: number }|null}
   */
  toSchedule(schedule) {
    if (!schedule) return null;

    // 显式 cron 优先
    if (schedule.cron && typeof schedule.cron === 'string') {
      return { mode: 'cron', cron: schedule.cron };
    }

    const cadence = schedule.cadence;
    if (SCHEDULE_CADENCES.has(cadence)) {
      const cron = this._cadenceToCron(cadence, schedule.time);
      if (cron) return { mode: 'cron', cron };
    }

    return null;
  }

  _cadenceToCron(cadence, time = '00:00') {
    const parts = String(time).split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1] || '0', 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    if (cadence === 'daily') return `${minute} ${hour} * * *`;
    if (cadence === 'weekly') return `${minute} ${hour} * * 1`;
    if (cadence === 'monthly') return `${minute} ${hour} 1 * *`;
    return null;
  }

  /**
   * 判断事件是否命中 event trigger
   * @param {object} trigger — { type: 'event', event: '...', match: {...} }
   * @param {object} event    — { type, payload }
   * @returns {boolean}
   */
  matchesEvent(trigger, event) {
    if (!trigger || trigger.type !== 'event') return false;
    if (!event || typeof event.type !== 'string') return false;

    // trigger.event 支持字符串（'resource.created'）或对象（{ type, ... }）
    const expected = trigger.event && typeof trigger.event === 'object'
      ? trigger.event.type
      : trigger.event;
    if (expected !== undefined && expected !== null && expected !== event.type) return false;

    const match = trigger.match || {};
    const payload = event.payload || {};

    // workflow 过滤
    if (match.workflow !== undefined) {
      const actual = payload.workflowId || payload.workflow || (payload.workflowName || '');
      if (String(match.workflow) !== String(actual)) return false;
    }
    // resourceType 过滤（payload.resource.type 或 payload.type）
    if (match.resourceType !== undefined) {
      const actual = (payload.resource && payload.resource.type) || payload.type;
      if (String(match.resourceType) !== String(actual)) return false;
    }
    // 目标状态过滤（workflow transition 的 to）
    if (match.to !== undefined) {
      if (String(match.to) !== String(payload.to || '')) return false;
    }

    return true;
  }

  /**
   * 是否为 schedule 触发
   */
  isSchedule(trigger) {
    return Boolean(trigger && trigger.type === 'schedule');
  }

  /**
   * 是否为 event 触发
   */
  isEvent(trigger) {
    return Boolean(trigger && trigger.type === 'event');
  }

  /**
   * 是否为 external 触发
   */
  isExternal(trigger) {
    return Boolean(trigger && trigger.type === 'external');
  }
}

module.exports = TriggerResolver;