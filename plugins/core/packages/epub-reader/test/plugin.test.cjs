/**
 * plugin 单元测试
 *
 * 测试 EpubReaderPlugin 的：
 *   1. register() 正确注册 importers 和 commands 扩展点
 *   2. _supportsEpub() 文件扩展名匹配
 *   3. _importEpub() 解析 EPUB 并创建 Resource
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');

const EpubReaderPlugin = require('../src/plugin.cjs');
const manifest = require('../src/manifest.cjs');

// ── 测试用 EPUB 创建（复用 epubParser 测试的结构）──

function createTestEpub(filePath) {
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));
  zip.addFile('META-INF/container.xml', Buffer.from(
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  ));
  zip.addFile('OEBPS/content.opf', Buffer.from(
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:title>测试书</dc:title><dc:creator>作者</dc:creator></metadata>' +
    '<manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest>' +
    '<spine toc="ncx"><itemref idref="ch1"/></spine></package>'
  ));
  zip.addFile('OEBPS/toc.ncx', Buffer.from(
    '<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
    '<navMap><navPoint id="n1"><navLabel><text>第一章</text></navLabel>' +
    '<content src="ch1.xhtml"/></navPoint></navMap></ncx>'
  ));
  zip.addFile('OEBPS/ch1.xhtml', Buffer.from(
    '<html><body><p>章节内容</p></body></html>'
  ));
  zip.writeZip(filePath);
  return filePath;
}

// ── Mock 扩展注册表 ──

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
      async create(candidate) {
        return { rid: 'mock-rid-001', ...candidate };
      },
      async getByRid() { return null; },
      async list() { return []; },
      ...overrides.resources,
    },
    config: overrides.config || (() => ({})),
    logger: overrides.logger || { debug() {}, info() {}, warn() {}, error() {} },
    _registry: registry, // 测试用引用
  };
}

// ── 测试 ──

describe('EpubReaderPlugin register', () => {
  test('注册 importers 扩展点', () => {
    const plugin = new EpubReaderPlugin();
    const ctx = createMockContext();
    plugin.register(ctx);

    const importerReg = ctx._registry.registered.find(r => r.extType === 'importers');
    expect(importerReg).toBeDefined();
    expect(importerReg.key).toBe('epub');
    expect(importerReg.pluginId).toBe(manifest.id);
    expect(typeof importerReg.handler.supports).toBe('function');
    expect(typeof importerReg.handler.import).toBe('function');
  });

  test('注册 8 个 CLI commands + 13 个 HTTP 端点', () => {
    const plugin = new EpubReaderPlugin();
    const ctx = createMockContext();
    plugin.register(ctx);

    const cmdRegs = ctx._registry.registered.filter(r => r.extType === 'commands');
    expect(cmdRegs).toHaveLength(21); // 8 CLI + 13 HTTP

    // CLI 命令（有 run 函数）
    const cliCmds = cmdRegs.filter(r => typeof r.handler.run === 'function');
    expect(cliCmds).toHaveLength(8);
    const cliKeys = cliCmds.map(r => r.key).sort();
    expect(cliKeys).toEqual([
      'epub:bookmark', 'epub:bookmarks', 'epub:highlight', 'epub:highlights',
      'epub:info', 'epub:note', 'epub:notes', 'epub:open',
    ]);

    // HTTP 端点（有 method/path/handler）
    const httpEps = cmdRegs.filter(r => r.handler.method && r.handler.path && typeof r.handler.handler === 'function');
    expect(httpEps).toHaveLength(13);
  });

  test('CLI command handler 有 run 函数和 description', () => {
    const plugin = new EpubReaderPlugin();
    const ctx = createMockContext();
    plugin.register(ctx);

    const cmdRegs = ctx._registry.registered.filter(r => r.extType === 'commands');
    const cliCmds = cmdRegs.filter(r => typeof r.handler.run === 'function');
    for (const reg of cliCmds) {
      expect(typeof reg.handler.run).toBe('function');
      expect(typeof reg.handler.description).toBe('string');
    }
  });

  test('HTTP 端点有 method/path/handler/description', () => {
    const plugin = new EpubReaderPlugin();
    const ctx = createMockContext();
    plugin.register(ctx);

    const cmdRegs = ctx._registry.registered.filter(r => r.extType === 'commands');
    const httpEps = cmdRegs.filter(r => r.handler.method);
    for (const reg of httpEps) {
      expect(['GET', 'POST', 'PUT', 'DELETE']).toContain(reg.handler.method);
      expect(reg.handler.path).toMatch(/^\/api\/plugins\/epub-reader\//);
      expect(typeof reg.handler.handler).toBe('function');
      expect(typeof reg.handler.description).toBe('string');
    }
  });

  test('extensions 为空时不报错', () => {
    const plugin = new EpubReaderPlugin();
    expect(() => plugin.register({ extensions: null })).not.toThrow();
  });
});

describe('EpubReaderPlugin _supportsEpub', () => {
  const plugin = new EpubReaderPlugin();

  test('.epub 扩展名 → true', async () => {
    expect(await plugin._supportsEpub('book.epub')).toBe(true);
    expect(await plugin._supportsEpub('path/to/book.epub')).toBe(true);
  });

  test('大写 .EPUB → true', async () => {
    expect(await plugin._supportsEpub('book.EPUB')).toBe(true);
  });

  test('非 .epub → false', async () => {
    expect(await plugin._supportsEpub('book.pdf')).toBe(false);
    expect(await plugin._supportsEpub('book.txt')).toBe(false);
    expect(await plugin._supportsEpub('epub')).toBe(false);
  });

  test('非字符串 → false', async () => {
    expect(await plugin._supportsEpub(null)).toBe(false);
    expect(await plugin._supportsEpub(123)).toBe(false);
    expect(await plugin._supportsEpub(undefined)).toBe(false);
  });
});

describe('EpubReaderPlugin _importEpub', () => {
  let epubPath;

  beforeAll(() => {
    epubPath = path.join(os.tmpdir(), `import-test-${Date.now()}.epub`);
    createTestEpub(epubPath);
  });

  afterAll(() => {
    if (fs.existsSync(epubPath)) fs.unlinkSync(epubPath);
  });

  test('解析 EPUB 并创建 Resource', async () => {
    const plugin = new EpubReaderPlugin();
    const ctx = createMockContext();
    const result = await plugin._importEpub(epubPath, ctx, {});

    expect(result.resources).toHaveLength(1);
    const resource = result.resources[0];
    expect(resource.rid).toBe('mock-rid-001');
    expect(resource.type).toBe('epub');
    expect(resource.title).toBe('测试书');
    expect(resource.metadata.title).toBe('测试书');
    expect(resource.metadata.author).toBe('作者');
    expect(resource.metadata.spineCount).toBe(1);
    expect(resource.metadata.chapterTitles).toEqual(['第一章']);
  });

  test('返回空 relations 数组', async () => {
    const plugin = new EpubReaderPlugin();
    const ctx = createMockContext();
    const result = await plugin._importEpub(epubPath, ctx, {});
    expect(result.relations).toEqual([]);
  });

  test('resources.create 被调用时传入正确的 candidate', async () => {
    const plugin = new EpubReaderPlugin();
    let capturedCandidate = null;
    const ctx = createMockContext({
      resources: {
        async create(candidate) {
          capturedCandidate = candidate;
          return { rid: 'test-rid', ...candidate };
        },
      },
    });

    await plugin._importEpub(epubPath, ctx, {});
    expect(capturedCandidate.type).toBe('epub');
    expect(capturedCandidate.path).toBe(epubPath);
    expect(capturedCandidate.metadata).toBeDefined();
  });

  test('无效 EPUB 文件抛错', async () => {
    const badPath = path.join(os.tmpdir(), `bad-${Date.now()}.epub`);
    const zip = new AdmZip();
    zip.addFile('random.txt', Buffer.from('not epub'));
    zip.writeZip(badPath);

    const plugin = new EpubReaderPlugin();
    const ctx = createMockContext();
    await expect(plugin._importEpub(badPath, ctx, {})).rejects.toThrow();

    fs.unlinkSync(badPath);
  });
});

describe('EpubReaderPlugin manifest', () => {
  test('manifest() 返回正确的元信息', () => {
    const plugin = new EpubReaderPlugin();
    const m = plugin.manifest();
    expect(m.id).toBe('epub-reader');
    expect(m.name).toBe('EPUB 阅读');
    expect(m.version).toBe('0.1.0');
  });

  test('声明 4 个扩展点', () => {
    const m = manifest;
    expect(m.extensions).toContain('resourceTypes');
    expect(m.extensions).toContain('relationTypes');
    expect(m.extensions).toContain('importers');
    expect(m.extensions).toContain('commands');
  });

  test('contributes.resourceTypes 注册 epub 类型', () => {
    const rt = manifest.contributes.resourceTypes[0];
    expect(rt.type).toBe('epub');
    expect(rt.metadataSchema.title).toBeDefined();
    expect(rt.metadataSchema.author).toBeDefined();
  });

  test('contributes.resourceTypes 注册 note 类型及笔记字段', () => {
    const rt = manifest.contributes.resourceTypes.find(r => r.type === 'note');
    expect(rt).toBeDefined();
    expect(rt.metadataSchema.sourceResource).toBeDefined();
    expect(rt.metadataSchema.location).toBeDefined();
    expect(rt.metadataSchema.quote).toBeDefined();
    expect(rt.metadataSchema.content).toBeDefined();
  });

  test('contributes.relationTypes 注册 source-of', () => {
    const rel = manifest.contributes.relationTypes[0];
    expect(rel.type).toBe('source-of');
  });
});
