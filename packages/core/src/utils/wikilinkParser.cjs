/**
 * WikiLink Parser — 解析 Markdown [[rid]] 语法（rid-based 模型）
 *
 * 唯一语法（开发期模型切换，旧 [[name]] / [[name|alias]] 已废弃）：
 *   [[rid]]         → { targetRid: 'res_xxx', alias: null }
 *   [[rid|别名]]     → { targetRid: 'res_xxx', alias: '别名' }
 *
 * Parser 只负责语法与 RID 形态校验（复用 utils/rid.cjs 的 RidUtils.validate，
 * 不重复实现校验规则），不访问数据库。
 * targetRid 必须是合法 RID；无 alias 时 alias 为 null（不写入 resource.name）。
 */
const RidUtils = require('./rid.cjs');

class WikiLinkParser {

  /**
   * 从文本中提取所有 [[...]] 引用（仅合法 RID 的 wikilink）
   * @param {string} text - Markdown 文本
   * @returns {Array<{targetRid: string, alias: string|null}>}
   */
  static parse(text) {
    if (!text || typeof text !== 'string') return [];

    const links = [];
    // 匹配 [[token]] 或 [[token|alias]]；token 随后经 RidUtils.validate 校验
    const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const token = match[1].trim();
      // 仅合法 RID 才构成 wikilink（旧 name 语法不再解析）
      if (!RidUtils.validate(token)) continue;
      links.push({
        targetRid: token,
        alias: match[2] ? match[2].trim() : null,
      });
    }

    return links;
  }

  /**
   * 从文本中提取所有不重复的 targetRid 列表
   * @param {string} text
   * @returns {string[]}
   */
  static parseTargets(text) {
    const links = WikiLinkParser.parse(text);
    const seen = new Set();
    const targets = [];
    for (const link of links) {
      if (!seen.has(link.targetRid)) {
        seen.add(link.targetRid);
        targets.push(link.targetRid);
      }
    }
    return targets;
  }
}

module.exports = WikiLinkParser;
