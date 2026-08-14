/**
 * View HTTP API 集成测试
 *
 * 启动真实 lo serve 子进程，验证 /api/views CRUD + run + export/import。
 */

const path = require('path');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');
const { setupTempRepo, teardownTempRepo, Repository } = require('./commandTestHelper.cjs');

const BIN = path.resolve(__dirname, '../../bin/note.cjs');

jest.setTimeout(90000);

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: '127.0.0.1', port, method, path: urlPath, headers: payload ? { 'Content-Type': 'application/json' } : {} },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data = null;
          try { data = text ? JSON.parse(text) : null; } catch {}
          resolve({ status: res.statusCode, data, text });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForServer(server, port, getLogs, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let settled = false;
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      reject(new Error(`${msg}\n--- serve 日志 ---\n${(getLogs && getLogs()) || '(空)'}`));
    };
    server.on('exit', (code, signal) => fail(`serve 进程提前退出 (code=${code}, signal=${signal})`));
    server.on('error', (e) => fail(`serve 进程错误: ${e.message}`));
    (async () => {
      while (Date.now() - start < timeout) {
        if (settled) return;
        try {
          const res = await request(port, 'GET', '/api/health');
          if (res.status === 200) {
            settled = true;
            resolve();
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!settled) fail(`等待 serve 启动超时 (${timeout}ms)`);
    })();
  });
}

describe('View HTTP API', () => {
  let ctx, port, server, logs;

  beforeEach(async () => {
    ctx = await setupTempRepo();
    port = await findFreePort();
    logs = '';
    server = spawn(process.execPath, [BIN, 'serve', '--repo', ctx.tempDir, '--port', String(port)], {
      cwd: ctx.tempDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', (d) => { logs += d.toString(); });
    server.stderr.on('data', (d) => { logs += d.toString(); });
    await waitForServer(server, port, () => logs);
  });

  afterEach(async () => {
    if (server && !server.killed) {
      const exited = new Promise((resolve) => server.once('exit', resolve));
      server.kill();
      const timeout = new Promise((r) => { const t = setTimeout(r, 3000); t.unref(); });
      await Promise.race([exited, timeout]);
    }
    await teardownTempRepo(ctx);
  });

  test('POST /api/views 创建 + GET 列表 + GET 详情', async () => {
    const created = await request(port, 'POST', '/api/views', {
      id: 'reading',
      name: '阅读中',
      query: { conditions: [{ field: 'type', operator: '=', value: 'note' }] },
      fields: [{ name: 'name', label: '名称' }],
      mode: 'table',
    });
    expect(created.status).toBe(201);
    expect(created.data.id).toBe('reading');
    expect(created.data.presentation.type).toBe('table');

    const list = await request(port, 'GET', '/api/views');
    expect(list.status).toBe(200);
    expect(list.data.total).toBe(1);

    const detail = await request(port, 'GET', '/api/views/reading');
    expect(detail.status).toBe(200);
    expect(detail.data.fields[0].label).toBe('名称');
  });

  test('POST /api/views 缺 id → 400', async () => {
    const res = await request(port, 'POST', '/api/views', { name: 'NoId', mode: 'table' });
    expect(res.status).toBe(400);
  });

  test('POST /api/views 引用不存在 schema → 500', async () => {
    const res = await request(port, 'POST', '/api/views', {
      id: 'bad',
      name: 'Bad',
      query: { conditions: [{ field: 'schema', operator: '=', value: 'Ghost' }] },
    });
    expect(res.status).toBe(500);
    expect(res.data.error).toContain('Schema "Ghost" 不存在');
  });

  test('PUT /api/views/:id 更新 + DELETE 删除', async () => {
    await request(port, 'POST', '/api/views', { id: 'v1', name: 'V1', mode: 'table' });

    const updated = await request(port, 'PUT', '/api/views/v1', {
      mode: 'card',
      name: 'V1 新',
    });
    expect(updated.status).toBe(200);
    expect(updated.data.presentation.type).toBe('card');
    expect(updated.data.name).toBe('V1 新');

    const deleted = await request(port, 'DELETE', '/api/views/v1');
    expect(deleted.status).toBe(200);
    expect(deleted.data.deleted).toBe(true);

    const detail = await request(port, 'GET', '/api/views/v1');
    expect(detail.status).toBe(404);
  });

  test('GET /api/views/:id 不存在 → 404；DELETE 不存在 → 404', async () => {
    const get = await request(port, 'GET', '/api/views/ghost');
    expect(get.status).toBe(404);

    const del = await request(port, 'DELETE', '/api/views/ghost');
    expect(del.status).toBe(404);
  });

  test('POST /api/views/:id/run 执行 View', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.resourceService.create({ name: '甲资源', type: 'note' });
    await repo.close();

    await request(port, 'POST', '/api/views', {
      id: 'v1', name: 'V1',
      query: { conditions: [{ field: 'type', operator: '=', value: 'note' }] },
      fields: [{ name: 'name', label: '名称' }],
      mode: 'list',
    });

    const res = await request(port, 'POST', '/api/views/v1/run', {});
    expect(res.status).toBe(200);
    expect(res.data.total).toBe(1);
    expect(res.data.rows[0].name).toBe('甲资源');
    expect(res.data.columns[0].name).toBe('name');
  });

  test('POST /api/views/:id/run 不存在 → 500', async () => {
    const res = await request(port, 'POST', '/api/views/ghost/run', {});
    expect(res.status).toBe(500);
    expect(res.data.error).toContain('不存在');
  });

  test('GET /api/views/:id/export + POST /api/views/import', async () => {
    await request(port, 'POST', '/api/views', {
      id: 'v1', name: 'V1', mode: 'kanban',
      query: { conditions: [] },
      fields: [{ name: 'name' }],
      presentation: { group_by: 'type' },
    });

    const exported = await request(port, 'GET', '/api/views/v1/export');
    expect(exported.status).toBe(200);
    expect(exported.data.presentation.type).toBe('kanban');
    expect(exported.data.presentation.config.group_by).toBe('type');

    const imported = await request(port, 'POST', '/api/views/import', {
      ...exported.data,
      id: 'v1-copy',
      name: 'V1 副本',
    });
    expect(imported.status).toBe(201);
    expect(imported.data.id).toBe('v1-copy');

    const copyDetail = await request(port, 'GET', '/api/views/v1-copy');
    expect(copyDetail.status).toBe(200);
    expect(copyDetail.data.presentation.type).toBe('kanban');
  });

  test('GET /api/views/:id/export 不存在 → 404', async () => {
    const res = await request(port, 'GET', '/api/views/ghost/export');
    expect(res.status).toBe(404);
  });

  test('POST /api/views/import 空定义 → 400', async () => {
    const res = await request(port, 'POST', '/api/views/import', {});
    expect(res.status).toBe(400);
  });
});
