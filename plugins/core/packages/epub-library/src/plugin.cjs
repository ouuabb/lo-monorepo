/**
 * EpubLibraryPlugin — EPUB 书库展示插件
 *
 * 唯一能力：通过 commands 扩展点注册 HTTP 端点
 *   GET /api/plugins/epub-library/  — 书库 HTML 页面
 *   GET /api/plugins/epub-library/books  — 查询所有 epub Resource（JSON）
 *
 * 数据来源：lo 核心 resourceService.getAll({ type: 'epub' })
 * 不自己存储数据，不注册类型，不干涉 lo 流程。
 */
let Plugin;
try {
  Plugin = require('@lo/plugins-sdk/Plugin');
} catch {
  Plugin = class MinimalPlugin {
    constructor() { this._context = null; this._enabled = false; }
    $setContext(ctx) { this._context = ctx; }
    get context() { return this._context; }
    get id() { return this.manifest()?.id || ''; }
    get name() { return this.manifest()?.name || this.id; }
    get version() { return this.manifest()?.version || '0.0.0'; }
    register(context) {}
    async initialize() {}
    async enable() { this._enabled = true; }
    async disable() { this._enabled = false; }
    async dispose() { this._enabled = false; }
  };
}

const manifest = require('./manifest.cjs');
const { createHandlers } = require('./library.cjs');

class EpubLibraryPlugin extends Plugin {
  manifest() {
    return manifest;
  }

  /**
   * 注册阶段：注册 HTTP 端点
   */
  register(context) {
    if (typeof super.register === 'function') super.register(context);
    const extRegistry = context.extensions;
    if (!extRegistry || typeof extRegistry.register !== 'function') return;

    this._registerHttpEndpoints(extRegistry, context);
  }

  /**
   * 注册 HTTP 端点
   */
  _registerHttpEndpoints(extRegistry, context) {
    const handlers = createHandlers(context);
    const basePath = '/api/plugins/epub-library';
    const endpoints = [
      { key: 'epub-library:page',   method: 'GET', path: basePath,          handler: handlers.serveLibraryPage,  desc: '书库 HTML 页面' },
      { key: 'epub-library:books',  method: 'GET', path: basePath + '/books', handler: handlers.listBooks,        desc: '查询所有 EPUB 书籍' },
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
}

module.exports = EpubLibraryPlugin;
