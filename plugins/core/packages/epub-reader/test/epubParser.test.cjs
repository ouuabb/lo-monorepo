/**
 * epubParser 单元测试
 *
 * 测试策略：
 *   1. 纯函数（findOpfPath, parseOpf系列, parseNcx, parseNav, extractText, decode, makeLocation, parseLocation）
 *      直接用字符串输入测试，不依赖文件
 *   2. parseEpub 端到端：用 adm-zip 动态创建测试 EPUB 文件，验证完整解析流程
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');

const {
  parseEpub,
  findOpfPath,
  parseOpf,
  parseOpfMetadata,
  parseOpfManifest,
  parseOpfSpine,
  parseNcx,
  parseNav,
  extractTextFromXhtml,
  decodeHtmlEntities,
  extractAttr,
  normalizePath,
} = require('../src/epubParser.cjs');

// ── 测试 EPUB 文件创建 ──

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const CONTENT_OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>测试书籍</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:publisher>测试出版社</dc:publisher>
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
    <navPoint id="nav1">
      <navLabel><text>第一章 开始</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
    <navPoint id="nav2">
      <navLabel><text>第二章 结束</text></navLabel>
      <content src="chapter2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

const CHAPTER1_XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第一章</title></head>
<body>
<h1>第一章 开始</h1>
<p>这是第一章的内容。Hello &amp; World。</p>
<p>第二段落。</p>
</body>
</html>`;

const CHAPTER2_XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第二章</title></head>
<body>
<h1>第二章 结束</h1>
<p>这是第二章的内容。</p>
</body>
</html>`;

/**
 * 创建测试用 EPUB 文件
 */
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

// ── 纯函数测试 ──

describe('epubParser 纯函数', () => {
  describe('findOpfPath', () => {
    test('从 container.xml 提取 OPF 路径', () => {
      expect(findOpfPath(CONTAINER_XML)).toBe('OEBPS/content.opf');
    });

    test('无 full-path 属性时返回 null', () => {
      expect(findOpfPath('<container></container>')).toBeNull();
    });
  });

  describe('parseOpfMetadata', () => {
    test('解析 title/creator/publisher/language', () => {
      const meta = parseOpfMetadata(CONTENT_OPF);
      expect(meta.title).toBe('测试书籍');
      expect(meta.creator).toBe('测试作者');
      expect(meta.publisher).toBe('测试出版社');
      expect(meta.language).toBe('zh-CN');
    });

    test('缺失字段不报错', () => {
      const meta = parseOpfMetadata('<package><metadata></metadata></package>');
      expect(meta.title).toBeUndefined();
      expect(meta.creator).toBeUndefined();
    });

    test('解码 HTML 实体', () => {
      const meta = parseOpfMetadata(
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>A &amp; B</dc:title></metadata>'
      );
      expect(meta.title).toBe('A & B');
    });
  });

  describe('parseOpfManifest', () => {
    test('解析所有 item', () => {
      const manifest = parseOpfManifest(CONTENT_OPF);
      expect(manifest.chapter1).toBeDefined();
      expect(manifest.chapter1.href).toBe('chapter1.xhtml');
      expect(manifest.chapter1.mediaType).toBe('application/xhtml+xml');
      expect(manifest.ncx).toBeDefined();
      expect(manifest.ncx.mediaType).toBe('application/x-dtbncx+xml');
    });
  });

  describe('parseOpfSpine', () => {
    test('解析阅读顺序', () => {
      const spine = parseOpfSpine(CONTENT_OPF);
      expect(spine).toEqual(['chapter1', 'chapter2']);
    });
  });

  describe('parseNcx', () => {
    test('解析 NCX 目录', () => {
      const toc = parseNcx(TOC_NCX);
      expect(toc).toHaveLength(2);
      expect(toc[0].title).toBe('第一章 开始');
      expect(toc[0].src).toBe('chapter1.xhtml');
      expect(toc[1].title).toBe('第二章 结束');
    });
  });

  describe('parseNav', () => {
    test('解析 EPUB3 Nav 目录', () => {
      const nav = `<html><body><nav><ol>
        <li><a href="ch1.xhtml">Chapter 1</a></li>
        <li><a href="ch2.xhtml">Chapter 2</a></li>
      </ol></nav></body></html>`;
      const toc = parseNav(nav);
      expect(toc).toHaveLength(2);
      expect(toc[0].title).toBe('Chapter 1');
      expect(toc[0].src).toBe('ch1.xhtml');
    });
  });

  describe('extractTextFromXhtml', () => {
    test('去掉 HTML 标签保留文本', () => {
      const text = extractTextFromXhtml('<p>Hello</p><p>World</p>');
      expect(text).toContain('Hello');
      expect(text).toContain('World');
      expect(text).not.toContain('<p>');
    });

    test('块级元素后加换行', () => {
      const text = extractTextFromXhtml('<p>第一段</p><p>第二段</p>');
      expect(text).toContain('\n');
    });

    test('去掉 script 和 style', () => {
      const text = extractTextFromXhtml(
        '<style>.x{color:red}</style><script>alert(1)</script><p>可见文本</p>'
      );
      expect(text).toBe('可见文本');
    });

    test('解码 HTML 实体', () => {
      const text = extractTextFromXhtml('<p>&amp;&lt;&gt;&nbsp;X</p>');
      expect(text).toBe('&<> X');
    });

    test('去掉 head', () => {
      const text = extractTextFromXhtml('<head><title>标题</title></head><body><p>正文</p></body>');
      expect(text).toBe('正文');
      expect(text).not.toContain('标题');
    });

    test('br 标签转换行', () => {
      const text = extractTextFromXhtml('<p>行1<br/>行2</p>');
      expect(text).toContain('行1');
      expect(text).toContain('行2');
    });
  });

  describe('decodeHtmlEntities', () => {
    test('解码常见实体', () => {
      expect(decodeHtmlEntities('&amp;')).toBe('&');
      expect(decodeHtmlEntities('&lt;')).toBe('<');
      expect(decodeHtmlEntities('&gt;')).toBe('>');
      expect(decodeHtmlEntities('&quot;')).toBe('"');
      expect(decodeHtmlEntities('&nbsp;')).toBe(' ');
    });

    test('未知实体保留原样', () => {
      expect(decodeHtmlEntities('&unknownentity;')).toBe('&unknownentity;');
    });
  });

  describe('extractAttr', () => {
    test('提取属性值', () => {
      expect(extractAttr('<item id="abc" href="x.xhtml"/>', 'id')).toBe('abc');
      expect(extractAttr('<item id="abc" href="x.xhtml"/>', 'href')).toBe('x.xhtml');
    });

    test('属性不存在返回 null', () => {
      expect(extractAttr('<item id="abc"/>', 'href')).toBeNull();
    });
  });

  describe('normalizePath', () => {
    test('处理 ./ 前缀', () => {
      expect(normalizePath('./chapter1.xhtml')).toBe('chapter1.xhtml');
    });

    test('处理 ../ 前缀', () => {
      expect(normalizePath('OEBPS/../chapter1.xhtml')).toBe('chapter1.xhtml');
    });
  });
});

