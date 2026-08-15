class StringUtils {
  static slugify(text) {
    return text
      .trim()
      .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Resource name 统一规范化（018 §2）——所有 name 进出唯一入口
   *
   * 1. Unicode NFKC（全角→半角、兼容分解）
   * 2. lowercase
   * 3. 保留 \p{L}（含中文）、\p{N}、ASCII '_'、'-'
   * 4. 各种 dash（— – ― −）→ '-'
   * 5. 空白（含 NBSP/全角空格）与 '_' → '-'
   * 6. 连续 '-' 合并
   * 7. 删除其余标点、符号、emoji、控制字符
   * 8. 去除首尾 '-'
   * 9. 空结果 → 'untitled'
   * 10. 最大长度 120（截断）
   *
   * 不剥离日期前缀/随机后缀/扩展名（那是各创建入口的候选来源处理，非规范化职责）。
   * @param {string} input
   * @returns {string} canonical name
   */
  static normalizeResourceName(input) {
    if (typeof input !== 'string') input = '';
    let s = input
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
      .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!s) s = 'untitled';
    if (s.length > 120) s = s.slice(0, 120);
    return s;
  }

  static extractLinks(content) {
    const regex = /\[\[([^\]]+)\]\]/g;
    const matches = content.matchAll(regex);
    return Array.from(matches, m => m[1]);
  }
  
  static extractTodos(content) {
    const lines = content.split('\n');
    return lines
      .filter(line => /^-\s*\[[\sx]\]/.test(line))
      .map(line => ({
        text: line.replace(/^-\s*\[[\sx]\]\s*/, ''),
        done: line.includes('[x]')
      }));
  }
  
  static countWords(content) {
    const clean = content.replace(/[#*`_~]/g, '');
    return clean.split(/\s+/).filter(w => w.length > 0).length;
  }
}

module.exports = StringUtils;