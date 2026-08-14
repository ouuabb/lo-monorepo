/**
 * MarkdownParser — Markdown 内容引用统一解析器（核心能力）
 *
 * lo 系统核心能力，不属于任何插件。聚合两个子解析器的结果，对外提供唯一入口：
 *   1. WikiLink: [[target]] 或 [[target|alias]]
 *   2. Embed:    ![alt](path) 或 <img src="path">
 *
 * 直接被 Repository 调用，在资源创建/同步时自动解析 markdown 关系。
 * 支持扩展：未来可添加 link_definition、footnote 等引用类型。
 */

const WikiLinkParser = require('./wikilinkParser.cjs');
const MarkdownImageParser = require('./markdownImageParser.cjs');

class MarkdownParser {

  /**
   * 解析 Markdown 文本，提取所有引用
   * @param {string} content - Markdown 原始文本
   * @returns {{
   *   wikilinks: Array<{target: string, alias: string|null}>,
   *   embeds:    Array<{type: string, target_path: string, alt: string, title?: string}>
   * }}
   */
  static parse(content) {
    if (!content || typeof content !== 'string') {
      return { wikilinks: [], embeds: [] };
    }

    const wikilinks = WikiLinkParser.parse(content);
    const embeds = MarkdownImageParser.parse(content);

    return { wikilinks, embeds };
  }

  /**
   * 仅提取 wikilink target 列表（兼容旧 API）
   * @param {string} content
   * @returns {string[]}
   */
  static parseWikiTargets(content) {
    return WikiLinkParser.parseTargets(content);
  }

  /**
   * 仅提取图片路径列表
   * @param {string} content
   * @returns {string[]}
   */
  static parseImagePaths(content) {
    return MarkdownImageParser.parsePaths(content);
  }
}

module.exports = MarkdownParser;