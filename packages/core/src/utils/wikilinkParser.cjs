/**
 * WikiLink Parser — 解析 Markdown [[...]] 语法
 *
 * 支持:
 *   [[Target]]         → { target: 'Target', alias: null }
 *   [[Target|别名]]     → { target: 'Target', alias: '别名' }
 */
class WikiLinkParser {

  /**
   * 从文本中提取所有 [[...]] 引用
   * @param {string} text - Markdown 文本
   * @returns {Array<{target: string, alias: string|null}>}
   */
  static parse(text) {
    if (!text || typeof text !== 'string') return [];

    const links = [];
    // 匹配 [[target]] 或 [[target|alias]]
    const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      links.push({
        target: match[1].trim(),
        alias: match[2] ? match[2].trim() : null
      });
    }

    return links;
  }

  /**
   * 从文本中提取所有不重复的 target 名称
   * @param {string} text
   * @returns {string[]}
   */
  static parseTargets(text) {
    const links = WikiLinkParser.parse(text);
    const seen = new Set();
    const targets = [];
    for (const link of links) {
      if (!seen.has(link.target)) {
        seen.add(link.target);
        targets.push(link.target);
      }
    }
    return targets;
  }
}

module.exports = WikiLinkParser;
