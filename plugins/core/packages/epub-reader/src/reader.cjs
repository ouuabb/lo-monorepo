/**
 * reader — Web 阅读器 HTTP handler
 *
 * 通过 commands 扩展点注册到 lo serve，提供：
 *   ① GET  /api/plugins/epub-reader/reader    — 阅读器 HTML 页面（?rid=xxx）
 *   ② GET  /api/plugins/epub-reader/book      — 书籍元数据 + 章节目录（?rid=xxx）
 *   ③ GET  /api/plugins/epub-reader/chapter   — 章节内容（?rid=xxx&index=0）
 *   ④ GET  /api/plugins/epub-reader/state     — 阅读状态（?rid=xxx）
 *   ⑤ PUT  /api/plugins/epub-reader/state     — 保存阅读状态（body: {rid, location, progress}）
 *   ⑥ GET  /api/plugins/epub-reader/highlights — 高亮列表（?rid=xxx）
 *   ⑦ POST /api/plugins/epub-reader/highlights — 添加高亮（body: {rid, location, text, style?}）
 *   ⑧ DELETE /api/plugins/epub-reader/highlights — 删除高亮（body: {rid, id}）
 *   ⑨ GET  /api/plugins/epub-reader/bookmarks — 书签列表（?rid=xxx）
 *   ⑩ POST /api/plugins/epub-reader/bookmarks — 添加书签（body: {rid, location, title?}）
 *   ⑪ DELETE /api/plugins/epub-reader/bookmarks — 删除书签（body: {rid, id}）
 *   ⑫ POST /api/plugins/epub-reader/notes     — 创建笔记 Resource + source-of 关系
 *
 * handler 签名（Express 风格，由 pluginHttp 适配）：
 *   async (req, res) => {}
 *   req.body — 已解析 JSON body
 *   req.url  — 原始 URL（含 query string）
 *   res.json(data) / res.status(code).json(data) / res.setHeader(name, value)
 */

const path = require('path');
const fs = require('fs');
const url = require('url');
const { parseEpub } = require('./epubParser.cjs');
const { createStore } = require('./store.cjs');

/** HTML 页面内容缓存（读取一次后常驻内存） */
let htmlCache = null;

/**
 * 读取阅读器 HTML 页面内容
 */
function getReaderHtml() {
  if (htmlCache) return htmlCache;
  const htmlPath = path.join(__dirname, 'reader.html');
  htmlCache = fs.readFileSync(htmlPath, 'utf8');
  return htmlCache;
}

/**
 * 解析查询参数
 */
function parseQuery(req) {
  return url.parse(req.url, true).query || {};
}

/**
 * 从 context 获取数据目录绝对路径
 * dataDir 配置为相对路径时，拼接到 lo 仓库根目录
 */
function getDataDir(ctx) {
  const configDataDir = ctx.config('dataDir') || '.lo/plugins/epub-reader';
  return path.isAbsolute(configDataDir)
    ? configDataDir
    : path.join(ctx.repoPath, configDataDir);
}

/**
 * 获取或创建 store 实例（缓存到 context 上，避免每次请求重建）
 */
function getStore(ctx) {
  if (!ctx._epubStore) {
    ctx._epubStore = createStore(getDataDir(ctx));
  }
  return ctx._epubStore;
}

/**
 * 获取 EPUB Resource 并校验类型
 */
async function getEpubResource(ctx, rid) {
  if (!rid) throw new Error('缺少 rid 参数');
  const resource = await ctx.resources.getByRid(rid);
  if (!resource) throw new Error(`资源不存在: ${rid}`);
  if (resource.type !== 'epub') throw new Error(`资源类型不是 epub: ${resource.type}`);
  return resource;
}

/**
 * 获取 EPUB 文件绝对路径
 */
function getEpubFilePath(ctx, resource) {
  const filePath = resource.path || resource.filePath || '';
  if (!filePath) throw new Error('资源缺少文件路径');
  return path.isAbsolute(filePath) ? filePath : path.join(ctx.repoPath, filePath);
}

/** EPUB 解析结果缓存：rid → book（避免每次章节请求都重新解析） */
const bookCache = new Map();

/**
 * 获取解析后的 EPUB（带缓存）
 */
