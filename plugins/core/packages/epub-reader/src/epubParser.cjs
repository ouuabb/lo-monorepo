/**
 * epubParser — EPUB 解析纯函数模块
 *
 * 解析流程：
 *   1. adm-zip 打开 EPUB
 *   2. META-INF/container.xml → 找到 OPF 路径
 *   3. OPF → metadata + manifest + spine
 *   4. NCX (EPUB2) 或 Nav (EPUB3) → 目录结构
 *   5. 按 spine 顺序提取 XHTML → 纯文本
 *
 * 定位（原文定位）：
 *   使用 EPUB CFI（Canonical Fragment Identifier）作为定位标识，
 *   格式：epubcfi(<spineIndex>!<startPath>:<startOffset>,<endPath>:<endOffset>)
 *   不依赖页码/屏幕位置，排版变化不影响定位
 */

const AdmZip = require('adm-zip');
const path = require('path');

/**
 * 解析 EPUB 文件，提取元数据和章节内容
 * @param {string} filePath — EPUB 文件路径
 * @returns {{title, author, publisher, language, chapters: Array}}
 */
function parseEpub(filePath) {
  const zip = new AdmZip(filePath);

  // 1. container.xml → OPF 路径
  const containerEntry = zip.getEntry('META-INF/container.xml');
  if (!containerEntry) {
    throw new Error('无效的 EPUB 文件：缺少 META-INF/container.xml');
  }
  const containerXml = containerEntry.getData().toString('utf8');
  const opfPath = findOpfPath(containerXml);
  if (!opfPath) {
    throw new Error('无法在 container.xml 中找到 OPF 文件路径');
  }

  // 2. 解析 OPF
  const opfEntry = zip.getEntry(opfPath);
  if (!opfEntry) {
    throw new Error(`OPF 文件不存在: ${opfPath}`);
  }
  const opfContent = opfEntry.getData().toString('utf8');
  const opfDir = path.posix.dirname(opfPath);
  const { metadata, manifest, spine } = parseOpf(opfContent);

  // 3. 解析目录
  const toc = parseToc(zip, manifest, opfDir);

  // 4. 按 spine 顺序提取章节
  const chapters = [];
  for (let i = 0; i < spine.length; i++) {
    const item = manifest[spine[i]];
    if (!item) continue;
    // 跳过非 XHTML 项目（如图片）
    if (item.mediaType && item.mediaType !== 'application/xhtml+xml' &&
        item.mediaType !== 'text/html') {
      continue;
    }

    const chapterPath = normalizePath(path.posix.join(opfDir, item.href));
    const entry = zip.getEntry(chapterPath);
    if (!entry) continue;

    const xhtml = entry.getData().toString('utf8');
    const text = extractTextFromXhtml(xhtml);

    // 从 toc 匹配章节标题
    const tocItem = toc.find(t => {
      const tocSrc = t.src.split('#')[0];
      return tocSrc === item.href || tocSrc === chapterPath;
    });

    chapters.push({
      index: i,
      id: item.id,
      title: tocItem ? tocItem.title : `Chapter ${i + 1}`,
      href: item.href,
      content: text,
      charCount: text.length,
    });
  }

  return {
    title: metadata.title || path.basename(filePath, '.epub'),
    author: metadata.creator || '',
    publisher: metadata.publisher || '',
    language: metadata.language || '',
    chapters,
  };
}

/**
 * 从 container.xml 提取 OPF 文件路径
 */
function findOpfPath(containerXml) {
  // <rootfile full-path="OEBPS/content.opf" .../>
  const match = containerXml.match(/full-path="([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * 解析 OPF 文件，提取 metadata、manifest、spine
 */
function parseOpf(opfContent) {
  return {
    metadata: parseOpfMetadata(opfContent),
    manifest: parseOpfManifest(opfContent),
    spine: parseOpfSpine(opfContent),
  };
}

/**
 * 解析 OPF metadata（dc:title, dc:creator, dc:publisher, dc:language）
 */
function parseOpfMetadata(opfContent) {
  const metadata = {};

  // dc:title
  const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]*)<\/dc:title>/i);
  if (titleMatch) metadata.title = decodeXmlEntities(titleMatch[1].trim());

  // dc:creator（可能有多个，取第一个）
  const creatorMatch = opfContent.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/i);
  if (creatorMatch) metadata.creator = decodeXmlEntities(creatorMatch[1].trim());

  // dc:publisher
  const publisherMatch = opfContent.match(/<dc:publisher[^>]*>([^<]*)<\/dc:publisher>/i);
  if (publisherMatch) metadata.publisher = decodeXmlEntities(publisherMatch[1].trim());

  // dc:language
  const langMatch = opfContent.match(/<dc:language[^>]*>([^<]*)<\/dc:language>/i);
  if (langMatch) metadata.language = langMatch[1].trim();

  return metadata;
}

/**
 * 解析 OPF manifest，返回 { id: { id, href, mediaType } }
 */
