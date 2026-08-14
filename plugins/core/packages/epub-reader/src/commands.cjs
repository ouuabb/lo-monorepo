/**
 * commands — EPUB 阅读插件的 CLI 命令处理
 *
 * 通过 commands 扩展点注册，用户通过 `lo ext epub:<name>` 调用。
 * 命令 handler 签名：async run(args, ctx)，ctx 为 SDK PluginContext facade
 * （仅暴露 ctx.resources / ctx.relations / ctx.config / ctx.repoPath / ctx.logger，
 *  不允许插件直接触碰 lo Core Repository）。
 *
 * 命令列表：
 *   epub:open <rid>                 — 在浏览器中打开 Web 阅读器
 *   epub:info <rid>                 — 显示 EPUB 元信息与阅读状态
 *   epub:note <rid> [--quote <text>] — 创建笔记 Resource + 来源关系
 *   epub:notes <rid>                — 列出关联笔记
 *   epub:highlight <rid> <loc> <text> — 添加高亮
 *   epub:highlights <rid>           — 列出高亮
 *   epub:bookmark <rid> <loc> [title] — 添加书签
 *   epub:bookmarks <rid>            — 列出书签
 */

const path = require('path');
const readline = require('readline');
const { parseEpub } = require('./epubParser.cjs');
const { createStore } = require('./store.cjs');

/**
 * 获取数据目录路径（经 facade：ctx.config + ctx.repoPath）
 */
function getDataDir(ctx) {
  const configDataDir = ctx.config ? ctx.config('dataDir') : undefined;
  const dataDir = configDataDir || '.lo/plugins/epub-reader';
  if (path.isAbsolute(dataDir)) return dataDir;
  return path.join(ctx.repoPath, dataDir);
}

/**
 * 获取 EPUB 文件绝对路径（经 facade：ctx.repoPath）
 */
function getEpubFilePath(ctx, resource) {
  if (!resource) throw new Error('资源不存在');
  if (resource.type !== 'epub') throw new Error(`资源类型不是 epub: ${resource.type}`);
  const filePath = resource.path || resource.filePath || '';
  if (!filePath) throw new Error('资源缺少文件路径');
  return path.isAbsolute(filePath) ? filePath : path.join(ctx.repoPath, filePath);
}

// ── epub:info — 显示元信息 ──

async function info(args, ctx) {
  const logger = ctx.logger;
  const rid = args[0];
  if (!rid) {
    logger.info('用法: lo ext epub:info <rid>');
    return;
  }

  const resource = await ctx.resources.getByRid(rid);
  if (!resource) {
    logger.info('错误: 资源不存在');
    return;
  }
  const filePath = getEpubFilePath(ctx, resource);
  const book = parseEpub(filePath);

  logger.info(`\n《${book.title}》`);
  logger.info(`  作者: ${book.author || '未知'}`);
  logger.info(`  出版社: ${book.publisher || '未知'}`);
  logger.info(`  语言: ${book.language || '未知'}`);
  logger.info(`  章节: ${book.chapters.length}`);
  logger.info(`  总字数: ${book.chapters.reduce((s, c) => s + c.charCount, 0)}`);

  // 阅读状态
  const store = createStore(getDataDir(ctx));
  const state = await store.getReadingState(rid);
  if (state) {
    logger.info(`\n阅读状态:`);
    logger.info(`  进度: ${(state.progress * 100).toFixed(1)}%`);
    logger.info(`  位置: ${state.location}`);
    logger.info(`  更新: ${state.updatedAt}`);
  } else {
    logger.info('\n阅读状态: 尚未开始阅读');
  }

  // 标注统计
  const highlights = await store.getHighlights(rid);
  const bookmarks = await store.getBookmarks(rid);
  logger.info(`\n标注: ${highlights.length} 条高亮, ${bookmarks.length} 个书签`);

  // 章节列表
  logger.info(`\n目录:`);
  book.chapters.forEach((c, i) => {
    logger.info(`  ${i + 1}. ${c.title} (${c.charCount} 字)`);
  });
}

// ── epub:note — 创建笔记 ──

