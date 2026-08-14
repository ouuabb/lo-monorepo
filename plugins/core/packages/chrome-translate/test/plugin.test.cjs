/**
 * chrome-translate 插件单元测试
 *
 * 覆盖：
 *   1. 插件基本信息（manifest、providerId）
 *   2. discover 通道：文件读取 → 候选转换
 *   3. HTTP 通道：POST → 写入 + 响应
 *   4. 去重：相同 recordId 不重复创建
 *   5. 补录：discover 发现 HTTP 通道遗漏的记录
 *   6. 边缘：空文件、无效格式、缺字段
 */

const fs = require('fs-extra');
const nativeFs = require('fs');
const { EventEmitter } = require('events');
const path = require('path');
const os = require('os');

const ChromeTranslatePlugin = require('../src/plugin.cjs');

// Mock PluginContext
function createMockContext(existingResources = []) {
  const resources = [...existingResources];
  return {
    config: () => ({ exportFilePath: '' }),
    logger: { info: () => {}, log: () => {}, error: () => {}, debug: () => {}, warn: () => {} },
    extensions: { register: () => {} },
    resources: {
      async create(candidate) {
        const rid = 'res_' + Math.random().toString(36).slice(2, 10);
        const resource = {
          rid,
          type: candidate.type,
          name: candidate.name,
          metadata: candidate.metadata || {},
        };
        resources.push(resource);
        return resource;
      },
      async list(filter) {
        if (filter && filter.type) {
          return resources.filter(r => r.type === filter.type);
        }
        return resources;
      },
    },
    hooks: { register: () => {} },
    events: { on: () => {}, emit: () => {} },
  };
}

