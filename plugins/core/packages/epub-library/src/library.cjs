/**
 * library — 书库 HTTP handler
 *
 *   ① GET /api/plugins/epub-library/        — 书库 HTML 页面
 *   ② GET /api/plugins/epub-library/books   — 查询所有 epub Resource（JSON）
 *
 * handler 签名（Express 风格，由 pluginHttp 适配）：
 *   async (req, res) => {}
 */

const path = require('path');
const fs = require('fs');

let htmlCache = null;

function getLibraryHtml() {
  if (htmlCache) return htmlCache;
  const htmlPath = path.join(__dirname, 'library.html');
  htmlCache = fs.readFileSync(htmlPath, 'utf8');
  return htmlCache;
}

/**
 * 创建 handler 集合
 */
function createHandlers(ctx) {
  return {
    /**
     * 书库 HTML 页面
     */
    async serveLibraryPage(req, res) {
      try {
        const html = getLibraryHtml();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    },

    /**
     * 查询所有 epub Resource
     * 返回前端渲染所需的书脊数据
     */
    async listBooks(req, res) {
      try {
        const all = await ctx.resources.list({ type: 'epub' });
        const books = all.map(r => ({
          rid: r.rid,
          name: r.name,
          title: (r.metadata && r.metadata.title) || r.name,
          author: (r.metadata && r.metadata.author) || '',
          publisher: (r.metadata && r.metadata.publisher) || '',
          language: (r.metadata && r.metadata.language) || '',
          spineCount: (r.metadata && r.metadata.spineCount) || 0,
          created: r.created,
          updated: r.updated,
        }));
        res.json({ books });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    },
  };
}

module.exports = { createHandlers };
