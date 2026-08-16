/**
 * modesHttp.test.cjs —— U1 Mode/Viewer HTTP API 集成测试
 *
 * 验证 /api/modes、/api/modes/:rid、/api/viewers?mode=:id。
 */
const path = require("path");
const net = require("net");
const http = require("http");
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

describe("Usage Mode/Viewer HTTP API (U1)", () => {
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
      await Promise.race([
        exited,
        new Promise((r) => {
          const t = setTimeout(r, 3000);
          t.unref();
        }),
      ]);
    }
    await teardownTempRepo(ctx);
  });

  test("GET /api/modes → builtin 3 个 Mode（无 annotating/metadata）", async () => {
    const res = await request(port, "GET", "/api/modes");
    expect(res.status).toBe(200);
    const ids = res.data.modes.map((m) => m.modeId);
    expect(ids).toEqual(["editing", "reading", "preview"]);
  });

  test("GET /api/modes/:rid：note → [editing]", async () => {
    const created = await request(port, "POST", "/api/notes", {
      title: "Mode 测试",
      content: "# hi",
    });
    expect(created.status).toBe(201);
    const rid = created.data.rid;

    const res = await request(port, "GET", `/api/modes/${rid}`);
    expect(res.status).toBe(200);
    expect(res.data.resource).toBe(rid);
    expect(res.data.modes.map((m) => m.modeId)).toEqual(["editing"]);
  });

  test("GET /api/modes/:rid：pdf → [reading]", async () => {
    const created = await request(port, "POST", "/api/notes", {
      type: "pdf",
      name: "doc",
    });
    expect(created.status).toBe(201);
    const rid = created.data.rid;

    const res = await request(port, "GET", `/api/modes/${rid}`);
    expect(res.status).toBe(200);
    expect(res.data.modes.map((m) => m.modeId)).toEqual(["reading"]);
  });

  test("GET /api/modes/:rid：epub（插件未装态）→ [reading]", async () => {
    const created = await request(port, "POST", "/api/notes", {
      type: "epub",
      name: "book",
    });
    expect(created.status).toBe(201);
    const rid = created.data.rid;

    const res = await request(port, "GET", `/api/modes/${rid}`);
    expect(res.status).toBe(200);
    expect(res.data.modes.map((m) => m.modeId)).toEqual(["reading"]);
    expect(res.data.modes.map((m) => m.modeId)).not.toContain("annotating");
  });

  test("GET /api/modes/:rid：未知 type → [preview]", async () => {
    const created = await request(port, "POST", "/api/notes", {
      type: "mystery-format",
      name: "mystery",
    });
    expect(created.status).toBe(201);
    const rid = created.data.rid;

    const res = await request(port, "GET", `/api/modes/${rid}`);
    expect(res.status).toBe(200);
    expect(res.data.modes.map((m) => m.modeId)).toEqual(["preview"]);
  });

  test("GET /api/viewers?mode=editing → [viewer.markdown-editor]", async () => {
    const res = await request(port, "GET", "/api/viewers?mode=editing");
    expect(res.status).toBe(200);
    expect(res.data.viewers.map((v) => v.viewerId)).toEqual([
      "viewer.markdown-editor",
    ]);
  });

  test("GET /api/viewers?mode=reading → [viewer.generic-preview]", async () => {
    const res = await request(port, "GET", "/api/viewers?mode=reading");
    expect(res.status).toBe(200);
    expect(res.data.viewers.map((v) => v.viewerId)).toEqual([
      "viewer.generic-preview",
    ]);
  });

  test("GET /api/viewers（无 mode）→ 全部 Viewer", async () => {
    const res = await request(port, "GET", "/api/viewers");
    expect(res.status).toBe(200);
    expect(res.data.viewers.map((v) => v.viewerId)).toEqual([
      "viewer.markdown-editor",
      "viewer.generic-preview",
    ]);
  });
});
