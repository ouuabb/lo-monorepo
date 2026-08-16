/**
 * candidate.cjs —— wikilink 候选编排（纯逻辑，宿主注入数据源）
 *
 * 数据源依赖倒置：本包不 import 任何宿主/client/Monaco，
 * 只调用注入的 CandidateSource 接口：
 *   listRecent(limit)              → Promise<ResourceMeta[]>（最近创建，created DESC）
 *   search(query, limit)           → Promise<ResourceMeta[]>（Fuse.js 模糊搜索）
 *   ResourceMeta = { rid: string, name: string, type?: string }
 *
 * 编排规则：
 *   - token 为空 → listRecent
 *   - token 非空 → search(token)
 *   - 去重：按 name 精确去重（保留首次出现）
 *   - 排序：保持数据源返回顺序（listRecent 已 created DESC；search 已按评分）
 *   - 插入文本：`name]]`——触发语义为「光标已在 `[[` 之后」，插入后即形成完整 `[[name]]`；
 *     不返回替换 range（Monaco 按光标 word 推断，覆盖已输入 token）——返回带起始于
 *     `[[` 的 range 会被 Monaco 校验丢弃（range.start < 光标 word 起点）。
 */

/**
 * 生成补全候选
 * @param {object} opts
 * @param {string} opts.text — 文档全文
 * @param {number} opts.cursorOffset — 光标偏移
 * @param {import('../types').CandidateSource} opts.source — 注入的数据源
 * @param {number} [opts.limit] — 候选数量上限（默认 20）
 * @returns {Promise<null | { range: { start: number, end: number }, token: string, suggestions: Array<{ label, detail?, insertText }> }>}
 *   未处于触发上下文返回 null
 */
async function buildCandidates({ text, cursorOffset, source, limit = 20 }) {
  const trigger = require('./trigger.cjs').detectWikilinkTrigger(text, cursorOffset);
  if (!trigger) return null;
  if (!source || typeof source.listRecent !== 'function' || typeof source.search !== 'function') {
    throw new Error('[editor-assist] buildCandidates 需要注入 CandidateSource（listRecent/search）');
  }

  const token = trigger.token;
  const raw =
    token === ''
      ? await source.listRecent(limit)
      : await source.search(token, limit);

  const seen = new Set();
  const suggestions = [];
  for (const item of raw || []) {
    if (!item || typeof item.name !== 'string' || !item.name) continue;
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    suggestions.push({
      label: item.name,
      detail: item.type ? `type: ${item.type}` : undefined,
      insertText: `${item.name}]]`,
    });
    if (suggestions.length >= limit) break;
  }

  return {
    range: { start: trigger.startOffset, end: trigger.endOffset },
    token,
    suggestions,
  };
}

module.exports = { buildCandidates };
