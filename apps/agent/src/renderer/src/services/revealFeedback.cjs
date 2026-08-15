/**
 * revealFeedback.cjs —— revealResource 结果 → 用户提示文案（A 功能）
 *
 * 契约（LoCoreService.revealResource）：
 *   { ok: true } | { ok: false, reason: string, message: string }
 * reason 复用 Core Resolver 语义（virtual / file-missing / source-missing /
 * external-unavailable），其余失败走通用提示。renderer 不接触路径。
 */
const REVEAL_REASONS = {
  virtual: '虚拟资源无本地文件，无法在资源管理器中打开',
  'file-missing': '文件缺失，无法在资源管理器中打开',
  'source-missing': '内容源缺失，无法在资源管理器中打开',
  'external-unavailable': '外部文件不可用，无法在资源管理器中打开',
};

function revealFeedback(res) {
  if (res && res.ok) return '已在系统资源管理器中打开';
  if (res && res.reason && REVEAL_REASONS[res.reason]) {
    return REVEAL_REASONS[res.reason];
  }
  return (res && res.message) || '打开失败';
}

module.exports = { revealFeedback, REVEAL_REASONS };
