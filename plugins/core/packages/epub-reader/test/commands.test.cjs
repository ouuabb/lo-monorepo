/**
 * commands 单元测试
 *
 * 测试 EPUB 阅读插件的 8 个 CLI 命令 handler：
 *   epub:open / epub:info / epub:note / epub:notes
 *   epub:highlight / epub:highlights / epub:bookmark / epub:bookmarks
 *
 * Mock 策略：
 *   - store.cjs 的 createStore → 内存假 store
 *   - epubParser.cjs 的 parseEpub → 假 book
 *   - ctx（SDK PluginContext facade）: resources / relations / config / repoPath / logger
 *   - child_process.exec → jest.fn 假对象
 */

const path = require('path');

jest.mock('readline', () => ({
  createInterface: jest.fn(),
}));

jest.mock('../src/store.cjs', () => ({
  createStore: jest.fn(),
}));

jest.mock('../src/epubParser.cjs', () => ({
  parseEpub: jest.fn(),
}));

const { commands, getDataDir, getEpubFilePath } = require('../src/commands.cjs');
const store = require('../src/store.cjs');
const { parseEpub } = require('../src/epubParser.cjs');
const childProcess = require('child_process');
const { EventEmitter } = require('events');

// ── 测试数据 ──

const fakeBook = {
  title: '测试书',
  author: '作者',
  publisher: '出版社',
  language: 'zh-CN',
  chapters: [
    { title: '第一章', charCount: 100 },
    { title: '第二章', charCount: 200 },
  ],
};

// ── Mock 工厂 ──

