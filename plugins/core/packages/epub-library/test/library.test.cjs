/**
 * epub-library 插件单元测试
 *
 * 测试：
 *   1. register() 注册 2 个 HTTP 端点
 *   2. serveLibraryPage 返回 HTML
 *   3. listBooks 查询 epub Resource 并返回书籍数据
 */

const EpubLibraryPlugin = require('../src/plugin.cjs');
const manifest = require('../src/manifest.cjs');
const { createHandlers } = require('../src/library.cjs');
const fs = require('fs');

// ── Mock ──

function createMockRegistry() {
  const registered = [];
  return {
    registered,
    register(pluginId, extType, key, handler) {
      registered.push({ pluginId, extType, key, handler });
    },
    unregister() {},
    get() { return null; },
    has() { return false; },
    list() { return []; },
  };
}

function createMockContext(overrides = {}) {
  const registry = createMockRegistry();
  return {
    extensions: registry,
    resources: {
      async list() { return []; },
      ...overrides.resources,
    },
    config: overrides.config || (() => ({})),
    logger: overrides.logger || { debug() {}, info() {}, warn() {}, error() {} },
    _registry: registry,
  };
}

function createMockRes() {
  const res = {
    _statusCode: 200,
    _headers: {},
    _body: null,
    _ended: false,
    setHeader(name, value) { this._headers[name] = value; },
    status(code) { this._statusCode = code; return this; },
    json(data) { this._body = data; },
    end(data) { this._body = data; this._ended = true; },
  };
  return res;
}

// ── 测试 ──

describe('EpubLibraryPlugin register', () => {
  test('注册 2 个 HTTP 端点', () => {
    const plugin = new EpubLibraryPlugin();
    const ctx = createMockContext();
    plugin.register(ctx);

    const httpEps = ctx._registry.registered.filter(r => r.extType === 'commands');
    expect(httpEps).toHaveLength(2);

    const keys = httpEps.map(r => r.key).sort();
    expect(keys).toEqual(['epub-library:books', 'epub-library:page']);
  });

  test('端点结构正确（method/path/handler/description）', () => {
    const plugin = new EpubLibraryPlugin();
    const ctx = createMockContext();
    plugin.register(ctx);

    const httpEps = ctx._registry.registered.filter(r => r.extType === 'commands');
    for (const ep of httpEps) {
      expect(ep.handler.method).toBeDefined();
      expect(ep.handler.path).toMatch(/^\/api\/plugins\/epub-library/);
      expect(typeof ep.handler.handler).toBe('function');
      expect(typeof ep.handler.description).toBe('string');
    }
  });

  test('page 端点为 GET /api/plugins/epub-library', () => {
    const plugin = new EpubLibraryPlugin();
    const ctx = createMockContext();
    plugin.register(ctx);

    const pageEp = ctx._registry.registered.find(r => r.key === 'epub-library:page');
    expect(pageEp.handler.method).toBe('GET');
    expect(pageEp.handler.path).toBe('/api/plugins/epub-library');
  });

  test('books 端点为 GET /api/plugins/epub-library/books', () => {
    const plugin = new EpubLibraryPlugin();
    const ctx = createMockContext();
    plugin.register(ctx);

    const booksEp = ctx._registry.registered.find(r => r.key === 'epub-library:books');
    expect(booksEp.handler.method).toBe('GET');
    expect(booksEp.handler.path).toBe('/api/plugins/epub-library/books');
  });

  test('插件 id/name/version 来自 manifest', () => {
    const plugin = new EpubLibraryPlugin();
    expect(plugin.id).toBe(manifest.id);
    expect(plugin.name).toBe(manifest.name);
    expect(plugin.version).toBe(manifest.version);
  });

  test('manifest() 返回清单对象', () => {
    const plugin = new EpubLibraryPlugin();
    expect(plugin.manifest()).toBe(manifest);
  });

  test('不注册 importers / resourceTypes / resourceProviders', () => {
    const plugin = new EpubLibraryPlugin();
    const ctx = createMockContext();
    plugin.register(ctx);

    const nonCommand = ctx._registry.registered.filter(r => r.extType !== 'commands');
    expect(nonCommand).toHaveLength(0);
  });
});

