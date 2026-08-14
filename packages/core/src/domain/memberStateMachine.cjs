/**
 * MemberStateMachine — 容器成员状态机
 *
 * 形式化定义 container_members.status 的合法状态转换。
 * 所有写入 status 的入口都必须经过 validate() 校验。
 *
 * 状态定义:
 *   indexed   — 普通索引成员
 *   promoted  — 已提升为独立 Resource
 *   deleted   — 已软删除
 *
 * 注意: force_ignore 是正交的同步策略标志，不改变 status，不在此处处理。
 *
 * Phase 4.5
 */

// 允许的状态值
const VALID_STATUSES = ['indexed', 'promoted', 'deleted'];

// 状态转换表: oldStatus → { action → [允许的 targetStatus] }
const TRANSITIONS = {
  indexed: {
    promote: ['promoted'],
    remove: ['deleted']
  },
  promoted: {
    demote: ['indexed'],
    remove: ['deleted']
  },
  deleted: {
    restore: ['indexed', 'promoted']
  }
};

/**
 * 验证状态转换是否合法
 *
 * @param {string} oldStatus - 当前状态
 * @param {string} action   - 操作名称 (promote / demote / remove / restore)
 * @param {string} [targetStatus] - 目标状态（不指定则从 TRANSITIONS 推断第一个允许值）
 * @throws {Error} 若转换非法
 * @returns {string} 若合法，返回目标状态
 */
function validate(oldStatus, action, targetStatus) {
  if (!VALID_STATUSES.includes(oldStatus)) {
    throw new Error(`未知状态: ${oldStatus}`);
  }

  const allowed = TRANSITIONS[oldStatus];
  if (!allowed) {
    throw new Error(`当前状态不支持操作: ${oldStatus} → ${action}`);
  }

  const targets = allowed[action];
  if (!targets) {
    throw new Error(`非法的状态转换: ${oldStatus} → ${action}`);
  }

  if (targetStatus) {
    if (!targets.includes(targetStatus)) {
      throw new Error(`非法的状态转换: ${oldStatus} → ${targetStatus} (action: ${action})`);
    }
    return targetStatus;
  }

  return targets[0];
}

/**
 * 检查状态值是否合法
 * @param {string} status
 * @returns {boolean}
 */
function isValidStatus(status) {
  return VALID_STATUSES.includes(status);
}

module.exports = { validate, isValidStatus, VALID_STATUSES };
