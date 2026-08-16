/**
 * @lo/editor-assist —— 编辑器辅助纯逻辑包
 *
 * wikilink `[[` 补全的触发检测与候选编排。零运行时依赖：
 * 不依赖 Monaco / Electron / preload / @lo/client / 宿主环境。
 * 宿主负责：注入 CandidateSource 数据源 + Monaco 适配层注册。
 */
const { detectWikilinkTrigger, TRIGGER_OPEN, TRIGGER_CLOSE, ALIAS_SEP } = require('./trigger.cjs');
const { buildCandidates } = require('./candidate.cjs');

module.exports = {
  detectWikilinkTrigger,
  buildCandidates,
  TRIGGER_OPEN,
  TRIGGER_CLOSE,
  ALIAS_SEP,
};
