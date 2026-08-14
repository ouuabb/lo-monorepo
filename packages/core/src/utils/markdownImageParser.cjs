/**
 * MarkdownImageParser — Markdown 图片引用解析器（核心能力）
 *
 * lo 系统核心能力，不属于任何插件。解析 Markdown 内容中的图片引用，支持：
 *   ![alt](path/to/image.png)            → { type: 'embed', target_path, alt }
 *   ![alt](path/to/image.png "title")    → { type: 'embed', target_path, alt, title }
 *   <img src="path/to/image.png" alt=""> → { type: 'embed', target_path, alt }
 *   <img src="./img.png">                → { type: 'embed', target_path, alt: '' }
 *
 * 不处理：
 *   远程 URL（http/https）
 *   base64 内嵌图片
 *   data: 协议
 */

class MarkdownImageParser {
  /**
   * 从 Markdown 文本中提取所有图片引用
   * @param {string} markdown - Markdown 文本
   * @returns {Array<{type: string, target_path: string, alt: string, title?: string, raw: string}>}
   */
  static parse(markdown) {
    if (!markdown || typeof markdown !== "string") return [];

    const results = [];
    const seen = new Set();

    // 1. 标准 Markdown 图片语法: ![alt](path "title")
    //    分步匹配：先匹配 ![alt]，再验证 ( 开头且排除远程/内嵌
    const mdImageRegex = /!\[([^\]]*)\]/g;
    let match;

    while ((match = mdImageRegex.exec(markdown)) !== null) {
      const alt = match[1];
      const afterBracketStart = match.index + match[0].length;
      const afterBracket = markdown.slice(afterBracketStart);

      // 验证以 ( 开头，排除远程 URL 和 data 协议
      if (!afterBracket || afterBracket[0] !== "(") continue;
      // 检查括号内内容是否为远程 URL / data 协议 / HTML 标签
      const innerContent = afterBracket.substring(1).replace(/^\s+/, "");
      if (/^(https?:|data:|<)/.test(innerContent)) continue;

      // 使用括号计数法处理路径中嵌套的括号，如 state(1).png
      const { urlPart, rest } = this._extractUrlPart(afterBracket);
      if (!urlPart) continue;

      // 解析 "url" 或 "url title" 格式
      // Markdown 规范: <url> 或 <url> <optional title>
      const titleMatch = urlPart.match(/^(.*?)(?:\s+"([^"]*)")?$/);
      const targetPath = titleMatch ? titleMatch[1] : urlPart;
      const title = titleMatch && titleMatch[2] ? titleMatch[2] : undefined;
      const key = targetPath;

      if (seen.has(key)) continue;
      seen.add(key);

      const rawLen = afterBracket.length - rest.length;
      results.push({
        type: "embed",
        target_path: targetPath,
        alt,
        ...(title ? { title } : {}),
        raw: match[0] + afterBracket.substring(0, rawLen),
      });

      // 推进正则位置跳过已匹配的内容
      mdImageRegex.lastIndex = afterBracketStart + rawLen;
    }

    // 2. HTML <img> 标签
    const htmlImgRegex = /<img\s+[^>]*?src=["']([^"']+)["'][^>]*?\/?\s*>/gi;
    let htmlMatch;

    while ((htmlMatch = htmlImgRegex.exec(markdown)) !== null) {
      const src = htmlMatch[1];
      // 排除远程 URL 和 data 协议
      if (/^https?:/i.test(src) || /^data:/i.test(src)) continue;

      // 提取 alt 属性
      const altMatch = htmlMatch[0].match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : "";

      const key = src;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        type: "embed",
        target_path: src,
        alt,
        raw: htmlMatch[0],
      });
    }

    return results;
  }

  /**
   * 使用括号计数法提取 (...) 中的 url 部分
   * 处理路径中嵌套的括号，如 state(1).png
   * @param {string} afterBracket - '(' 后面的文本
   * @returns {{urlPart: string, rest: string}|null} urlPart 含括号内容，rest 为剩余文本
   */
  static _extractUrlPart(afterBracket) {
    if (!afterBracket || afterBracket[0] !== "(") return null;

    let depth = 0;
    for (let i = 0; i < afterBracket.length; i++) {
      if (afterBracket[i] === "(") {
        depth++;
      } else if (afterBracket[i] === ")") {
        depth--;
        if (depth === 0) {
          return {
            urlPart: afterBracket.substring(1, i),
            rest: afterBracket.substring(i + 1),
          };
        }
      }
    }
    return null;
  }

  /**
   * 从 Markdown 文本中提取所有不重复的本地图片路径
   * @param {string} markdown
   * @returns {string[]}
   */
  static parsePaths(markdown) {
    const refs = MarkdownImageParser.parse(markdown);
    const seen = new Set();
    const paths = [];
    for (const ref of refs) {
      if (!seen.has(ref.target_path)) {
        seen.add(ref.target_path);
        paths.push(ref.target_path);
      }
    }
    return paths;
  }
}

module.exports = MarkdownImageParser;
