/**
 * trigger.cjs —— wikilink `[[` 补全触发检测（纯文本，无 Monaco 依赖）
 *
 * 语义（与 Core wikilinkParser 一致）：`[[Target]]` / `[[Target|别名]]`
 * 触发条件：光标位置存在一个「未闭合的 `[[`」——即光标前最近的 `[[`
 * 之后、光标之前没有出现 `]]`；且 `[[` 与光标之间不含 `|`（别名场景，
 * alias completion 为后续独立增强，不在此触发）。
 */
const TRIGGER_OPEN = '[[';
const TRIGGER_CLOSE = ']]';
const ALIAS_SEP = '|';

/**
 * 检测光标位置是否处于 wikilink 补全触发上下文
 * @param {string} text — 文档全文
 * @param {number} cursorOffset — 光标偏移（0..text.length）
 * @returns {null | { active: true, token: string, startOffset: number, endOffset: number }}
 *   - active: 应触发补全
 *   - token: `[[` 与光标之间已输入的查询文本（可为空串）
 *   - startOffset: `[[` 起点（替换范围起点）
 *   - endOffset: 光标位置（替换范围终点）
 */
function detectWikilinkTrigger(text, cursorOffset) {
  if (typeof text !== 'string' || typeof cursorOffset !== 'number') return null;
  if (cursorOffset < 0) return null;
  const head = text.slice(0, cursorOffset);

  const openIdx = head.lastIndexOf(TRIGGER_OPEN);
  if (openIdx === -1) return null;

  // 已闭合（[[ 与光标之间出现 ]]）→ 不触发
  const closeIdx = head.indexOf(TRIGGER_CLOSE, openIdx + TRIGGER_OPEN.length);
  if (closeIdx !== -1 && closeIdx < cursorOffset) return null;

  const tokenRaw = head.slice(openIdx + TRIGGER_OPEN.length);
  // 别名场景（含 |）→ 不触发（alias completion 属后续增强）
  if (tokenRaw.includes(ALIAS_SEP)) return null;

  return {
    active: true,
    token: tokenRaw,
    startOffset: openIdx,
    endOffset: cursorOffset,
  };
}

module.exports = { detectWikilinkTrigger, TRIGGER_OPEN, TRIGGER_CLOSE, ALIAS_SEP };
