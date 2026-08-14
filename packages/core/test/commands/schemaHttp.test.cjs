/**
 * Schema HTTP API 集成测试
 *
 * 启动真实 lo serve 子进程，验证 /api/schemas CRUD + attach/detach + 按 schema 过滤资源。
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

describe('Schema HTTP API', () => {
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

  test('POST /api/schemas 创建 + GET 列表 + GET 详情', async () => {
    const created = await request(port, 'POST', '/api/schemas', {
      id: 'person', name: 'Person',
    });
    expect(created.status).toBe(201);
    expect(created.data.id).toBe('person');

    const created2 = await request(port, 'POST', '/api/schemas', {
      id: 'followup', name: 'FollowUp',
      fields: [{ name: 'stage', type: 'enum', values: ['waiting', 'done'] }],
    });
    expect(created2.status).toBe(201);

    const list = await request(port, 'GET', '/api/schemas');
    expect(list.status).toBe(200);
    expect(list.data.total).toBe(2);

    const detail = await request(port, 'GET', '/api/schemas/followup');
    expect(detail.status).toBe(200);
    expect(detail.data.fields[0].name).toBe('stage');
  });

  test('POST /api/schemas 缺 id → 400', async () => {
    const res = await request(port, 'POST', '/api/schemas', { name: 'NoId' });
    expect(res.status).toBe(400);
  });

  test('relation target 强校验：指向不存在 schema → 500', async () => {
    const res = await request(port, 'POST', '/api/schemas', {
      id: 'followup', name: 'FollowUp',
      fields: [{ name: 'customer', type: 'relation', target: 'Ghost' }],
    });
    expect(res.status).toBe(500);
    expect(res.data.error).toContain('relation target "Ghost" 不存在');
  });

  test('POST /api/schemas 携带 behaviors 语义声明', async () => {
    const created = await request(port, 'POST', '/api/schemas', {
      id: 'followup', name: 'FollowUp',
      fields: [{ name: 'status', type: 'enum', values: ['waiting', 'done'] }],
      behaviors: { stateField: 'status' },
    });
    expect(created.status).toBe(201);
    expect(created.data.behaviors.stateField).toBe('status');

    const detail = await request(port, 'GET', '/api/schemas/followup');
    expect(detail.data.behaviors.stateField).toBe('status');
  });

  test('POST /api/schemas behaviors 引用不存在字段 → 500', async () => {
    const res = await request(port, 'POST', '/api/schemas', {
      id: 'followup', name: 'FollowUp',
      behaviors: { stateField: 'nope' },
    });
    expect(res.status).toBe(500);
    expect(res.data.error).toContain('behaviors.stateField 引用的字段 "nope" 不存在');
  });

  test('PUT /api/schemas/:id 更新 behaviors 升版', async () => {
    await request(port, 'POST', '/api/schemas', {
      id: 's1', name: 'S1',
      fields: [{ name: 'status', type: 'text' }],
    });

    const updated = await request(port, 'PUT', '/api/schemas/s1', {
      behaviors: { stateField: 'status' },
    });
    expect(updated.status).toBe(200);
    expect(updated.data.version).toBe(2);
    expect(updated.data.behaviors.stateField).toBe('status');
  });

  test('PUT /api/schemas/:id 更新升版 + DELETE 删除', async () => {
    await request(port, 'POST', '/api/schemas', { id: 's1', name: 'S1' });

    const updated = await request(port, 'PUT', '/api/schemas/s1', {
      fields: [{ name: 'stage', type: 'text' }],
    });
    expect(updated.status).toBe(200);
    expect(updated.data.version).toBe(2);

    const deleted = await request(port, 'DELETE', '/api/schemas/s1');
    expect(deleted.status).toBe(200);
    expect(deleted.data.deleted).toBe(true);

    const detail = await request(port, 'GET', '/api/schemas/s1');
    expect(detail.status).toBe(404);
  });

  test('POST /api/schemas/:id/attach 与 detach', async () => {
    await request(port, 'POST', '/api/schemas', { id: 's1', name: 'S1' });

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resource = await repo.resourceService.create({ type: 'record', name: 'r1' });
    await repo.close();

    const attached = await request(port, 'POST', '/api/schemas/s1/attach', { rid: resource.rid });
    expect(attached.status).toBe(200);
    expect(attached.data.id).toBe('s1');

    const detached = await request(port, 'POST', '/api/schemas/s1/detach', { rid: resource.rid });
    expect(detached.status).toBe(200);
    expect(detached.data.detached).toBe(true);
  });

  test('POST attach 缺 rid → 400；资源不存在 → 404', async () => {
    await request(port, 'POST', '/api/schemas', { id: 's1', name: 'S1' });

    const noRid = await request(port, 'POST', '/api/schemas/s1/attach', {});
    expect(noRid.status).toBe(400);

    const noRes = await request(port, 'POST', '/api/schemas/s1/attach', { rid: 'res_missing' });
    expect(noRes.status).toBe(404);
  });

  test('POST attach 引用不存在的 schema → 500', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resource = await repo.resourceService.create({ type: 'record', name: 'r1' });
    await repo.close();

    const res = await request(port, 'POST', '/api/schemas/ghost/attach', { rid: resource.rid });
    expect(res.status).toBe(500);
  });

  test('POST detach 未绑定 → 404', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resource = await repo.resourceService.create({ type: 'record', name: 'r1' });
    await repo.close();

    const res = await request(port, 'POST', '/api/schemas/s1/detach', { rid: resource.rid });
    expect(res.status).toBe(404);
  });

  test('GET /api/schemas/:id 不存在 → 404；DELETE 不存在 → 404', async () => {
    const get = await request(port, 'GET', '/api/schemas/ghost');
    expect(get.status).toBe(404);

    const del = await request(port, 'DELETE', '/api/schemas/ghost');
    expect(del.status).toBe(404);
  });

  test('GET /api/notes?schema= 按 schema 过滤资源', async () => {
    await request(port, 'POST', '/api/schemas', { id: 's1', name: 'S1' });

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const a = await repo.resourceService.create({ type: 'record', name: 'a', schema: 's1' });
    await repo.resourceService.create({ type: 'record', name: 'b' });
    await repo.close();

    const filtered = await request(port, 'GET', `/api/notes?schema=s1`);
    expect(filtered.status).toBe(200);
    const rids = filtered.data.data.map((r) => r.rid);
    expect(rids).toContain(a.rid);
    expect(rids).toHaveLength(1);
  });
});