function parseOpfManifest(opfContent) {
  const manifest = {};
  const itemRegex = /<item\s[^>]*>/gi;
  let match;
  while ((match = itemRegex.exec(opfContent)) !== null) {
    const itemTag = match[0];
    const id = extractAttr(itemTag, 'id');
    const href = extractAttr(itemTag, 'href');
    const mediaType = extractAttr(itemTag, 'media-type');
    if (id) {
      manifest[id] = { id, href, mediaType };
    }
  }
  return manifest;
}

/**
 * 解析 OPF spine，返回 idref 数组（阅读顺序）
 */
function parseOpfSpine(opfContent) {
  const spine = [];
  const itemrefRegex = /<itemref\s[^>]*>/gi;
  let match;
  while ((match = itemrefRegex.exec(opfContent)) !== null) {
    const idref = extractAttr(match[0], 'idref');
    if (idref) spine.push(idref);
  }
  return spine;
}

/**
 * 解析目录（NCX 或 Nav），返回 [{ title, src }]
 */
function parseToc(zip, manifest, opfDir) {
  // EPUB2: 找 NCX（manifest 中 media-type=application/x-dtbncx+xml）
  let ncxItem = null;
  for (const id in manifest) {
    if (manifest[id].mediaType === 'application/x-dtbncx+xml') {
      ncxItem = manifest[id];
      break;
    }
  }
  if (ncxItem) {
    const ncxPath = normalizePath(path.posix.join(opfDir, ncxItem.href));
    const entry = zip.getEntry(ncxPath);
    if (entry) {
      const ncxContent = entry.getData().toString('utf8');
      return parseNcx(ncxContent);
    }
  }

  // EPUB3: 找 Nav（manifest 中 properties=nav）
  for (const id in manifest) {
    const item = manifest[id];
    if (item.properties && item.properties.includes('nav')) {
      const navPath = normalizePath(path.posix.join(opfDir, item.href));
      const entry = zip.getEntry(navPath);
      if (entry) {
        const navContent = entry.getData().toString('utf8');
        return parseNav(navContent);
      }
    }
  }

  return [];
}

/**
 * 解析 NCX（EPUB2 目录格式）
 */
function parseNcx(ncxContent) {
  const toc = [];
  // <navLabel><text>标题</text></navLabel><content src="chapter1.xhtml"/>
  const pointRegex = /<navPoint\s[^>]*>[\s\S]*?<\/navPoint>/gi;
  let match;
  while ((match = pointRegex.exec(ncxContent)) !== null) {
    const block = match[0];
    const labelMatch = block.match(/<text>([^<]*)<\/text>/i);
    const srcMatch = block.match(/<content\s[^>]*src="([^"]+)"/i);
    if (labelMatch && srcMatch) {
      toc.push({
        title: decodeXmlEntities(labelMatch[1].trim()),
        src: srcMatch[1],
      });
    }
  }
  return toc;
}

/**
 * 解析 Nav（EPUB3 目录格式）
 */
function parseNav(navContent) {
  const toc = [];
  // <li><a href="chapter1.xhtml">标题</a></li>
  const linkRegex = /<a\s[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(navContent)) !== null) {
    toc.push({
      title: decodeXmlEntities(match[2].trim()),
      src: match[1],
    });
  }
  return toc;
}

/**
 * 从 XHTML 提取纯文本
 * - 去掉所有 HTML 标签
 * - 块级元素后加换行
 * - 解码 HTML 实体
 */
function extractTextFromXhtml(xhtml) {
  let text = xhtml;

  // 去掉 <?xml ...?> 和 <!DOCTYPE ...>
  text = text.replace(/<\?xml[^>]*\?>/gi, '');
  text = text.replace(/<!DOCTYPE[^>]*>/gi, '');

  // 去掉 <head>...</head>（样式、脚本等）
  text = text.replace(/<head[\s\S]*?<\/head>/gi, '');

  // 去掉 <script> 和 <style>
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');

  // 块级标签后加换行
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // 去掉所有剩余标签
  text = text.replace(/<[^>]+>/g, '');

  // 解码 HTML 实体
  text = decodeHtmlEntities(text);

  // 压缩多余空行
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * 解码 XML/HTML 实体
 */
function decodeXmlEntities(str) {
  return decodeHtmlEntities(str);
}

function decodeHtmlEntities(str) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
    '&#39;': "'",
    '&hellip;': '…',
    '&mdash;': '—',
    '&ndash;': '–',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': "'",
    '&rsquo;': "'",
  };
  return str.replace(/&[a-z#0-9]+;/gi, m => entities[m] || m);
}

/**
 * 从 HTML 标签中提取属性值
 */
function extractAttr(tag, attrName) {
  const regex = new RegExp(`\\b${attrName}\\s*=\\s*"([^"]*)"`, 'i');
  const match = tag.match(regex);
  return match ? match[1] : null;
}

/**
 * 规范化路径（处理 ./ 和 ../ 等）
 */
function normalizePath(p) {
  return path.posix.normalize(p).replace(/^\.\//, '');
}

module.exports = {
  parseEpub,
  findOpfPath,
  parseOpf,
  parseOpfMetadata,
  parseOpfManifest,
  parseOpfSpine,
  parseToc,
  parseNcx,
  parseNav,
  extractTextFromXhtml,
  decodeHtmlEntities,
  extractAttr,
  normalizePath,
};