// ── parseEpub 端到端测试 ──

describe('parseEpub 端到端', () => {
  let epubPath;

  beforeAll(() => {
    epubPath = path.join(os.tmpdir(), `test-${Date.now()}.epub`);
    createTestEpub(epubPath);
  });

  afterAll(() => {
    if (fs.existsSync(epubPath)) fs.unlinkSync(epubPath);
  });

  test('正确解析元数据', () => {
    const book = parseEpub(epubPath);
    expect(book.title).toBe('测试书籍');
    expect(book.author).toBe('测试作者');
    expect(book.publisher).toBe('测试出版社');
    expect(book.language).toBe('zh-CN');
  });

  test('正确解析章节数量', () => {
    const book = parseEpub(epubPath);
    expect(book.chapters).toHaveLength(2);
  });

  test('章节按 spine 顺序', () => {
    const book = parseEpub(epubPath);
    expect(book.chapters[0].index).toBe(0);
    expect(book.chapters[1].index).toBe(1);
  });

  test('章节标题从 TOC 匹配', () => {
    const book = parseEpub(epubPath);
    expect(book.chapters[0].title).toBe('第一章 开始');
    expect(book.chapters[1].title).toBe('第二章 结束');
  });

  test('章节内容为纯文本（无 HTML 标签）', () => {
    const book = parseEpub(epubPath);
    expect(book.chapters[0].content).toContain('这是第一章的内容');
    expect(book.chapters[0].content).not.toContain('<p>');
    expect(book.chapters[0].content).not.toContain('<h1>');
  });

  test('HTML 实体被解码', () => {
    const book = parseEpub(epubPath);
    expect(book.chapters[0].content).toContain('Hello & World');
  });

  test('章节有 charCount', () => {
    const book = parseEpub(epubPath);
    expect(book.chapters[0].charCount).toBe(book.chapters[0].content.length);
    expect(book.chapters[0].charCount).toBeGreaterThan(0);
  });

  test('无效 EPUB（缺少 container.xml）抛错', () => {
    const badPath = path.join(os.tmpdir(), `bad-${Date.now()}.epub`);
    const zip = new AdmZip();
    zip.addFile('random.txt', Buffer.from('not an epub'));
    zip.writeZip(badPath);
    expect(() => parseEpub(badPath)).toThrow('container.xml');
    fs.unlinkSync(badPath);
  });

  test('文件不存在抛错', () => {
    expect(() => parseEpub('nonexistent.epub')).toThrow();
  });
});
