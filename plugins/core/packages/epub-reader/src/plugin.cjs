/**
 * EpubReaderPlugin — EPUB 阅读插件主类
 *
 * 注册的扩展点：
 *   ① importers — lo import *.epub 时解析 EPUB 并创建 epub Resource
 *   ② commands  — lo ext epub:read/note/highlight/bookmark 等（CLI）
 *   ③ commands  — HTTP 端点（lo serve 挂载 Web 阅读器）
 *
 * Web 阅读器端点（commands 扩展点，结构为 { method, path, handler, description }）：
 *   GET    /api/plugins/epub-reader/reader      — 阅读器 HTML 页面
 *   GET    /api/plugins/epub-reader/book        — 书籍元数据 + 章节目录
 *   GET    /api/plugins/epub-reader/chapter     — 章节内容
 *   GET    /api/plugins/epub-reader/state       — 阅读状态
 *   PUT    /api/plugins/epub-reader/state       — 保存阅读状态
 *   GET    /api/plugins/epub-reader/highlights  — 高亮列表
 *   POST   /api/plugins/epub-reader/highlights  — 添加高亮
 *   DELETE /api/plugins/epub-reader/highlights  — 删除高亮
 *   GET    /api/plugins/epub-reader/bookmarks   — 书签列表
 *   POST   /api/plugins/epub-reader/bookmarks   — 添加书签
 *   DELETE /api/plugins/epub-reader/bookmarks   — 删除书签
 *   POST   /api/plugins/epub-reader/notes       — 创建/更新笔记（同位置自动更新）
 *   GET    /api/plugins/epub-reader/notes       — 查询指定位置的笔记
 *
 * 不继承 ResourceProvider：EPUB 插件不需要 discover/watch（文件由用户主动 import）。
 */

// 条件 require @lo/plugins-sdk：lo 仓库环境有 @lo/plugins-sdk，测试环境无则用最小基类
let Plugin;
try {
  Plugin = require('@lo/plugins-sdk/Plugin');
} catch {
  Plugin = class MinimalPlugin {
    constructor() { this._context = null; this._manifest = null; this._enabled = false; }
    $setContext(ctx) { this._context = ctx; }
    get context() { return this._context; }
    get $manifest() { return this._manifest || this.manifest(); }
    manifest() { return require('./manifest.cjs'); }
    register(context) {}
    async initialize() {}
    async enable() { this._enabled = true; }
    async disable() { this._enabled = false; }
    async dispose() { this._enabled = false; }
  };
}

const manifest = require('./manifest.cjs');
const { commands } = require('./commands.cjs');
const { parseEpub } = require('./epubParser.cjs');
const { createHandlers } = require('./reader.cjs');

class EpubReaderPlugin extends Plugin {
  manifest() {
    return manifest;
  }

  /**
   * 注册阶段：注册 importers、CLI commands、HTTP 端点
   */
  register(context) {
    super.register(context);
    const extRegistry = context.extensions;
    if (!extRegistry || typeof extRegistry.register !== 'function') return;

    // ① importers：lo import *.epub 时触发
    extRegistry.register(manifest.id, 'importers', 'epub', {
      supports: this._supportsEpub.bind(this),
      import: this._importEpub.bind(this),
    });

    // ② CLI commands：lo ext epub:<name>
    for (const [name, handler] of Object.entries(commands)) {
      extRegistry.register(manifest.id, 'commands', name, handler);
    }

    // ③ HTTP 端点：lo serve 挂载 Web 阅读器
    this._registerHttpEndpoints(extRegistry, context);
  }

  /**
   * 注册 Web 阅读器 HTTP 端点
   * handler 绑定到当前 context，通过 ctx.resources / ctx.relations / ctx.config / ctx.repoPath 访问 lo Core
   */
  _registerHttpEndpoints(extRegistry, context) {
    const handlers = createHandlers(context);
    const basePath = '/api/plugins/epub-reader';
    const endpoints = [
      { key: 'epub-reader:page',       method: 'GET',    path: basePath + '/reader',     handler: handlers.serveReaderPage,  desc: '阅读器 HTML 页面' },
      { key: 'epub-reader:book',       method: 'GET',    path: basePath + '/book',       handler: handlers.getBookInfo,      desc: '书籍元数据 + 章节目录' },
      { key: 'epub-reader:chapter',    method: 'GET',    path: basePath + '/chapter',    handler: handlers.getChapter,       desc: '章节内容' },
      { key: 'epub-reader:get-state',  method: 'GET',    path: basePath + '/state',      handler: handlers.getState,         desc: '获取阅读状态' },
      { key: 'epub-reader:put-state',  method: 'PUT',    path: basePath + '/state',      handler: handlers.saveState,        desc: '保存阅读状态' },
      { key: 'epub-reader:get-hl',     method: 'GET',    path: basePath + '/highlights', handler: handlers.getHighlights,    desc: '高亮列表' },
      { key: 'epub-reader:add-hl',     method: 'POST',   path: basePath + '/highlights', handler: handlers.addHighlight,     desc: '添加高亮' },
      { key: 'epub-reader:del-hl',     method: 'DELETE', path: basePath + '/highlights', handler: handlers.removeHighlight,  desc: '删除高亮' },
      { key: 'epub-reader:get-bm',     method: 'GET',    path: basePath + '/bookmarks',  handler: handlers.getBookmarks,     desc: '书签列表' },
      { key: 'epub-reader:add-bm',     method: 'POST',   path: basePath + '/bookmarks',  handler: handlers.addBookmark,      desc: '添加书签' },
      { key: 'epub-reader:del-bm',     method: 'DELETE', path: basePath + '/bookmarks',  handler: handlers.removeBookmark,   desc: '删除书签' },
      { key: 'epub-reader:note',       method: 'POST',   path: basePath + '/notes',      handler: handlers.createNote,       desc: '创建/更新笔记（同位置自动更新）' },
      { key: 'epub-reader:get-note',   method: 'GET',    path: basePath + '/notes',      handler: handlers.getNote,          desc: '查询指定位置的笔记' },
    ];
    for (const ep of endpoints) {
      extRegistry.register(manifest.id, 'commands', ep.key, {
        method: ep.method,
        path: ep.path,
        handler: ep.handler,
        description: ep.desc,
      });
    }
  }

  /**
   * 判断是否支持该文件（.epub 扩展名）
   */
  async _supportsEpub(filePath, stats) {
    return typeof filePath === 'string' && filePath.toLowerCase().endsWith('.epub');
  }

  /**
   * 导入 EPUB 文件：解析 → 创建 epub Resource
   * 2.md §3: EPUB 文件作为普通 Resource 存在，不修改原始文件
   *
   * @param {string} filePath — EPUB 文件路径
   * @param {PluginContext} ctx — 插件上下文（由 PluginManager.getContext 注入）
   * @param {object} options — { type, category }（来自 lo import 命令）
   * @returns {Promise<{resources: Array, relations: Array}>}
   */
  async _importEpub(filePath, ctx, options = {}) {
    // 解析 EPUB（2.md §4 阅读数据流程：解析 EPUB 内容）
    const book = parseEpub(filePath);

    // 创建 epub Resource（2.md §3: 不修改原始文件，文件路径作为 path）
    const candidate = {
      type: 'epub',
      path: filePath,
      title: book.title,
      metadata: {
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        language: book.language,
        spineCount: book.chapters.length,
        chapterTitles: book.chapters.map(c => c.title),
      },
    };

    const resource = await ctx.resources.create(candidate);

    return {
      resources: [resource],
      relations: [],
    };
  }
}

module.exports = EpubReaderPlugin;