async function getBook(ctx, rid) {
  if (bookCache.has(rid)) return bookCache.get(rid);
  const resource = await getEpubResource(ctx, rid);
  const filePath = getEpubFilePath(ctx, resource);
  const book = parseEpub(filePath);
  bookCache.set(rid, book);
  return book;
}

/**
 * 无 rid 时的用法提示页
 */
function renderUsagePage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EPUB Reader</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #16213e; border-radius: 12px; padding: 40px; max-width: 480px; text-align: center; }
    h1 { color: #00d9ff; font-size: 22px; margin-bottom: 16px; }
    p { color: #888; font-size: 14px; line-height: 1.8; margin-bottom: 8px; }
    code { color: #00d9ff; background: #0f3460; padding: 2px 8px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>EPUB Reader</h1>
    <p>需要指定书籍 rid 参数</p>
    <p>用法：<code>?rid=&lt;resource_id&gt;</code></p>
    <p style="margin-top:16px">导入书籍：<code>lo import &lt;file.epub&gt;</code></p>
    <p>查看书籍：<code>lo ext epub:info &lt;rid&gt;</code></p>
  </div>
</body>
</html>`;
}

// ── handler 工厂：每个端点返回一个 (req, res) => Promise ──

/**
 * 创建绑定到指定 context 的 handler 集合
 * @param {PluginContext} ctx
 * @returns {object} { serveReaderPage, getBookInfo, getChapter, ... }
 */
function createHandlers(ctx) {
  return {
    // ① 阅读器 HTML 页面
    async serveReaderPage(req, res) {
      const q = parseQuery(req);
      if (!q.rid) {
        const html = renderUsagePage();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(html);
        return;
      }
      const html = getReaderHtml();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      // 直接 end HTML（res.json 不适用）
      // pluginHttp 的 res adapter 没有直接 end 原始内容的方法，
      // 但 setHeader 后 res 仍是原生 ServerResponse，可调用 end
      res.end(html);
    },

    // ② 书籍元数据 + 章节目录
    async getBookInfo(req, res) {
      try {
        const q = parseQuery(req);
        const book = await getBook(ctx, q.rid);
        res.json({
          rid: q.rid,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          language: book.language,
          chapterCount: book.chapters.length,
          chapters: book.chapters.map(c => ({
            index: c.index,
            title: c.title,
            charCount: c.charCount,
          })),
        });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },

    // ③ 章节内容
    async getChapter(req, res) {
      try {
        const q = parseQuery(req);
        const book = await getBook(ctx, q.rid);
        const index = parseInt(q.index, 10);
        if (isNaN(index) || index < 0 || index >= book.chapters.length) {
          return res.status(400).json({ error: `章节索引无效: ${q.index}` });
        }
        const chapter = book.chapters[index];
        res.json({
          index: chapter.index,
          title: chapter.title,
          content: chapter.content,
          charCount: chapter.charCount,
        });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },

    // ④ 获取阅读状态
    async getState(req, res) {
      try {
        const q = parseQuery(req);
        const store = getStore(ctx);
        const state = await store.getReadingState(q.rid);
        res.json({ rid: q.rid, state: state || null });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },

    // ⑤ 保存阅读状态
    async saveState(req, res) {
      try {
        const { rid, location, progress } = req.body || {};
        if (!rid || !location) {
          return res.status(400).json({ error: '缺少 rid 或 location' });
        }
        const store = getStore(ctx);
        await store.saveReadingState(rid, location, progress || 0);
        res.json({ ok: true });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },

    // ⑥ 高亮列表
    async getHighlights(req, res) {
      try {
        const q = parseQuery(req);
        const store = getStore(ctx);
        const list = await store.getHighlights(q.rid);
        res.json({ rid: q.rid, highlights: list });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },

    // ⑦ 添加高亮
    async addHighlight(req, res) {
      try {
        const { rid, location, text, style } = req.body || {};
        if (!rid || !location || !text) {
          return res.status(400).json({ error: '缺少 rid/location/text' });
        }
        const store = getStore(ctx);
        const entry = await store.addHighlight(rid, { location, text, style });
        res.json({ ok: true, highlight: entry });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },

    // ⑧ 删除高亮
    async removeHighlight(req, res) {
      try {
        const { rid, id } = req.body || {};
        if (!rid || !id) {
          return res.status(400).json({ error: '缺少 rid 或 id' });
        }
        const store = getStore(ctx);
        const removed = await store.removeHighlight(rid, id);
        res.json({ ok: removed });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },

    // ⑨ 书签列表
    async getBookmarks(req, res) {
      try {
        const q = parseQuery(req);
        const store = getStore(ctx);
        const list = await store.getBookmarks(q.rid);
        res.json({ rid: q.rid, bookmarks: list });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },

    // ⑩ 添加书签
    async addBookmark(req, res) {
      try {
        const { rid, location, title } = req.body || {};
        if (!rid || !location) {
          return res.status(400).json({ error: '缺少 rid 或 location' });
        }
        const store = getStore(ctx);
        const entry = await store.addBookmark(rid, { location, title });
        res.json({ ok: true, bookmark: entry });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },

    // ⑪ 删除书签
    async removeBookmark(req, res) {
      try {
        const { rid, id } = req.body || {};
        if (!rid || !id) {
          return res.status(400).json({ error: '缺少 rid 或 id' });
        }
        const store = getStore(ctx);
        const removed = await store.removeBookmark(rid, id);
        res.json({ ok: removed });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },

    // ⑫ 创建或更新笔记 Resource + source-of 关系
    // 同一 EPUB + 同一 location 只有一条笔记：已存在则更新 content/quote，不存在才新建
    async createNote(req, res) {
      try {
        const { rid, content, quote, location } = req.body || {};
        if (!rid || !content) {
          return res.status(400).json({ error: '缺少 rid 或 content' });
        }
        // 确认 EPUB 资源存在
        const epubResource = await getEpubResource(ctx, rid);

        const bookTitle = (epubResource.metadata && epubResource.metadata.title) || epubResource.name || rid;
        const loc = location || '';

        // 查询该 EPUB 的所有 source-of 关系，按 location 匹配已有笔记
        const relations = await ctx.relations.getByFromRidAndType(rid, 'source-of');
        const existing = relations.find(r =>
          r.metadata && r.metadata.location === loc
        );

        if (existing) {
          // 同位置已有笔记 → 更新 content 和 quote
          const noteRid = existing.to_rid;
          const noteResource = await ctx.resources.getByRid(noteRid);
          if (!noteResource) {
            return res.status(404).json({ error: '笔记资源不存在（可能已删除）' });
          }
          const updatedMeta = {
            ...(noteResource.metadata || {}),
            content: content,
            quote: quote || (noteResource.metadata && noteResource.metadata.quote) || '',
          };
          await ctx.resources.update(noteRid, { metadata: updatedMeta });
          // 同步更新 relation 的 quote
          await ctx.relations.update(existing.id, {
            metadata: { location: loc, quote: quote || '' },
          });
          const updated = await ctx.resources.getByRid(noteRid);
          res.json({ ok: true, note: updated, updated: true });
        } else {
          // 新笔记
          const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
          const noteResource = await ctx.resources.create({
            type: 'note',
            name: `笔记: ${bookTitle} (${ts})`,
            metadata: {
              title: bookTitle,
              sourceResource: rid,
              location: loc,
              quote: quote || '',
              content: content,
            },
          });

          const noteRid = noteResource.rid || noteResource.id;
          if (noteRid && ctx.relations) {
            await ctx.relations.create({
              from_rid: rid,
              to_rid: noteRid,
              type: 'source-of',
              metadata: { location: loc, quote: quote || '' },
            });
          }
          res.json({ ok: true, note: noteResource, created: true });
        }
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },

    // ⑬ 查询指定位置的笔记（前端选中同一段文字时回显已有笔记）
    async getNote(req, res) {
      try {
        const q = parseQuery(req);
        const { rid, location } = q;
        if (!rid || !location) {
          return res.status(400).json({ error: '缺少 rid 或 location' });
        }
        const relations = await ctx.relations.getByFromRidAndType(rid, 'source-of');
        const existing = relations.find(r =>
          r.metadata && r.metadata.location === location
        );
        if (!existing) {
          return res.json({ note: null });
        }
        const note = await ctx.resources.getByRid(existing.to_rid);
        res.json({ note });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },
  };
}

/**
 * 清理 EPUB 解析缓存（测试用）
 */
function clearBookCache() {
  bookCache.clear();
}

module.exports = { createHandlers, clearBookCache, getReaderHtml, parseQuery };