function createMockStore() {
  const data = { readingState: null, highlights: [], bookmarks: [] };
  const s = {
    _data: data,
    getReadingState: jest.fn(async () => data.readingState),
    getHighlights: jest.fn(async () => data.highlights),
    getBookmarks: jest.fn(async () => data.bookmarks),
    addHighlight: jest.fn(async (rid, h) => {
      const entry = {
        id: 'hl_1',
        ...h,
        style: 'yellow',
        note: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      data.highlights.push(entry);
      return entry;
    }),
    addBookmark: jest.fn(async (rid, b) => {
      const entry = {
        id: 'bm_1',
        ...b,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      data.bookmarks.push(entry);
      return entry;
    }),
  };
  store.createStore.mockReturnValue(s);
  return s;
}

/**
 * SDK PluginContext facade mock
 * 与 lo Core 的 PluginContext 公共接口一致：
 *   ctx.logger / ctx.config / ctx.repoPath
 *   ctx.resources.{getByRid, create}
 *   ctx.relations.{create, getByFromRidAndType}
 */
function createMockCtx(overrides = {}) {
  const resources = overrides._resources || new Map();
  const relations = overrides._relations || [];
  const config = overrides._config || {};

  const ctx = {
    repoPath: path.join('C:', 'test', 'lo-repo'),
    logger: createMockLogger(),
    config(key, defaultValue) {
      return config[key] !== undefined ? config[key] : defaultValue;
    },
    resources: {
      getByRid: jest.fn(async (rid) => resources.get(rid) || null),
      create: jest.fn(async (candidate) => {
        const resource = { rid: 'note-001', ...candidate };
        resources.set(resource.rid, resource);
        return resource;
      }),
    },
    relations: {
      create: jest.fn(async (candidate) => {
        const rel = { id: String(relations.length + 1), ...candidate };
        relations.push(rel);
        return rel;
      }),
      getByFromRidAndType: jest.fn(async (fromRid, type) =>
        relations.filter(r => r.from_rid === fromRid && r.type === type)
      ),
    },
  };

  if (overrides.logger) ctx.logger = overrides.logger;

  return ctx;
}

function createMockLogger() {
  return {
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function epubResource(overrides = {}) {
  return {
    rid: 'res-1',
    type: 'epub',
    name: 'book.epub',
    title: '测试书',
    path: path.join('C:', 'books', 'book.epub'),
    metadata: { title: '测试书', author: '作者' },
    ...overrides,
  };
}

// 非 TTY stdin：读 stdin 时喂入 data + end
// 注意 process.stdin 是 configurable getter，直接赋值无效，需 defineProperty 覆盖
const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');

function overrideStdin(value) {
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function restoreStdin() {
  Object.defineProperty(process, 'stdin', stdinDescriptor);
}

function setupNonTTYStdin(data) {
  const fake = new EventEmitter();
  fake.setEncoding = jest.fn();
  fake.isTTY = false;
  overrideStdin(fake);
  return {
    restore: restoreStdin,
    feed() {
      setImmediate(() => {
        fake.emit('data', data);
        fake.emit('end');
      });
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  parseEpub.mockReturnValue(fakeBook);
});

// ── getDataDir / getEpubFilePath ──

describe('getDataDir / getEpubFilePath', () => {
  const ctx = createMockCtx();

  test('getDataDir 基于 repoPath 拼接', () => {
    expect(getDataDir(ctx)).toBe(path.join(ctx.repoPath, '.lo', 'plugins', 'epub-reader'));
  });

  test('getDataDir 支持自定义 dataDir 相对路径', () => {
    const c = createMockCtx({ _config: { dataDir: 'custom/epub' } });
    expect(getDataDir(c)).toBe(path.join(c.repoPath, 'custom', 'epub'));
  });

  test('getDataDir 支持绝对路径 dataDir', () => {
    const abs = path.join(__dirname, 'custom', 'data');
    const c = createMockCtx({ _config: { dataDir: abs } });
    expect(getDataDir(c)).toBe(abs);
  });

  test('getEpubFilePath: 资源不存在抛错', () => {
    expect(() => getEpubFilePath(ctx, null)).toThrow('资源不存在');
    expect(() => getEpubFilePath(ctx, undefined)).toThrow('资源不存在');
  });

  test('getEpubFilePath: 非 epub 类型抛错', () => {
    expect(() => getEpubFilePath(ctx, { type: 'note', path: 'x' })).toThrow('资源类型不是 epub');
  });

  test('getEpubFilePath: 缺少文件路径抛错', () => {
    expect(() => getEpubFilePath(ctx, { type: 'epub' })).toThrow('资源缺少文件路径');
  });

  test('getEpubFilePath: 绝对路径原样返回', () => {
    const abs = path.join(__dirname, 'books', 'a.epub');
    expect(getEpubFilePath(ctx, { type: 'epub', path: abs })).toBe(abs);
  });

  test('getEpubFilePath: 相对路径拼接到 repoPath', () => {
    const rel = 'books/a.epub';
    expect(getEpubFilePath(ctx, { type: 'epub', path: rel }))
      .toBe(path.join(ctx.repoPath, rel));
  });

  test('getEpubFilePath: 回退到 filePath 字段', () => {
    const abs = path.join(__dirname, 'books', 'b.epub');
    expect(getEpubFilePath(ctx, { type: 'epub', filePath: abs })).toBe(abs);
  });
});

// ── epub:info ──

describe('epub:info', () => {
  test('无参数时打印用法', async () => {
    const ctx = createMockCtx();
    await commands['epub:info'].run([], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith('用法: lo ext epub:info <rid>');
    expect(ctx.resources.getByRid).not.toHaveBeenCalled();
  });

  test('打印书籍元信息与阅读状态', async () => {
    const resources = new Map([['res-1', epubResource()]]);
    const ctx = createMockCtx({ _resources: resources });
    const storeMock = createMockStore();
    storeMock._data.readingState = { location: 'epubcfi(2!/2:0,/2:0)', progress: 0.5, updatedAt: '2026-01-01T00:00:00.000Z' };
    storeMock._data.highlights = [{ id: 'h1', location: 'l1', text: 't', createdAt: 'c' }];
    storeMock._data.bookmarks = [{ id: 'b1', location: 'l2', createdAt: 'c' }];

    await commands['epub:info'].run(['res-1'], ctx);

    expect(parseEpub).toHaveBeenCalled();
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('《测试书》'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('作者'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('出版社'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('语言'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('章节'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('300'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('50.0%'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('1 条高亮, 1 个书签'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('第一章'));
  });

  test('未开始阅读时提示', async () => {
    const resources = new Map([['res-1', epubResource()]]);
    const ctx = createMockCtx({ _resources: resources });
    createMockStore();

    await commands['epub:info'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith('\n阅读状态: 尚未开始阅读');
  });
});

// ── epub:open ──

describe('epub:open', () => {
  test('无参数时打印用法', async () => {
    const ctx = createMockCtx();
    await commands['epub:open'].run([], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith('用法: lo ext epub:open <rid>');
  });

  test('资源不存在时报错', async () => {
    const ctx = createMockCtx();
    await commands['epub:open'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith('错误: 资源不存在');
  });

  test('非 epub 类型时报错', async () => {
    const resources = new Map([['res-1', { rid: 'res-1', type: 'note' }]]);
    const ctx = createMockCtx({ _resources: resources });
    await commands['epub:open'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('资源类型不是 epub'));
  });

  test('有效资源时调用浏览器打开', async () => {
    const resources = new Map([['res-1', epubResource()]]);
    const ctx = createMockCtx({ _resources: resources });
    let capturedCmd = null;
    const spy = jest.spyOn(childProcess, 'exec').mockImplementation((cmd, cb) => {
      capturedCmd = cmd;
      cb(null);
    });

    await commands['epub:open'].run(['res-1'], ctx);

    expect(capturedCmd).toContain('res-1');
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('已在浏览器中打开'));
    spy.mockRestore();
  });

  test('自定义 readerBaseUrl 配置生效', async () => {
    const resources = new Map([['res-1', epubResource()]]);
    const ctx = createMockCtx({ _resources: resources, _config: { readerBaseUrl: 'http://127.0.0.1:9999/' } });
    let capturedCmd = null;
    const spy = jest.spyOn(childProcess, 'exec').mockImplementation((cmd, cb) => {
      capturedCmd = cmd;
      cb(null);
    });

    await commands['epub:open'].run(['res-1'], ctx);

    expect(capturedCmd).toContain('9999');
    spy.mockRestore();
  });

  test('exec 失败时提示手动访问', async () => {
    const resources = new Map([['res-1', epubResource()]]);
    const ctx = createMockCtx({ _resources: resources });
    const spy = jest.spyOn(childProcess, 'exec').mockImplementation((cmd, cb) => {
      cb(new Error('spawn failed'));
    });

    await commands['epub:open'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('无法自动打开浏览器'));
    spy.mockRestore();
  });
});

// ── epub:note ──

describe('epub:note', () => {
  test('无参数时打印用法', async () => {
    const ctx = createMockCtx();
    await commands['epub:note'].run([], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('用法'));
    expect(ctx.resources.create).not.toHaveBeenCalled();
  });

  test('EPUB 资源不存在时报错', async () => {
    const ctx = createMockCtx();
    const stdinMock = setupNonTTYStdin('笔记内容');
    const p = commands['epub:note'].run(['res-1'], ctx);
    stdinMock.feed();
    await p;
    stdinMock.restore();

    expect(ctx.logger.info).toHaveBeenCalledWith('错误: EPUB 资源不存在');
    expect(ctx.resources.create).not.toHaveBeenCalled();
  });

  test('从非交互 stdin 读取内容并创建笔记 Resource + 关系', async () => {
    const resources = new Map([['res-1', epubResource()]]);
    const ctx = createMockCtx({ _resources: resources });
    const stdinMock = setupNonTTYStdin('这是笔记内容');
    const p = commands['epub:note'].run(['res-1'], ctx);
    stdinMock.feed();
    await p;
    stdinMock.restore();

    expect(ctx.resources.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'note',
        name: '笔记: 测试书',
        metadata: expect.objectContaining({
          sourceResource: 'res-1',
          content: '这是笔记内容',
        }),
      })
    );
    expect(ctx.relations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        from_rid: 'res-1',
        to_rid: 'note-001',
        type: 'source-of',
        metadata: expect.objectContaining({ location: '', quote: '' }),
      })
    );
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('笔记已创建: note-001'));
  });

  test('--quote / --location 参数透传到 metadata 与关系', async () => {
    const resources = new Map([['res-1', epubResource()]]);
    const ctx = createMockCtx({ _resources: resources });
    const stdinMock = setupNonTTYStdin('内容');
    const args = ['res-1', '--quote', '引用文本', '--location', 'epubcfi(2!/2:0,/2:0)'];
    const p = commands['epub:note'].run(args, ctx);
    stdinMock.feed();
    await p;
    stdinMock.restore();

    const createCall = ctx.resources.create.mock.calls[0][0];
    expect(createCall.metadata.quote).toBe('引用文本');
    expect(createCall.metadata.location).toBe('epubcfi(2!/2:0,/2:0)');

    const relCall = ctx.relations.create.mock.calls[0][0];
    expect(relCall.metadata.quote).toBe('引用文本');
    expect(relCall.metadata.location).toBe('epubcfi(2!/2:0,/2:0)');
  });

  test('交互模式（TTY）通过 readline 读取多行', async () => {
    const rl = new EventEmitter();
    rl.close = jest.fn();
    require('readline').createInterface.mockReturnValue(rl);

    const resources = new Map([['res-1', epubResource()]]);
    const ctx = createMockCtx({ _resources: resources });
    overrideStdin({ isTTY: true });
    const p = commands['epub:note'].run(['res-1'], ctx);
    setImmediate(() => {
      rl.emit('line', '第一行');
      rl.emit('line', '第二行');
      rl.emit('line', '');
    });
    await p;
    restoreStdin();

    const call = ctx.resources.create.mock.calls[0][0];
    expect(call.metadata.content).toBe('第一行\n第二行');
    expect(rl.close).toHaveBeenCalled();
  });

  test('内容为空时取消创建', async () => {
    const resources = new Map([['res-1', epubResource()]]);
    const ctx = createMockCtx({ _resources: resources });
    const stdinMock = setupNonTTYStdin('   \n');
    const p = commands['epub:note'].run(['res-1'], ctx);
    stdinMock.feed();
    await p;
    stdinMock.restore();

    expect(ctx.logger.info).toHaveBeenCalledWith('笔记内容为空，已取消');
    expect(ctx.resources.create).not.toHaveBeenCalled();
  });
});

// ── epub:notes ──

describe('epub:notes', () => {
  test('无参数时打印用法', async () => {
    const ctx = createMockCtx();
    await commands['epub:notes'].run([], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith('用法: lo ext epub:notes <rid>');
  });

  test('无 source-of 关系时提示暂无笔记', async () => {
    const relations = [{ id: '1', from_rid: 'res-1', to_rid: 'note-x', type: 'highlight-of' }];
    const ctx = createMockCtx({ _relations: relations });
    await commands['epub:notes'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith('暂无关联笔记');
  });

  test('列出关联笔记', async () => {
    const relations = [{ id: '1', from_rid: 'res-1', to_rid: 'note-1', type: 'source-of', metadata: {} }];
    const resources = new Map([[
      'note-1',
      { rid: 'note-1', title: '笔记标题', metadata: { quote: '引用原文内容', location: 'epubcfi(2!/2:0,/2:0)' }, updatedAt: '2026-01-01T00:00:00.000Z' },
    ]]);
    const ctx = createMockCtx({ _relations: relations, _resources: resources });

    await commands['epub:notes'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('关联笔记 (1 条)'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('note-1'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('引用原文内容'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('epubcfi(2!/2:0,/2:0)'));
  });

  test('笔记资源已删除时显示 (已删除)', async () => {
    const relations = [{ id: '1', from_rid: 'res-1', to_rid: 'note-gone', type: 'source-of' }];
    const ctx = createMockCtx({ _relations: relations });

    await commands['epub:notes'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('(已删除)'));
  });
});

// ── epub:highlight ──

describe('epub:highlight', () => {
  test('参数缺失时打印用法', async () => {
    const ctx = createMockCtx();
    await commands['epub:highlight'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('用法'));
  });

  test('添加高亮', async () => {
    const ctx = createMockCtx();
    createMockStore();

    await commands['epub:highlight'].run(['res-1', 'epubcfi(2!/2:0,/2:0)', '高亮文本'], ctx);

    expect(store.createStore).toHaveBeenCalled();
    expect(ctx.logger.info).toHaveBeenCalledWith('高亮已添加: hl_1');
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('epubcfi(2!/2:0,/2:0)'));
  });
});

// ── epub:highlights ──

describe('epub:highlights', () => {
  test('无参数时打印用法', async () => {
    const ctx = createMockCtx();
    await commands['epub:highlights'].run([], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith('用法: lo ext epub:highlights <rid>');
  });

  test('无高亮时提示', async () => {
    const ctx = createMockCtx();
    createMockStore();

    await commands['epub:highlights'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith('暂无高亮');
  });

  test('列出高亮', async () => {
    const ctx = createMockCtx();
    const storeMock = createMockStore();
    storeMock._data.highlights = [
      { id: 'h1', location: 'loc-1', text: '文本内容', note: '', createdAt: '2026-01-01T00:00:00.000Z' },
    ];

    await commands['epub:highlights'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('高亮列表 (1 条)'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('[h1] loc-1'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('文本内容'));
  });
});

// ── epub:bookmark ──

describe('epub:bookmark', () => {
  test('参数缺失时打印用法', async () => {
    const ctx = createMockCtx();
    await commands['epub:bookmark'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('用法'));
  });

  test('添加书签', async () => {
    const ctx = createMockCtx();
    createMockStore();

    await commands['epub:bookmark'].run(['res-1', 'epubcfi(2!/2:0,/2:0)', '我的书签'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith('书签已添加: bm_1');
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('我的书签'));
  });
});

// ── epub:bookmarks ──

describe('epub:bookmarks', () => {
  test('无参数时打印用法', async () => {
    const ctx = createMockCtx();
    await commands['epub:bookmarks'].run([], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith('用法: lo ext epub:bookmarks <rid>');
  });

  test('无书签时提示', async () => {
    const ctx = createMockCtx();
    createMockStore();

    await commands['epub:bookmarks'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith('暂无书签');
  });

  test('列出书签', async () => {
    const ctx = createMockCtx();
    const storeMock = createMockStore();
    storeMock._data.bookmarks = [
      { id: 'b1', location: 'loc-1', title: '章节标题', createdAt: '2026-01-01T00:00:00.000Z' },
    ];

    await commands['epub:bookmarks'].run(['res-1'], ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('书签列表 (1 个)'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('[b1] loc-1'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('章节标题'));
  });
});

// ── 命令注册表 ──

describe('commands 注册表', () => {
  test('注册 8 个 CLI 命令', () => {
    expect(Object.keys(commands)).toHaveLength(8);
    for (const [key, entry] of Object.entries(commands)) {
      expect(typeof entry.run).toBe('function');
      expect(typeof entry.description).toBe('string');
    }
  });

  test('命令键名符合 epub: 前缀约定', () => {
    const keys = Object.keys(commands).sort();
    expect(keys).toEqual([
      'epub:bookmark', 'epub:bookmarks', 'epub:highlight', 'epub:highlights',
      'epub:info', 'epub:note', 'epub:notes', 'epub:open',
    ]);
  });
});