describe('serveLibraryPage handler', () => {
  test('返回 HTML 内容并设置 Content-Type', async () => {
    const ctx = createMockContext();
    const handlers = createHandlers(ctx);
    const res = createMockRes();

    await handlers.serveLibraryPage({}, res);

    expect(res._headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res._ended).toBe(true);
    expect(typeof res._body).toBe('string');
    expect(res._body).toContain('<html');
    expect(res._body).toContain('书库');
  });
});

describe('listBooks handler', () => {
  test('查询所有 epub Resource 并返回书籍数据', async () => {
    const mockBooks = [
      {
        rid: 'res_001',
        name: '测试书1',
        metadata: { title: '测试书1', author: '作者A', publisher: '出版社X', language: 'zh', spineCount: 5 },
        created: 1700000000,
        updated: 1700000000,
      },
      {
        rid: 'res_002',
        name: '测试书2',
        metadata: { title: '测试书2', author: '作者B', publisher: '出版社Y', spineCount: 10 },
        created: 1700000001,
        updated: 1700000001,
      },
    ];

    const ctx = createMockContext({
      resources: {
        async list(options) {
          expect(options.type).toBe('epub');
          return mockBooks;
        },
      },
    });

    const handlers = createHandlers(ctx);
    const res = createMockRes();

    await handlers.listBooks({}, res);

    expect(res._body).toBeDefined();
    expect(res._body.books).toHaveLength(2);
    expect(res._body.books[0]).toEqual({
      rid: 'res_001',
      name: '测试书1',
      title: '测试书1',
      author: '作者A',
      publisher: '出版社X',
      language: 'zh',
      spineCount: 5,
      created: 1700000000,
      updated: 1700000000,
    });
  });

  test('空书库返回空数组', async () => {
    const ctx = createMockContext({
      resources: { async list() { return []; } },
    });

    const handlers = createHandlers(ctx);
    const res = createMockRes();

    await handlers.listBooks({}, res);

    expect(res._body.books).toEqual([]);
  });

  test('缺少 metadata 的书籍使用默认值', async () => {
    const ctx = createMockContext({
      resources: {
        async list() {
          return [{ rid: 'res_003', name: '无元数据书', metadata: null, created: 0, updated: 0 }];
        },
      },
    });

    const handlers = createHandlers(ctx);
    const res = createMockRes();

    await handlers.listBooks({}, res);

    const book = res._body.books[0];
    expect(book.title).toBe('无元数据书');
    expect(book.author).toBe('');
    expect(book.publisher).toBe('');
    expect(book.spineCount).toBe(0);
  });

  test('listBooks 查询失败时返回 500', async () => {
    const ctx = createMockContext({
      resources: {
        async list() { throw new Error('数据库连接失败'); },
      },
    });

    const handlers = createHandlers(ctx);
    const res = createMockRes();

    await handlers.listBooks({}, res);

    expect(res._statusCode).toBe(500);
    expect(res._body.error).toBe('数据库连接失败');
  });
});

describe('serveLibraryPage 错误路径', () => {
  test('读取 HTML 失败时返回 500', async () => {
    // htmlCache 是模块级缓存，先 resetModules 让 library.cjs 以空缓存重新加载
    jest.resetModules();
    const freshLibrary = require('../src/library.cjs');
    const freshHandlers = freshLibrary.createHandlers(createMockContext());
    const res = createMockRes();

    const spy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('HTML 文件不存在');
    });
    try {
      await freshHandlers.serveLibraryPage({}, res);
    } finally {
      spy.mockRestore();
    }

    expect(res._statusCode).toBe(500);
    expect(res._body.error).toBe('HTML 文件不存在');
  });
});
