/**
 * PluginHttp — 插件 HTTP 端点挂载测试
 *
 * 覆盖：
 *   1. isHttpEndpoint 识别 HTTP 端点 / 拒绝 CLI 命令
 *   2. adaptPluginHandler 读 body、JSON 响应、异常 500
 *   3. collectPluginEndpoints / mountPluginRoutes 挂载逻辑
 *   4. 集成：真实仓库 + chrome-translate 插件 → HTTP server → POST 实时推送
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const http = require('http');


const Repository = require('../../src/repo/repository.cjs');
const {
  isHttpEndpoint,
  isPluginEndpointAllowed,
  adaptPluginHandler,
  collectPluginEndpoints,
  mountPluginRoutes,
} = require('../../src/plugin/pluginHttp.cjs');

// 插件源码路径（根目录，包含 plugin.json + src/）
const PLUGIN_ROOT = path.resolve('..', '..', 'plugins', 'core', 'packages', 'chrome-translate');

describe('isHttpEndpoint', () => {
  test('识别合法 HTTP 端点结构', () => {
    expect(isHttpEndpoint({
      method: 'POST',
      path: '/api/plugins/x/records',
      handler: async () => {},
    })).toBe(true);
  });

  test('拒绝 CLI 命令结构（无 path）', () => {
    expect(isHttpEndpoint({ handler: async () => {} })).toBe(false);
    expect(isHttpEndpoint({ path: '/x' })).toBe(false);
  });

  test('拒绝非对象 / null / 无 handler', () => {
    expect(isHttpEndpoint(null)).toBe(false);
    expect(isHttpEndpoint(undefined)).toBe(false);
    expect(isHttpEndpoint('string')).toBe(false);
    expect(isHttpEndpoint({ method: 'POST', path: '/x' })).toBe(false);
  });

  test('拒绝未知 HTTP method', () => {
    expect(isHttpEndpoint({
      method: 'PATCH',
      path: '/x',
      handler: async () => {},
    })).toBe(false);
  });

  test('method 大小写不敏感', () => {
    expect(isHttpEndpoint({
      method: 'post',
      path: '/x',
      handler: async () => {},
    })).toBe(true);
  });
});

describe('adaptPluginHandler', () => {
  function mockServerResponse() {
    const res = {
      headersSent: false,
      statusCode: null,
      headers: {},
      body: null,
      writeHead(code, headers) {
        this.headersSent = true;
        this.statusCode = code;
        Object.assign(this.headers, headers || {});
      },
      setHeader(name, value) { this.headers[name] = value; },
      end(data) { this.body = data; },
    };
    return res;
  }

  function makeReq(rawBody, method = 'GET') {
    const req = new (require('stream').Readable)();
    req._read = () => {};
    if (rawBody) req.push(rawBody);
    req.push(null);
    req.method = method;
    req.headers = {};
    return req;
  }

  test('读 body 并返回 JSON 响应', async () => {
    const handler = async (req, res) => {
      expect(req.body).toEqual({ recordId: 'r1' });
      res.json({ ok: true });
    };
    const adapted = adaptPluginHandler(handler, { pluginId: 'test' });
    const res = mockServerResponse();
    await adapted(makeReq('{"recordId":"r1"}', 'POST'), res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  test('非法 JSON → 400，不静默降级为空对象', async () => {
    let handlerCalled = false;
    const handler = async (req, res) => {
      handlerCalled = true;
      res.json({ ok: true });
    };
    const adapted = adaptPluginHandler(handler, { pluginId: 'test' });
    const res = mockServerResponse();
    await adapted(makeReq('{not-json', 'POST'), res);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Invalid JSON body');
    expect(handlerCalled).toBe(false);
  });

  test('status(code).json() 链式响应', async () => {
    const handler = async (req, res) => {
      res.status(400).json({ error: 'bad' });
    };
    const adapted = adaptPluginHandler(handler);
    const res = mockServerResponse();
    await adapted(makeReq(null), res);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'bad' });
  });

  test('空 body 解析为空对象', async () => {
    let receivedBody = 'not-set';
    const handler = async (req, res) => {
      receivedBody = req.body;
      res.json({ ok: true });
    };
    const adapted = adaptPluginHandler(handler);
    const res = mockServerResponse();
    await adapted(makeReq(null), res);
    expect(receivedBody).toEqual({});
  });

  test('POST 空 body → 空对象（不走 JSON 解析）', async () => {
    let receivedBody = 'not-set';
    const handler = async (req, res) => {
      receivedBody = req.body;
      res.json({ ok: true });
    };
    const adapted = adaptPluginHandler(handler);
    const res = mockServerResponse();
    await adapted(makeReq(null, 'POST'), res);
    expect(res.statusCode).toBe(200);
    expect(receivedBody).toEqual({});
  });

  test('handler 抛错 → 500', async () => {
    const handler = async () => { throw new Error('boom'); };
    const adapted = adaptPluginHandler(handler, { pluginId: 'test' });
    const res = mockServerResponse();
    await adapted(makeReq(null), res);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain('boom');
  });

  test('setHeader 透传', async () => {
    const handler = async (req, res) => {
      res.setHeader('X-Test', '1');
      res.json({ ok: true });
    };
    const adapted = adaptPluginHandler(handler);
    const res = mockServerResponse();
    await adapted(makeReq(null), res);
    expect(res.headers['X-Test']).toBe('1');
  });

  test('res.end() 返回非 JSON 响应（如 HTML）', async () => {
    const html = '<html><body>Reader</body></html>';
    const handler = async (req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    };
    const adapted = adaptPluginHandler(handler);
    const res = mockServerResponse();
    await adapted(makeReq(null), res);
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res.body).toBe(html);
  });
});

describe('isPluginEndpointAllowed（serve 鉴权豁免判定）', () => {
  const mounted = [
    { method: 'POST', path: '/api/plugins/x/rec' },
    { method: 'GET', path: '/api/plugins/x/status' },
  ];

  test('已挂载的 method+path → 豁免认证', () => {
    expect(isPluginEndpointAllowed('POST', '/api/plugins/x/rec', mounted)).toBe(true);
    expect(isPluginEndpointAllowed('GET', '/api/plugins/x/status', mounted)).toBe(true);
  });

  test('未挂载的 /api/plugins/ 路径 → 不豁免（走 SSH 认证）', () => {
    expect(isPluginEndpointAllowed('GET', '/api/plugins/nope/foo', mounted)).toBe(false);
    expect(isPluginEndpointAllowed('POST', '/api/plugins/x/rec-extra', mounted)).toBe(false);
  });

  test('method 不匹配 → 不豁免', () => {
    expect(isPluginEndpointAllowed('GET', '/api/plugins/x/rec', mounted)).toBe(false);
  });

  test('空挂载清单 / 无挂载 → 不豁免', () => {
    expect(isPluginEndpointAllowed('POST', '/api/plugins/x/rec', [])).toBe(false);
    expect(isPluginEndpointAllowed('POST', '/api/plugins/x/rec', null)).toBe(false);
  });
});

describe('collectPluginEndpoints / mountPluginRoutes', () => {
  function createMockRepo(endpoints) {
    const extMap = new Map();
    for (const e of endpoints) {
      extMap.set(e.key, { pluginId: e.pluginId, handler: e.handler });
    }
    return {
      getPluginExtensionRegistry() {
        return { list: () => Array.from(extMap.entries()).map(([key, entry]) => ({ key, ...entry })) };
      },
    };
  }

  test('只收集 HTTP 端点，跳过 CLI 命令', () => {
    const repo = createMockRepo([
      { key: 'http:1', pluginId: 'p1', handler: { method: 'GET', path: '/api/plugins/p1/x', handler: async () => {} } },
      { key: 'cli:1', pluginId: 'p1', handler: async () => {} }, // CLI 命令
    ]);
    const endpoints = collectPluginEndpoints(repo);
    expect(endpoints.length).toBe(1);
    expect(endpoints[0].key).toBe('http:1');
    expect(endpoints[0].method).toBe('GET');
    expect(endpoints[0].path).toBe('/api/plugins/p1/x');
  });

  test('mountPluginRoutes 注册到路由表并返回清单', async () => {
    const repo = createMockRepo([
      { key: 'http:1', pluginId: 'p1', handler: { method: 'POST', path: '/api/plugins/p1/rec', handler: async (req, res) => res.json({ ok: true }) } },
    ]);
    const routes = new Map();
    const mounted = await mountPluginRoutes(repo, (method, pattern, handler) => {
      routes.set(`${method} ${pattern}`, handler);
    });
    expect(mounted).toEqual([{ key: 'http:1', pluginId: 'p1', method: 'POST', path: '/api/plugins/p1/rec' }]);
    expect(routes.has('POST /api/plugins/p1/rec')).toBe(true);
  });

  test('无 extensionRegistry 时安全返回空', () => {
    expect(collectPluginEndpoints({})).toEqual([]);
    expect(mountPluginRoutes({}, () => {})).resolves.toEqual([]);
  });

  test('registerRoute 返回 false（路径冲突）时跳过并警告', async () => {
    const repo = createMockRepo([
      { key: 'http:1', pluginId: 'p1', handler: { method: 'POST', path: '/api/plugins/p1/rec', handler: async () => {} } },
      // 同 method+path 的另一个插件端点 → 冲突
      { key: 'http:2', pluginId: 'p2', handler: { method: 'POST', path: '/api/plugins/p1/rec', handler: async () => {} } },
    ]);
    const routes = new Map();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const mounted = await mountPluginRoutes(repo, (method, pattern, handler) => {
      if (routes.has(`${method} ${pattern}`)) return false;
      routes.set(`${method} ${pattern}`, handler);
      return true;
    });

    expect(mounted.length).toBe(1); // 仅第一个挂载成功
    expect(mounted[0].pluginId).toBe('p1');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('冲突'));
    warnSpy.mockRestore();
  });
});

describe('集成：chrome-translate HTTP 端点实时推送', () => {
  let tempDir, repo, server, basePort;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-ph-e2e-'));
    await fs.ensureDir(path.join(tempDir, '.repo', 'plugins', 'chrome-translate'));
    repo = new Repository(tempDir);
    await repo.init();

    // 复制插件
    const pluginDest = path.join(tempDir, '.repo', 'plugins', 'chrome-translate');
    await fs.copy(path.join(PLUGIN_ROOT, 'plugin.json'), path.join(pluginDest, 'plugin.json'));
    await fs.copy(path.join(PLUGIN_ROOT, 'src'), path.join(pluginDest, 'src'));

    // 初始化插件系统（激活插件并注册 HTTP 端点）
    await repo.initPluginSystem();

    // 挂载插件端点
    const routes = new Map();
    await mountPluginRoutes(repo, (method, pattern, handler) => {
      routes.set(`${method} ${pattern}`, handler);
    });

    // 启动测试 HTTP server
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const handler = routes.get(`${req.method.toUpperCase()} ${url.pathname}`);
      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      handler(req, res);
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        basePort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (repo && repo.db) { try { await repo.db.close(); } catch {} }
    if (tempDir && await fs.pathExists(tempDir)) { try { await fs.remove(tempDir); } catch {} }
  });

  function postRecord(record) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(record);
      const req = http.request({
        host: '127.0.0.1',
        port: basePort,
        path: '/api/plugins/chrome-translate/records',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      });
      req.on('error', reject);
      req.end(data);
    });
  }

  test('POST 推送翻译记录 → 创建 vocabulary 资源', async () => {
    const record = {
      recordId: 'tr_http_001',
      original: 'resilient',
      translation: '有韧性的',
      sourceLang: 'en', targetLang: 'zh',
      context: 'resilient system',
      url: 'https://example.com',
      pageTitle: 'Example',
      timestamp: '2026-08-01T13:00:00Z',
    };

    const resp = await postRecord(record);
    expect(resp.status).toBe(200);
    expect(resp.body.ok).toBe(true);
    expect(resp.body.created).toBe(1);

    // 查询确认
    const all = await repo.resourceService.getAll();
    const vocab = all.filter(r => r.type === 'vocabulary');
    expect(vocab.length).toBe(1);
    expect(vocab[0].metadata.recordId).toBe('tr_http_001');
    expect(vocab[0].metadata.translation).toBe('有韧性的');
  });

  test('重复推送同一 recordId → 去重跳过', async () => {
    const record = {
      recordId: 'tr_http_001', // 与上一条相同
      original: 'resilient',
      translation: '有韧性的',
    };
    const resp = await postRecord(record);
    expect(resp.status).toBe(200);
    expect(resp.body.created).toBe(0);
    expect(resp.body.skipped).toBe(1);
  });

  test('非法记录 → 400', async () => {
    const resp = await postRecord({ recordId: 'bad' }); // 缺 original/translation
    expect(resp.status).toBe(400);
  });
});