async function note(args, ctx) {
  const logger = ctx.logger;
  const rid = args[0];
  if (!rid) {
    logger.info('用法: lo ext epub:note <rid> [--quote <引用文本>] [--location <位置>]');
    return;
  }

  // 解析参数
  const quoteIdx = args.indexOf('--quote');
  const locIdx = args.indexOf('--location');
  const quote = quoteIdx >= 0 ? args[quoteIdx + 1] : '';
  const location = locIdx >= 0 ? args[locIdx + 1] : '';

  // 确认 EPUB 资源存在
  const epubResource = await ctx.resources.getByRid(rid);
  if (!epubResource) {
    logger.info('错误: EPUB 资源不存在');
    return;
  }

  // 读取笔记内容
  let content = '';
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    logger.info('请输入笔记内容（Markdown 格式，空行结束）:');
    const lines = [];
    await new Promise((resolve) => {
      rl.on('line', (line) => {
        if (line === '') {
          rl.close();
          resolve();
        } else {
          lines.push(line);
        }
      });
    });
    content = lines.join('\n');
  } else {
    // 非交互模式：从 stdin 读取
    content = await readStdin();
  }

  if (!content.trim()) {
    logger.info('笔记内容为空，已取消');
    return;
  }

  // 创建笔记 Resource（2.md §5.2 阅读笔记；内容走 metadata，与 HTTP reader 一致）
  const bookTitle = (epubResource.metadata && epubResource.metadata.title) || epubResource.title || epubResource.name || rid;
  const noteResource = await ctx.resources.create({
    type: 'note',
    name: `笔记: ${bookTitle}`,
    metadata: {
      title: bookTitle,
      sourceResource: rid,
      location: location,
      quote: quote,
      content: content,
    },
  });

  // 建立来源关系（2.md §9 数据关系）
  const noteRid = noteResource.rid || noteResource.id || noteResource;
  await ctx.relations.create({
    from_rid: rid,
    to_rid: noteRid,
    type: 'source-of',
    metadata: { location: location, quote: quote },
  });

  logger.info(`\n笔记已创建: ${noteRid}`);
  logger.info(`已关联到 EPUB: ${rid} (source-of)`);
}

// ── epub:notes — 列出关联笔记 ──

async function notes(args, ctx) {
  const logger = ctx.logger;
  const rid = args[0];
  if (!rid) {
    logger.info('用法: lo ext epub:notes <rid>');
    return;
  }

  // 通过 relations facade 查找 source-of 关系的笔记
  const noteRelations = await ctx.relations.getByFromRidAndType(rid, 'source-of');

  if (!noteRelations || noteRelations.length === 0) {
    logger.info('暂无关联笔记');
    return;
  }

  logger.info(`\n关联笔记 (${noteRelations.length} 条):\n`);
  for (const rel of noteRelations) {
    const noteRid = rel.to_rid;
    const note = await ctx.resources.getByRid(noteRid);
    const meta = note && note.metadata ? note.metadata : {};
    logger.info(`  ${noteRid}  ${note ? (note.title || note.name || '') : '(已删除)'}`);
    if (meta.quote) logger.info(`    引用: ${meta.quote.substring(0, 50)}...`);
    if (meta.location) logger.info(`    位置: ${meta.location}`);
    if (note && note.updatedAt) logger.info(`    时间: ${note.updatedAt}`);
    logger.info('');
  }
}

// ── epub:highlight — 添加高亮 ──

async function highlight(args, ctx) {
  const logger = ctx.logger;
  const rid = args[0];
  const location = args[1];
  const text = args.slice(2).join(' ');

  if (!rid || !location || !text) {
    logger.info('用法: lo ext epub:highlight <rid> <location> <text>');
    logger.info('  location 格式: epubcfi(<spineIndex>!<start>:<offset>,<end>:<offset>)');
    return;
  }

  const store = createStore(getDataDir(ctx));
  const entry = await store.addHighlight(rid, { location, text });
  logger.info(`高亮已添加: ${entry.id}`);
  logger.info(`  位置: ${entry.location}`);
  logger.info(`  文本: ${entry.text.substring(0, 50)}${entry.text.length > 50 ? '...' : ''}`);
}

// ── epub:highlights — 列出高亮 ──