// 测试数据
function makeRecord(overrides = {}) {
  return {
    recordId: 'tr_test_' + Math.random().toString(36).slice(2, 8),
    original: 'hello',
    translation: '你好',
    sourceLang: 'en',
    targetLang: 'zh',
    context: 'hello world',
    url: 'https://example.com/page',
    pageTitle: 'Example',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('ChromeTranslatePlugin', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-ct-'));
  });

  afterEach(async () => {
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  // ── 1. 插件基本信息 ──

  test('manifest 返回正确信息', () => {
    const plugin = new ChromeTranslatePlugin();
    const m = plugin.manifest();
    expect(m.id).toBe('chrome-translate');
    expect(m.name).toBe('Chrome 划词翻译');
    expect(m.role).toBe('discovery');
    expect(m.extensions).toContain('resourceProviders');
    expect(m.extensions).toContain('commands');
  });

  test('providerId 返回 manifest id', () => {
    const plugin = new ChromeTranslatePlugin();
    expect(plugin.providerId).toBe('chrome-translate');
  });

  test('supports 只接受 .json 文件', () => {
    const plugin = new ChromeTranslatePlugin();
    expect(plugin.supports('/path/to/records.json')).toBe(true);
    expect(plugin.supports('/path/to/records.txt')).toBe(false);
    expect(plugin.supports('')).toBe(false);
    expect(plugin.supports(null)).toBe(false);
  });

  // ── 2. discover 通道 ──

  test('discover 从 JSON 文件读取翻译记录', async () => {
    const records = [makeRecord(), makeRecord({ original: 'world', translation: '世界' })];
    const filePath = path.join(tempDir, 'records.json');
    await fs.writeFile(filePath, JSON.stringify(records));

    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const candidates = await plugin.discover(ctx, filePath);

    expect(candidates.length).toBe(2);
    expect(candidates[0].type).toBe('vocabulary');
    expect(candidates[0].name).toBe('hello');
    expect(candidates[0].metadata.recordId).toBe(records[0].recordId);
    expect(candidates[0].metadata.translation).toBe('你好');
  });

  test('discover 空文件返回空数组', async () => {
    const filePath = path.join(tempDir, 'empty.json');
    await fs.writeFile(filePath, '[]');

    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const candidates = await plugin.discover(ctx, filePath);
    expect(candidates).toEqual([]);
  });

  test('discover 文件不存在返回空数组', async () => {
    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const candidates = await plugin.discover(ctx, '/nonexistent/path.json');
    expect(candidates).toEqual([]);
  });

  test('discover 未配置文件路径时抛错', async () => {
    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    await expect(plugin.discover(ctx, '')).rejects.toThrow(/未配置导出文件路径/);
  });

  test('discover 无效 JSON 抛错', async () => {
    const filePath = path.join(tempDir, 'invalid.json');
    await fs.writeFile(filePath, '{invalid json');

    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    await expect(plugin.discover(ctx, filePath)).rejects.toThrow(/解析失败/);
  });

  // ── 3. 去重 ──

  test('discover 跳过已存在的 recordId', async () => {
    const record = makeRecord();
    const filePath = path.join(tempDir, 'records.json');
    await fs.writeFile(filePath, JSON.stringify([record]));

    // 模拟已有一个同 recordId 的 Resource
    const existing = [{
      rid: 'res_existing',
      type: 'vocabulary',
      name: record.original,
      metadata: { recordId: record.recordId },
    }];
    const ctx = createMockContext(existing);

    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const candidates = await plugin.discover(ctx, filePath);
    expect(candidates.length).toBe(0); // 已存在，跳过
  });

  test('discover 只补录缺失的记录', async () => {
    const r1 = makeRecord({ original: 'hello' });
    const r2 = makeRecord({ original: 'world' });
    const r3 = makeRecord({ original: 'foo' });

    const filePath = path.join(tempDir, 'records.json');
    await fs.writeFile(filePath, JSON.stringify([r1, r2, r3]));

    // r1 已存在，r2/r3 不存在
    const existing = [{
      rid: 'res_1',
      type: 'vocabulary',
      metadata: { recordId: r1.recordId },
    }];
    const ctx = createMockContext(existing);

    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const candidates = await plugin.discover(ctx, filePath);
    expect(candidates.length).toBe(2);
    expect(candidates[0].name).toBe('world');
    expect(candidates[1].name).toBe('foo');
  });

  // ── 4. HTTP 通道 ──

  test('HTTP POST 创建 Resource 并返回 rid', async () => {
    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const record = makeRecord();
    const res = {
      _status: null,
      _body: null,
      status(code) { this._status = code; return this; },
      json(body) { this._body = body; },
    };

    await plugin._handleHttpPost({ body: record }, res);

    expect(res._status).toBeNull(); // 200 (未调用 status)
    expect(res._body.ok).toBe(true);
    expect(res._body.created).toBe(1);
    expect(res._body.resources[0].rid).toMatch(/^res_/);
  });

  test('HTTP POST 批量创建', async () => {
    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const records = [makeRecord(), makeRecord({ original: 'world' }), makeRecord({ original: 'test' })];
    const res = {
      status(code) { this._status = code; return this; },
      json(body) { this._body = body; },
    };

    await plugin._handleHttpPost({ body: records }, res);

    expect(res._body.ok).toBe(true);
    expect(res._body.created).toBe(3);
  });

  test('HTTP POST 无效记录返回 400', async () => {
    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const res = {
      status(code) { this._status = code; return this; },
      json(body) { this._body = body; },
    };

    await plugin._handleHttpPost({ body: { foo: 'bar' } }, res);

    expect(res._status).toBe(400);
    expect(res._body.error).toContain('无效');
  });

  test('HTTP POST 去重：已存在的 recordId 跳过', async () => {
    const record = makeRecord();
    const existing = [{
      rid: 'res_old',
      type: 'vocabulary',
      metadata: { recordId: record.recordId },
    }];
    const ctx = createMockContext(existing);

    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const res = {
      status(code) { this._status = code; return this; },
      json(body) { this._body = body; },
    };

    await plugin._handleHttpPost({ body: record }, res);

    expect(res._body.ok).toBe(true);
    expect(res._body.created).toBe(0);
    expect(res._body.skipped).toBe(1);
  });

  // ── 5. 双通道协作 ──

  test('HTTP 先推送 → discover 补录遗漏', async () => {
    const r1 = makeRecord({ original: 'http-pushed' });
    const r2 = makeRecord({ original: 'file-only' });

    // 通道②：HTTP 先推送 r1
    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const httpRes = { status() { return this; }, json(b) { this._body = b; } };
    await plugin._handleHttpPost({ body: r1 }, httpRes);
    expect(httpRes._body.created).toBe(1);

    // 导出文件包含 r1 和 r2（Chrome 本地存储全量）
    const filePath = path.join(tempDir, 'records.json');
    await fs.writeFile(filePath, JSON.stringify([r1, r2]));

    // 通道①：discover 校验，r1 已存在跳过，r2 补录
    const candidates = await plugin.discover(ctx, filePath);
    expect(candidates.length).toBe(1);
    expect(candidates[0].name).toBe('file-only');
  });

  test('HTTP 不可用时 discover 补录全部', async () => {
    const records = [makeRecord(), makeRecord({ original: 'world' })];
    const filePath = path.join(tempDir, 'records.json');
    await fs.writeFile(filePath, JSON.stringify(records));

    // HTTP 从未推送过，discover 全量补录
    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const candidates = await plugin.discover(ctx, filePath);
    expect(candidates.length).toBe(2);
  });

  // ── 6. 候选对象格式 ──

  test('候选包含完整 metadata', async () => {
    const record = makeRecord({
      original: 'serendipity',
      translation: '意外发现',
      sourceLang: 'en',
      targetLang: 'zh',
      context: 'a happy serendipity',
      url: 'https://example.com/article',
      pageTitle: 'Article Title',
      timestamp: '2026-08-01T10:00:00Z',
    });

    const filePath = path.join(tempDir, 'records.json');
    await fs.writeFile(filePath, JSON.stringify([record]));

    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const candidates = await plugin.discover(ctx, filePath);
    const c = candidates[0];

    expect(c.type).toBe('vocabulary');
    expect(c.name).toBe('serendipity');
    expect(c.metadata.recordId).toBe(record.recordId);
    expect(c.metadata.original).toBe('serendipity');
    expect(c.metadata.translation).toBe('意外发现');
    expect(c.metadata.sourceLang).toBe('en');
    expect(c.metadata.targetLang).toBe('zh');
    expect(c.metadata.context).toBe('a happy serendipity');
    expect(c.metadata.url).toBe('https://example.com/article');
    expect(c.metadata.pageTitle).toBe('Article Title');
    expect(c.metadata.timestamp).toBe('2026-08-01T10:00:00Z');
  });

  test('候选包含语言标签', async () => {
    const record = makeRecord({ sourceLang: 'en', targetLang: 'zh' });
    const filePath = path.join(tempDir, 'records.json');
    await fs.writeFile(filePath, JSON.stringify([record]));

    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    const candidates = await plugin.discover(ctx, filePath);
    expect(candidates[0].metadata.tags).toContain('lang:en');
    expect(candidates[0].metadata.tags).toContain('lang:zh');
  });

  // ── 7. register 注册扩展点 ──

  test('register 注册 commands 扩展点', () => {
    const registered = [];
    const ctx = createMockContext();
    ctx.extensions.register = (pluginId, type, key, def) => {
      registered.push({ pluginId, type, key, def });
    };

    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);
    plugin.register(ctx);

    // 父类注册 resourceProviders + 子类注册 commands
    const types = registered.map(r => r.type);
    expect(types).toContain('resourceProviders');
    expect(types).toContain('commands');

    const cmd = registered.find(r => r.type === 'commands');
    expect(cmd.key).toBe('chrome-translate:receive');
    expect(cmd.def.method).toBe('POST');
    expect(cmd.def.path).toBe('/api/plugins/chrome-translate/records');
  });

  // ── 8. watch 增量监听 ──

  test('watch 文件变化时自动 discover 补录', async () => {
    const record1 = makeRecord({ original: 'apple' });
    const record2 = makeRecord({ original: 'banana' });
    const filePath = path.join(tempDir, 'watch-records.json');
    await fs.writeFile(filePath, JSON.stringify([record1, record2]));

    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    // 先 discover + 写入，让前 2 条进入 mock context（模拟 DiscoveryService 已持久化）
    const initialCandidates = await plugin.discover(ctx, filePath);
    for (const c of initialCandidates) {
      await ctx.resources.create(c);
    }

    let receivedCandidates = null;
    const stop = await plugin.watch(filePath, (candidates) => {
      receivedCandidates = candidates;
    });

    // 等待 watch 启动
    await new Promise(r => setTimeout(r, 200));

    // 追加新记录，触发文件变化
    const record3 = makeRecord({ original: 'cherry' });
    await fs.writeFile(filePath, JSON.stringify([record1, record2, record3]));

    // 等待防抖（500ms）+ 文件事件触发的延迟
    await new Promise(r => setTimeout(r, 1200));

    // 停止监听
    stop();

    expect(receivedCandidates).not.toBeNull();
    expect(receivedCandidates.length).toBe(1); // 只有 record3 是新的
    expect(receivedCandidates[0].name).toBe('cherry');
  });

  test('watch 未配置文件路径时抛错', async () => {
    const ctx = createMockContext();
    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    await expect(plugin.watch('', () => {})).rejects.toThrow('未配置导出文件路径');
  });

  test('watch error 路径：fs.watch 触发 error 事件时记录日志且不崩溃', async () => {
    const filePath = path.join(tempDir, 'records.json');
    await fs.writeFile(filePath, JSON.stringify([]));

    const errorLogs = [];
    const ctx = createMockContext();
    ctx.logger.error = (msg) => { errorLogs.push(msg); };

    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    // Mock fs.watch 返回可控的 EventEmitter
    const mockWatcher = new EventEmitter();
    mockWatcher.close = () => {};
    const watchSpy = jest.spyOn(nativeFs, 'watch').mockImplementation(() => mockWatcher);

    const stop = await plugin.watch(filePath, () => {});

    // 触发 error 事件
    const testError = new Error('watch test error');
    mockWatcher.emit('error', testError);

    // 验证 error 被记录
    expect(errorLogs.some(msg => msg.includes('watch 错误') && msg.includes('watch test error'))).toBe(true);

    // 验证 dispose 正常工作（error 后仍可关闭）
    expect(() => stop()).not.toThrow();

    watchSpy.mockRestore();
  });

  test('watch discover 失败时记录错误且不崩溃', async () => {
    // 写入无效 JSON，触发 discover 解析失败
    const filePath = path.join(tempDir, 'bad-records.json');
    await fs.writeFile(filePath, '{invalid json');

    const errorLogs = [];
    const ctx = createMockContext();
    ctx.logger.error = (msg) => { errorLogs.push(msg); };

    const plugin = new ChromeTranslatePlugin();
    plugin.$setContext(ctx);

    // Mock fs.watch 返回可控的 EventEmitter，并捕获 listener 回调
    const mockWatcher = new EventEmitter();
    mockWatcher.close = () => {};
    let watchListener = null;
    const watchSpy = jest.spyOn(nativeFs, 'watch').mockImplementation((filepath, options, listener) => {
      watchListener = listener;
      return mockWatcher;
    });

    let onChangeCalled = false;
    const stop = await plugin.watch(filePath, () => { onChangeCalled = true; });

    // 手动触发 fs.watch 的 change 回调，防抖后会调用 discover（解析失败）
    expect(watchListener).not.toBeNull();
    watchListener('change');

    // 等待防抖（500ms）+ discover 执行
    await new Promise(r => setTimeout(r, 800));

    // discover 失败应记录错误，onChange 不应被调用
    expect(errorLogs.some(msg => msg.includes('watch discover 失败'))).toBe(true);
    expect(onChangeCalled).toBe(false);

    stop();
    watchSpy.mockRestore();
  });
});
