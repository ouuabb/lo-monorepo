class StringUtils {
  static slugify(text) {
    return text
      .trim()
      .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
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