async function highlights(args, ctx) {
  const logger = ctx.logger;
  const rid = args[0];
  if (!rid) {
    logger.info('用法: lo ext epub:highlights <rid>');
    return;
  }

  const store = createStore(getDataDir(ctx));
  const list = await store.getHighlights(rid);

  if (list.length === 0) {
    logger.info('暂无高亮');
    return;
  }

  logger.info(`\n高亮列表 (${list.length} 条):\n`);
  for (const h of list) {
    logger.info(`  [${h.id}] ${h.location}`);
    logger.info(`    ${h.text.substring(0, 80)}${h.text.length > 80 ? '...' : ''}`);
    if (h.note) logger.info(`    笔记: ${h.note}`);
    logger.info(`    时间: ${h.createdAt}`);
    logger.info('');
  }
}

// ── epub:bookmark — 添加书签 ──

async function bookmark(args, ctx) {
  const logger = ctx.logger;
  const rid = args[0];
  const location = args[1];
  const title = args.slice(2).join(' ') || '';

  if (!rid || !location) {
    logger.info('用法: lo ext epub:bookmark <rid> <location> [title]');
    return;
  }

  const store = createStore(getDataDir(ctx));
  const entry = await store.addBookmark(rid, { location, title });
  logger.info(`书签已添加: ${entry.id}`);
  logger.info(`  位置: ${entry.location}`);
  if (entry.title) logger.info(`  标题: ${entry.title}`);
}

// ── epub:bookmarks — 列出书签 ──

async function bookmarks(args, ctx) {
  const logger = ctx.logger;
  const rid = args[0];
  if (!rid) {
    logger.info('用法: lo ext epub:bookmarks <rid>');
    return;
  }

  const store = createStore(getDataDir(ctx));
  const list = await store.getBookmarks(rid);

  if (list.length === 0) {
    logger.info('暂无书签');
    return;
  }

  logger.info(`\n书签列表 (${list.length} 个):\n`);
  for (const b of list) {
    logger.info(`  [${b.id}] ${b.location}`);
    if (b.title) logger.info(`    ${b.title}`);
    logger.info(`    时间: ${b.createdAt}`);
    logger.info('');
  }
}

// ── 工具函数 ──

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

// ── epub:open — 浏览器打开 Web 阅读器 ──

async function open(args, ctx) {
  const logger = ctx.logger;
  const rid = args[0];
  if (!rid) {
    logger.info('用法: lo ext epub:open <rid>');
    return;
  }

  // 确认资源存在
  const resource = await ctx.resources.getByRid(rid);
  if (!resource) {
    logger.info('错误: 资源不存在');
    return;
  }
  if (resource.type !== 'epub') {
    logger.info(`错误: 资源类型不是 epub: ${resource.type}`);
    return;
  }

  // 阅读器地址经配置下发，不在插件内硬编码端口
  const readerBaseUrl = (ctx.config && ctx.config('readerBaseUrl')) || 'http://127.0.0.1:8765';
  const url = `${readerBaseUrl.replace(/\/$/, '')}/api/plugins/epub-reader/reader?rid=${rid}`;
  const { exec } = require('child_process');
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, (err) => {
    if (err) {
      logger.info(`无法自动打开浏览器，请手动访问:\n  ${url}`);
    } else {
      logger.info(`已在浏览器中打开: ${resource.title || resource.name || rid}`);
    }
  });
}

// ── 命令注册表 ──

const commands = {
  'epub:open':      { run: open,       description: '在浏览器中打开 Web 阅读器' },
  'epub:info':      { run: info,       description: '显示 EPUB 元信息与阅读状态' },
  'epub:note':      { run: note,       description: '创建阅读笔记 Resource 并关联到 EPUB' },
  'epub:notes':     { run: notes,      description: '列出 EPUB 的关联笔记' },
  'epub:highlight': { run: highlight,  description: '添加高亮标注' },
  'epub:highlights':{ run: highlights, description: '列出高亮标注' },
  'epub:bookmark':  { run: bookmark,   description: '添加书签' },
  'epub:bookmarks': { run: bookmarks,  description: '列出书签' },
};

module.exports = { commands, getDataDir, getEpubFilePath };
