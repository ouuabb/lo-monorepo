/**
 * reader 单元测试
 *
 * 测试 Web 阅读器 HTTP handler 的全部 12 个端点。
 * 使用 mock context 模拟 lo Core，不依赖真实数据库。
 *
 * 测试策略：
 *   - 动态创建测试 EPUB 文件（复用 epubParser.test.cjs 的 EPUB 结构）
 *   - mock PluginContext：resources / relations / config / repoPath
 *   - mock req/res：捕获响应内容，验证状态码和数据
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');

const { createHandlers, clearBookCache, getReaderHtml } = require('../src/reader.cjs');

// ── 测试 EPUB 文件创建 ──

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const CONTENT_OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>测试书籍</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:identifier id="bookid">test-001</dc:identifier>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1"/>
    <itemref idref="chapter2"/>
  </spine>
</package>`;

const TOC_NCX = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="ch1"><navLabel><text>第一章</text></navLabel><content src="chapter1.xhtml"/></navPoint>
    <navPoint id="ch2"><navLabel><text>第二章</text></navLabel><content src="chapter2.xhtml"/></navPoint>
  </navMap>
</ncx>`;

const CHAPTER1_XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第一章</title></head>
<body><h1>第一章 开始</h1><p>这是第一章的内容，用于测试 EPUB 阅读器。</p></body>
</html>`;

const CHAPTER2_XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第二章</title></head>
<body><h1>第二章 继续</h1><p>这是第二章的内容，测试翻页功能。</p></body>
</html>`;

function createTestEpub(filePath) {
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));
  zip.addFile('META-INF/container.xml', Buffer.from(CONTAINER_XML, 'utf8'));
  zip.addFile('OEBPS/content.opf', Buffer.from(CONTENT_OPF, 'utf8'));
  zip.addFile('OEBPS/toc.ncx', Buffer.from(TOC_NCX, 'utf8'));
  zip.addFile('OEBPS/chapter1.xhtml', Buffer.from(CHAPTER1_XHTML, 'utf8'));
  zip.addFile('OEBPS/chapter2.xhtml', Buffer.from(CHAPTER2_XHTML, 'utf8'));
  zip.writeZip(filePath);
  return filePath;
}

// ── mock 工具 ──

function createMockRes() {
  const result = { statusCode: null, data: null, headers: {}, endData: null, ended: false };
  const res = {
    headersSent: false,
    _result: result,
    status(code) {
      result.statusCode = code;
      return { json: (data) => { result.data = data; } };
    },
    json(data) { result.statusCode = 200; result.data = data; },
    setHeader(name, value) { result.headers[name] = value; },
    end(data) { result.ended = true; result.endData = data; },
    writeHead(code, headers) {
      result.statusCode = code;
      if (headers) Object.assign(result.headers, headers);
      this.headersSent = true;
    },
  };
  return res;
}

function createMockReq(url, body = {}) {
  return { url, method: 'GET', body, headers: {} };
}

function createMockContext(repoPath, epubFilePath) {
  const resources = new Map();
  const relations = []; // 闭包变量，避免 this 绑定问题
  // 预置一个 EPUB resource
  resources.set('epub-001', {
    rid: 'epub-001',
    type: 'epub',
    path: epubFilePath,
    title: '测试书籍',
    metadata: { title: '测试书籍', author: '测试作者' },
  });

  let noteIdCounter = 0;

  return {
    _resources: resources,
    _relations: relations,
    repoPath,
    config(key) {
      if (key === 'dataDir') return undefined; // 用默认值
      return undefined;
    },
    resources: {
      async getByRid(rid) { return resources.get(rid) || null; },
      async create(candidate) {
        noteIdCounter++;
        const rid = 'note-' + String(noteIdCounter).padStart(3, '0');
        const resource = { rid, ...candidate };
        resources.set(rid, resource);
        return resource;
      },
      async update(rid, patch) {
        const r = resources.get(rid);
        if (!r) return null;
        if (patch.metadata) r.metadata = patch.metadata;
        return r;
      },
      async list() { return Array.from(resources.values()); },
    },
    relations: {
      async create(candidate) {
        const rel = { id: String(relations.length + 1), ...candidate };
        relations.push(rel);
        return rel;
      },
      async getByFromRidAndType(fromRid, type) {
        return relations.filter(r => r.from_rid === fromRid && r.type === type);
      },
      async update(id, updates) {
        const rel = relations.find(r => r.id === id);
        if (rel && updates.metadata) {
          rel.metadata = { ...(rel.metadata || {}), ...updates.metadata };
        }
        return rel;
      },
    },
  };
}

// ── 测试套件 ──

let tmpDir, epubPath, ctx, handlers;

beforeEach(() => {
  clearBookCache();
  tmpDir = path.join(os.tmpdir(), `epub-reader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  epubPath = path.join(tmpDir, 'test.epub');
  createTestEpub(epubPath);
  ctx = createMockContext(tmpDir, epubPath);
  ctx._epubStore = null; // 用真实 store（临时目录）
  handlers = createHandlers(ctx);
});

afterEach(async () => {
  clearBookCache();
  // 清理 store
  if (ctx._epubStore) {
    try { await ctx._epubStore._destroy(); } catch {}
  }
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('reader HTML 页面', () => {
  test('GET /reader 返回 HTML 页面', async () => {
    const req = createMockReq('/api/plugins/epub-reader/reader?rid=epub-001');
    const res = createMockRes();
    await handlers.serveReaderPage(req, res);
    expect(res._result.ended).toBe(true);
    expect(res._result.headers['Content-Type']).toContain('text/html');
    expect(res._result.endData).toContain('<html');
    expect(res._result.endData).toContain('EPUB Reader');
  });

  test('无 rid 时返回用法提示页', async () => {
    const req = createMockReq('/api/plugins/epub-reader/reader');
    const res = createMockRes();
    await handlers.serveReaderPage(req, res);
    expect(res._result.ended).toBe(true);
    expect(res._result.headers['Content-Type']).toContain('text/html');
    expect(res._result.endData).toContain('rid');
    expect(res._result.endData).toContain('lo import');
  });
});

describe('reader 书籍信息', () => {
  test('GET /book 返回元数据 + 章节列表', async () => {
    const req = createMockReq('/api/plugins/epub-reader/book?rid=epub-001');
    const res = createMockRes();
    await handlers.getBookInfo(req, res);
    expect(res._result.data.title).toBe('测试书籍');
    expect(res._result.data.author).toBe('测试作者');
    expect(res._result.data.chapterCount).toBe(2);
    expect(res._result.data.chapters).toHaveLength(2);
    expect(res._result.data.chapters[0].index).toBe(0);
  });

  test('rid 不存在返回 400', async () => {
    const req = createMockReq('/api/plugins/epub-reader/book?rid=nonexistent');
    const res = createMockRes();
    await handlers.getBookInfo(req, res);
    expect(res._result.statusCode).toBe(400);
  });
});

describe('reader 章节内容', () => {
  test('GET /chapter 返回章节文本', async () => {
    const req = createMockReq('/api/plugins/epub-reader/chapter?rid=epub-001&index=0');
    const res = createMockRes();
    await handlers.getChapter(req, res);
    expect(res._result.data.index).toBe(0);
    expect(res._result.data.title).toBe('第一章');
    expect(res._result.data.content).toContain('第一章的内容');
  });

  test('索引越界返回 400', async () => {
    const req = createMockReq('/api/plugins/epub-reader/chapter?rid=epub-001&index=99');
    const res = createMockRes();
    await handlers.getChapter(req, res);
    expect(res._result.statusCode).toBe(400);
    expect(res._result.data.error).toContain('无效');
  });

  test('非数字索引返回 400', async () => {
    const req = createMockReq('/api/plugins/epub-reader/chapter?rid=epub-001&index=abc');
    const res = createMockRes();
    await handlers.getChapter(req, res);
    expect(res._result.statusCode).toBe(400);
  });
});

describe('reader 阅读状态', () => {
  test('初始状态为 null', async () => {
    const req = createMockReq('/api/plugins/epub-reader/state?rid=epub-001');
    const res = createMockRes();
    await handlers.getState(req, res);
    expect(res._result.data.state).toBeNull();
  });

  test('PUT 保存后 GET 能读取', async () => {
    // PUT
    const putReq = createMockReq('/api/plugins/epub-reader/state', {
      rid: 'epub-001', location: 'epubcfi(0!/2:0,/2:0)', progress: 0.5,
    });
    putReq.method = 'PUT';
    const putRes = createMockRes();
    await handlers.saveState(putReq, putRes);
    expect(putRes._result.data.ok).toBe(true);

    // GET
    const getReq = createMockReq('/api/plugins/epub-reader/state?rid=epub-001');
    const getRes = createMockRes();
    await handlers.getState(getReq, getRes);
    expect(getRes._result.data.state).not.toBeNull();
    expect(getRes._result.data.state.location).toBe('epubcfi(0!/2:0,/2:0)');
    expect(getRes._result.data.state.progress).toBe(0.5);
  });

  test('PUT 缺少 rid 返回 400', async () => {
    const req = createMockReq('/api/plugins/epub-reader/state', { location: 'x' });
    req.method = 'PUT';
    const res = createMockRes();
    await handlers.saveState(req, res);
    expect(res._result.statusCode).toBe(400);
  });
});

describe('reader 高亮', () => {
  test('POST 添加高亮后 GET 能列出', async () => {
    // POST
    const postReq = createMockReq('/api/plugins/epub-reader/highlights', {
      rid: 'epub-001', location: 'epubcfi(0!/2/1:5,/2/1:15)', text: '第一章', style: 'green',
    });
    postReq.method = 'POST';
    const postRes = createMockRes();
    await handlers.addHighlight(postReq, postRes);
    expect(postRes._result.data.ok).toBe(true);
    expect(postRes._result.data.highlight.id).toMatch(/^hl_/);
    expect(postRes._result.data.highlight.style).toBe('green');
    const hlId = postRes._result.data.highlight.id;

    // GET
    const getReq = createMockReq('/api/plugins/epub-reader/highlights?rid=epub-001');
    const getRes = createMockRes();
    await handlers.getHighlights(getReq, getRes);
    expect(getRes._result.data.highlights).toHaveLength(1);
    expect(getRes._result.data.highlights[0].text).toBe('第一章');
  });

  test('POST 缺少 text 返回 400', async () => {
    const req = createMockReq('/api/plugins/epub-reader/highlights', {
      rid: 'epub-001', location: 'epubcfi(0!/2/1:5,/2/1:15)',
    });
    req.method = 'POST';
    const res = createMockRes();
    await handlers.addHighlight(req, res);
    expect(res._result.statusCode).toBe(400);
  });

  test('DELETE 删除高亮', async () => {
    // 先添加
    const postReq = createMockReq('/api/plugins/epub-reader/highlights', {
      rid: 'epub-001', location: 'epubcfi(0!/2/1:5,/2/1:15)', text: '内容',
    });
    postReq.method = 'POST';
    const postRes = createMockRes();
    await handlers.addHighlight(postReq, postRes);
    const hlId = postRes._result.data.highlight.id;

    // 删除
    const delReq = createMockReq('/api/plugins/epub-reader/highlights', {
      rid: 'epub-001', id: hlId,
    });
    delReq.method = 'DELETE';
    const delRes = createMockRes();
    await handlers.removeHighlight(delReq, delRes);
    expect(delRes._result.data.ok).toBe(true);

    // 确认已删除
    const getReq = createMockReq('/api/plugins/epub-reader/highlights?rid=epub-001');
    const getRes = createMockRes();
    await handlers.getHighlights(getReq, getRes);
    expect(getRes._result.data.highlights).toHaveLength(0);
  });

  test('DELETE 不存在的 id 返回 ok: false', async () => {
    const req = createMockReq('/api/plugins/epub-reader/highlights', {
      rid: 'epub-001', id: 'nonexistent',
    });
    req.method = 'DELETE';
    const res = createMockRes();
    await handlers.removeHighlight(req, res);
    expect(res._result.data.ok).toBe(false);
  });
});

describe('reader 书签', () => {
  test('POST 添加书签后 GET 能列出', async () => {
    const postReq = createMockReq('/api/plugins/epub-reader/bookmarks', {
      rid: 'epub-001', location: 'epubcfi(1!/2:0,/2:0)', title: '第二章开头',
    });
    postReq.method = 'POST';
    const postRes = createMockRes();
    await handlers.addBookmark(postReq, postRes);
    expect(postRes._result.data.bookmark.id).toMatch(/^bm_/);

    const getReq = createMockReq('/api/plugins/epub-reader/bookmarks?rid=epub-001');
    const getRes = createMockRes();
    await handlers.getBookmarks(getReq, getRes);
    expect(getRes._result.data.bookmarks).toHaveLength(1);
    expect(getRes._result.data.bookmarks[0].title).toBe('第二章开头');
  });

  test('DELETE 删除书签', async () => {
    const postReq = createMockReq('/api/plugins/epub-reader/bookmarks', {
      rid: 'epub-001', location: 'epubcfi(0!/2:0,/2:0)', title: '书签1',
    });
    postReq.method = 'POST';
    const postRes = createMockRes();
    await handlers.addBookmark(postReq, postRes);
    const bmId = postRes._result.data.bookmark.id;

    const delReq = createMockReq('/api/plugins/epub-reader/bookmarks', {
      rid: 'epub-001', id: bmId,
    });
    delReq.method = 'DELETE';
    const delRes = createMockRes();
    await handlers.removeBookmark(delReq, delRes);
    expect(delRes._result.data.ok).toBe(true);
  });
});

describe('reader 笔记创建', () => {
  test('POST /notes 创建 note Resource + source-of 关系', async () => {
    const req = createMockReq('/api/plugins/epub-reader/notes', {
      rid: 'epub-001',
      content: '这是我的阅读笔记',
      quote: '第一章的内容',
      location: 'epubcfi(0!/2/1:10,/2/1:20)',
    });
    req.method = 'POST';
    const res = createMockRes();
    await handlers.createNote(req, res);

    expect(res._result.data.ok).toBe(true);
    const note = res._result.data.note;
    expect(note.type).toBe('note');
    expect(note.metadata.sourceResource).toBe('epub-001');
    expect(note.metadata.quote).toBe('第一章的内容');

    // 验证创建了 source-of 关系
    expect(ctx._relations).toHaveLength(1);
    expect(ctx._relations[0].type).toBe('source-of');
    expect(ctx._relations[0].from_rid).toBe('epub-001');
    expect(ctx._relations[0].to_rid).toBe(note.rid);
  });

  test('缺少 content 返回 400', async () => {
    const req = createMockReq('/api/plugins/epub-reader/notes', {
      rid: 'epub-001', quote: '引用文本',
    });
    req.method = 'POST';
    const res = createMockRes();
    await handlers.createNote(req, res);
    expect(res._result.statusCode).toBe(400);
  });

  test('同 location 第二次 POST 更新已有笔记而非新建', async () => {
    // 第一次创建
    const loc = 'epubcfi(0!/2/1:42,/2/1:52)';
    const req1 = createMockReq('/api/plugins/epub-reader/notes', {
      rid: 'epub-001', content: '原始笔记', quote: '原文', location: loc,
    });
    req1.method = 'POST';
    const res1 = createMockRes();
    await handlers.createNote(req1, res1);
    expect(res1._result.data.created).toBe(true);
    const noteRid = res1._result.data.note.rid;

    // 第二次同 location → 更新
    const req2 = createMockReq('/api/plugins/epub-reader/notes', {
      rid: 'epub-001', content: '修改后的笔记', quote: '原文', location: loc,
    });
    req2.method = 'POST';
    const res2 = createMockRes();
    await handlers.createNote(req2, res2);
    expect(res2._result.data.updated).toBe(true);
    expect(res2._result.data.note.rid).toBe(noteRid); // 同一个 rid
    expect(res2._result.data.note.metadata.content).toBe('修改后的笔记');

    // 仍然只有 1 条 relation
    expect(ctx._relations.filter(r => r.type === 'source-of')).toHaveLength(1);
  });

  test('GET /notes 查询指定位置的笔记', async () => {
    // 先创建一条笔记
    const loc = 'epubcfi(1!/2/1:5,/2/1:15)';
    const postReq = createMockReq('/api/plugins/epub-reader/notes', {
      rid: 'epub-001', content: '查询测试', quote: '引用', location: loc,
    });
    postReq.method = 'POST';
    const postRes = createMockRes();
    await handlers.createNote(postReq, postRes);

    // 查询
    const req = createMockReq('/api/plugins/epub-reader/notes?rid=epub-001&location=' + encodeURIComponent(loc));
    req.method = 'GET';
    const res = createMockRes();
    await handlers.getNote(req, res);
    expect(res._result.data.note).toBeTruthy();
    expect(res._result.data.note.metadata.content).toBe('查询测试');
  });

  test('GET /notes 查询不存在的位置返回 null', async () => {
    const req = createMockReq('/api/plugins/epub-reader/notes?rid=epub-001&location=nonexistent');
    req.method = 'GET';
    const res = createMockRes();
    await handlers.getNote(req, res);
    expect(res._result.data.note).toBeNull();
  });

  test('rid 不存在返回 400', async () => {
    const req = createMockReq('/api/plugins/epub-reader/notes', {
      rid: 'nonexistent', content: '笔记内容',
    });
    req.method = 'POST';
    const res = createMockRes();
    await handlers.createNote(req, res);
    expect(res._result.statusCode).toBe(400);
  });
});

describe('reader EPUB 缓存', () => {
  test('同一 rid 多次请求复用解析缓存', async () => {
    const req = createMockReq('/api/plugins/epub-reader/book?rid=epub-001');
    const res1 = createMockRes();
    await handlers.getBookInfo(req, res1);

    const res2 = createMockRes();
    await handlers.getBookInfo(req, res2);

    // 两次返回相同数据
    expect(res1._result.data.title).toBe(res2._result.data.title);
  });

  test('clearBookCache 后重新解析', async () => {
    const req = createMockReq('/api/plugins/epub-reader/book?rid=epub-001');
    const res1 = createMockRes();
    await handlers.getBookInfo(req, res1);

    clearBookCache();

    const res2 = createMockRes();
    await handlers.getBookInfo(req, res2);
    expect(res2._result.data.title).toBe('测试书籍');
  });
});
