/**
 * lifecycle.cjs —— 插件生命周期状态定义
 *
 * SDK 定义状态枚举与合法转移；Host 按表驱动编排。
 */

/**
 * 插件生命周期状态
 */
const LIFECYCLE_STATES = [
  'installed', // 安装完成，文件就位
  'loaded', // 已加载（manifest 校验 + 实例化）
  'activated', // 已激活（activate(ctx) 完成）
  'enabled', // 已启用（开始工作）
  'disabled', // 已禁用
  'deactivated', // 已停用激活
  'disposed', // 已销毁
];

/**
 * 合法状态转移表（from → Set<to>）
 * 由 Host 的 PluginManager 驱动。
 */
const LIFECYCLE_TRANSITIONS = {
  installed: new Set(['loaded']),
  loaded: new Set(['activated', 'disabled', 'disposed']),
  activated: new Set(['enabled', 'deactivated', 'disabled', 'disposed']),
  enabled: new Set(['disabled', 'deactivated', 'disposed']),
  disabled: new Set(['enabled', 'activated', 'deactivated', 'disposed']),
  deactivated: new Set(['activated', 'loaded', 'disabled', 'disposed']),
  disposed: new Set(),
};

/** 合法状态集合（用于校验） */
const LIFECYCLE_STATE_SET = new Set(LIFECYCLE_STATES);

/**
 * 校验状态转移是否合法
 * @param {string} from
 * @param {string} to
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function canTransition(from, to) {
  if (!LIFECYCLE_STATE_SET.has(from)) {
    return { ok: false, error: `未知生命周期状态: ${from}` };
  }
  if (!LIFECYCLE_STATE_SET.has(to)) {
    return { ok: false, error: `未知生命周期状态: ${to}` };
  }
  const allowed = LIFECYCLE_TRANSITIONS[from];
  if (allowed.has(to)) {
    return { ok: true };
  }
  return { ok: false, error: `非法状态转移: ${from} → ${to}` };
}

module.exports = {
  LIFECYCLE_STATES,
  LIFECYCLE_TRANSITIONS,
  LIFECYCLE_STATE_SET,
  canTransition,
};
