/**
 * Protocol HTTP API 集成测试（relations / operations / events）
 *
 * 启动真实 lo serve 子进程，验证 010 收敛后的对外协议端点。
 * 覆盖：Relation CRUD / Operation execute+undo+transaction / Event history。
 */
const path = require("path");
const net = require("net");
const http = require("http");
const fs = require("fs-extra");
const { spawn } = require("child_process");
const {
  setupTempRepo,
  teardownTempRepo,
} = require("./commandTestHelper.cjs");

const BIN = path.resolve(__dirname, "../../bin/note.cjs");

jest.setTimeout(120000);

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: urlPath,
        headers: payload ? { "Content-Type": "application/json" } : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {}
          resolve({ status: res.statusCode, data, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForServer(server, port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const fail = (msg) => reject(new Error(msg));
    server.on("exit", (code) => fail(`serve 提前退出 (code=${code})`));
    (async () => {
      while (Date.now() - start < timeout) {
        try {
          const res = await request(port, "GET", "/api/health");
          if (res.status === 200) {
            resolve();
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 300));
      }
      fail(`等待 serve 启动超时`);
    })();
  });
}

describe("Protocol HTTP API (relations/operations/events)", () => {
  let ctx, port, server;

  beforeEach(async () => {
    ctx = await setupTempRepo();
    port = await findFreePort();
    server = spawn(
      process.execPath,
      [BIN, "serve", "--repo", ctx.tempDir, "--port", String(port)],
      { cwd: ctx.tempDir, stdio: ["ignore", "pipe", "pipe"] },
    );
    await waitForServer(server, port);
  });

  afterEach(async () => {
    if (server && !server.killed) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill();
      await Promise.race([exited, new Promise((r) => { const t = setTimeout(r, 3000); t.unref(); })]);
    }
    await teardownTempRepo(ctx);
  });

  // ─── Relation API ──────────────────────────────────────────

  test("Relation: create → get → list → update → remove", async () => {
    // 创建两个资源（relation 需要 rid）
    const r1 = await request(port, "POST", "/api/notes", { title: "A", content: "a" });
    const r2 = await request(port, "POST", "/api/notes", { title: "B", content: "b" });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    const rid1 = r1.data.rid;
    const rid2 = r2.data.rid;

    // create
    const created = await request(port, "POST", "/api/relations", {
      from: rid1,
      to: rid2,
      type: "reference",
      metadata: { note: "test" },
    });
    expect(created.status).toBe(201);
    expect(created.data.id).toBeDefined();
    expect(created.data.from_rid).toBe(rid1);
    expect(created.data.type).toBe("reference");
    const relId = created.data.id;

    // get single
    const got = await request(port, "GET", `/api/relations/${relId}`);
    expect(got.status).toBe(200);
    expect(got.data.id).toBe(relId);

    // list all
    const list = await request(port, "GET", "/api/relations");
    expect(list.status).toBe(200);
    expect(list.data.total).toBeGreaterThanOrEqual(1);

    // list by rid (outgoing/incoming)
    const byRid = await request(port, "GET", `/api/relations?rid=${rid1}`);
    expect(byRid.status).toBe(200);
    expect(byRid.data.outgoing.some((r) => r.to_rid === rid2)).toBe(true);

    // update
    const updated = await request(port, "PUT", `/api/relations/${relId}`, {
      updates: { metadata: { note: "updated" } },
    });
    expect(updated.status).toBe(200);

    // remove (软删除)
    const removed = await request(port, "DELETE", `/api/relations/${relId}`);
    expect(removed.status).toBe(200);
    expect(removed.data.removed).toBe(true);

    // get 已删除 → 404
    const gone = await request(port, "GET", `/api/relations/${relId}`);
    expect(gone.status).toBe(404);

    // 缺 from → 400
    const bad = await request(port, "POST", "/api/relations", { to: rid2 });
    expect(bad.status).toBe(400);
  });

  // ─── Operation API ─────────────────────────────────────────

  test("Operation: execute → history → get → undo → 未知 type 报错", async () => {
    // resource.create 经 Operation
    const op = await request(port, "POST", "/api/operations", {
      type: "resource.create",
      params: { type: "note", name: "OpNote", metadata: { title: "OpNote" } },
    });
    expect(op.status).toBe(201);
    expect(op.data.operationId).toBeDefined();
    expect(op.data.result.rid).toBeDefined();
    const opId = op.data.operationId;

    // history 含该操作
    const hist = await request(port, "GET", "/api/operations");
    expect(hist.status).toBe(200);
    expect(hist.data.data.some((o) => o.operation_id === opId)).toBe(true);

    // type 过滤
    const filtered = await request(port, "GET", "/api/operations?type=resource.create");
    expect(filtered.data.data.every((o) => o.type === "resource.create")).toBe(true);

    // get 单个
    const detail = await request(port, "GET", `/api/operations/${opId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.operation_id).toBe(opId);
    expect(detail.data.status).toBe("success");

    // undo → 原操作 rolled_back
    const undone = await request(port, "POST", `/api/operations/${opId}/undo`);
    expect(undone.status).toBe(200);
    expect(undone.data.undoOperationId).toBeDefined();
    const afterUndo = await request(port, "GET", `/api/operations/${opId}`);
    expect(afterUndo.data.status).toBe("rolled_back");

    // 未知 type → 400
    const bad = await request(port, "POST", "/api/operations", {
      type: "no.such.type",
      params: {},
    });
    expect(bad.status).toBe(400);
  });

  test("Operation transaction: begin → execute → commit", async () => {
    const tx = await request(port, "POST", "/api/operations/transaction", {
      containerRid: "__system__",
      type: "batch",
      description: "test-tx",
    });
    expect(tx.status).toBe(201);
    expect(tx.data.transactionId).toBeDefined();
    const txId = tx.data.transactionId;

    const ex = await request(port, "POST", `/api/operations/transaction/${txId}/execute`, {
      type: "resource.create",
      params: { type: "note", name: "TxNote", metadata: { title: "TxNote" } },
    });
    expect(ex.status).toBe(200);
    expect(ex.data.operationId).toBeDefined();

    const committed = await request(port, "POST", `/api/operations/transaction/${txId}/commit`);
    expect(committed.status).toBe(200);
    expect(committed.data.committed).toBe(true);
  });

  // ─── Repository API（D6：Identity + Resolver 三态）────────────

  test("Repository: GET /api/repository 返回 Identity + path", async () => {
    const res = await request(port, "GET", "/api/repository");
    expect(res.status).toBe(200);
    expect(res.data.repositoryId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(res.data.path).toBe(ctx.tempDir);
  });

  test("Repository: GET /api/resources/:rid/location 返回 Resolver 三态", async () => {
    const r = await request(port, "POST", "/api/notes", { title: "LocNote", content: "x" });
    expect(r.status).toBe(201);
    const rid = r.data.rid;

    // local 存在 → resolved
    const ok = await request(port, "GET", `/api/resources/${rid}/location`);
    expect(ok.status).toBe(200);
    expect(ok.data.kind).toBe("local");
    expect(ok.data.resolved).toBe(true);
    expect(ok.data.absolutePath.startsWith(path.join(ctx.tempDir, "resources"))).toBe(true);
    expect(ok.data.absolutePath.endsWith(".md")).toBe(true);

    // 未知 rid → 404
    const missing = await request(port, "GET", "/api/resources/res_none/location");
    expect(missing.status).toBe(404);
  });

  // ─── Notes API Location（D6：{ kind, value } 包装，无扁平兼容字段）─────

  test("Notes API: location 统一为 { kind, value }，无 location_kind/location 扁平字段", async () => {
    const r = await request(port, "POST", "/api/notes", {
      title: "LocWrap",
      content: "x",
    });
    expect(r.status).toBe(201);
    expect(r.data.rid).toBeDefined();
    expect(r.data.location).toEqual({ kind: "local", value: expect.any(String) });
    expect(r.data.location_kind).toBeUndefined();
    expect(r.data.location).not.toHaveProperty("path");

    const g = await request(port, "GET", `/api/notes/${r.data.rid}`);
    expect(g.status).toBe(200);
    expect(g.data.location.kind).toBe("local");
    expect(g.data.location_kind).toBeUndefined();

    const list = await request(port, "GET", "/api/notes");
    expect(list.status).toBe(200);
    const found = list.data.data.find((x) => x.rid === r.data.rid);
    expect(found.location).toEqual({ kind: "local", value: expect.any(String) });
    expect(found.location_kind).toBeUndefined();
  });

  // ─── Event API ─────────────────────────────────────────────

  test("Event history: 资源创建后产生 resource.created 事件", async () => {
    // 创建资源（经 notes 端点 → OperationEngine → emitEvent）
    const r = await request(port, "POST", "/api/notes", { title: "EvNote", content: "x" });
    expect(r.status).toBe(201);

    // 等待事件落库
    await new Promise((res) => setTimeout(res, 300));

    const all = await request(port, "GET", "/api/events");
    expect(all.status).toBe(200);
    expect(all.data.data.some((e) => e.type === "resource.created")).toBe(true);

    // type 过滤
    const filtered = await request(port, "GET", "/api/events?type=resource.created");
    expect(filtered.status).toBe(200);
    expect(filtered.data.data.every((e) => e.type === "resource.created")).toBe(true);

    // limit
    const limited = await request(port, "GET", "/api/events?limit=2");
    expect(limited.status).toBe(200);
    expect(limited.data.data.length).toBeLessThanOrEqual(2);
  });
});
