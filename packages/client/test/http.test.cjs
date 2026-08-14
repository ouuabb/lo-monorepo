jest.mock('https', () => ({
  request: jest.fn(() => {
    throw new Error('https mocked');
  }),
}));

const http = require('http');
const https = require('https');
const { get, post, put, del, request, LoHttpError, LoApiError } = require('../src/http.cjs');

/** 起一个临时 http server,返回 { url, port, close } */
async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

describe('http.cjs 真实请求', () => {
  it('GET 解析 JSON 响应', async () => {
    const srv = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hello: 'world', status: 'ok' }));
    });
    try {
      const res = await get(`${srv.url}/api/health`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ hello: 'world', status: 'ok' });
    } finally {
      await srv.close();
    }
  });

  it('POST 发送 JSON body 且服务端能读到', async () => {
    let received = null;
    const srv = await startServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        received = JSON.parse(data || '{}');
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, echo: received }));
      });
    });
    try {
      const res = await post(`${srv.url}/api/notes`, { title: 'hi', tags: ['a'] });
      expect(res.status).toBe(201);
      expect(res.body.echo.title).toBe('hi');
      expect(received.tags).toEqual(['a']);
    } finally {
      await srv.close();
    }
  });

  it('PUT 与 DELETE 方法正确', async () => {
    const methods = [];
    const srv = await startServer((req, res) => {
      methods.push(req.method);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    try {
      await put(`${srv.url}/r`, { a: 1 });
      await del(`${srv.url}/r`);
      expect(methods).toEqual(['PUT', 'DELETE']);
    } finally {
      await srv.close();
    }
  });

  it('非 2xx 抛 LoApiError 且带 error 消息', async () => {
    const srv = await startServer((req, res) => {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'already exists', code: 'RESOURCE_EXISTS' }));
    });
    try {
      const promise = post(`${srv.url}/api/notes`, {});
      await expect(promise).rejects.toThrow(/already exists/);
      await promise.catch((e) => {
        expect(e.name).toBe('LoApiError');
        expect(e.status).toBe(409);
        expect(e.code).toBe('RESOURCE_EXISTS');
      });
    } finally {
      await srv.close();
    }
  });

  it('跟随重定向(302 → 200)', async () => {
    const srv = await startServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/target' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"final":true}');
    });
    try {
      const res = await get(`${srv.url}/redirect`);
      expect(res.status).toBe(200);
      expect(res.body.final).toBe(true);
    } finally {
      await srv.close();
    }
  });

  it('网络拒绝抛 LoHttpError', async () => {
    // 连接一个未监听端口
    await expect(get('http://127.0.0.1:1/api')).rejects.toThrow(/请求失败|connect|ECONNREFUSED/i);
  });

  it('非 JSON 响应体原样返回字符串', async () => {
    const srv = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('not-json');
    });
    try {
      const res = await get(`${srv.url}/plain`);
      expect(res.status).toBe(200);
      expect(res.body).toBe('not-json');
    } finally {
      await srv.close();
    }
  });

  it('重定向超限抛 LoHttpError(too_many_redirects)', async () => {
    const srv = await startServer((req, res) => {
      res.writeHead(302, { Location: '/loop' });
      res.end();
    });
    try {
      await expect(get(`${srv.url}/loop`)).rejects.toThrow(LoHttpError);
      await expect(get(`${srv.url}/loop`)).rejects.toThrow(/redirect/i);
    } finally {
      await srv.close();
    }
  });

  it('请求超时抛 LoHttpError(timeout)', async () => {
    const srv = await startServer(() => {
      /* 不响应 */
    });
    try {
      await expect(get(`${srv.url}/slow`, { timeout: 100 })).rejects.toThrow(LoHttpError);
      await expect(get(`${srv.url}/slow`, { timeout: 100 })).rejects.toThrow(/超时/i);
    } finally {
      await srv.close();
    }
  });

  it('字符串 body 原样发送(非 JSON 序列化)', async () => {
    let raw = '';
    const srv = await startServer((req, res) => {
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
    try {
      await post(`${srv.url}/r`, 'plain-string', {});
      expect(raw).toBe('plain-string');
    } finally {
      await srv.close();
    }
  });

  it('4xx 无 error 字段时用 HTTP status 作为消息', async () => {
    const srv = await startServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"detail":"boom"}');
    });
    try {
      await expect(get(`${srv.url}/x`)).rejects.toThrow(LoApiError);
      await expect(get(`${srv.url}/x`)).rejects.toThrow(/HTTP 500/);
    } finally {
      await srv.close();
    }
  });

  it('LoHttpError 与 LoApiError 构造器默认值', () => {
    const he = new LoHttpError('net', {});
    expect(he.code).toBe('ERR_REQUEST');
    expect(he.cause).toBeUndefined();
    const he2 = new LoHttpError('net', { cause: new Error('root') });
    expect(he2.cause.message).toBe('root');
    // options 缺省时构造器默认值分支
    const he3 = new LoHttpError('plain');
    expect(he3.code).toBe('ERR_REQUEST');
    const ae = new LoApiError('msg');
    expect(ae.name).toBe('LoApiError');
    expect(ae.status).toBeUndefined();
  });

  it('request 缺省 options 直接调用', async () => {
    const srv = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":1}');
    });
    try {
      const res = await request('GET', `${srv.url}/x`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: 1 });
    } finally {
      await srv.close();
    }
  });

  it('https 协议走 https 传输层(被封住抛错)', async () => {
    await expect(get('https://example.test/x')).rejects.toThrow(/https mocked/);
    expect(https.request).toHaveBeenCalled();
  });
});
