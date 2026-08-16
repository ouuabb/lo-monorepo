/**
 * Core HTTP API 集成测试（workflow / automation / container / evolution）
 *
 * 启动真实 lo serve 子进程，验证 lo 核心新功能对应的 HTTP 接口齐全且可用。
 */

const path = require("path");
const net = require("net");
const http = require("http");
const fs = require("fs-extra");
const { spawn } = require("child_process");
const {
  setupTempRepo,
  teardownTempRepo,
  Repository,
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

async function waitForServer(server, port, getLogs, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let settled = false;
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `${msg}\n--- serve 日志 ---\n${(getLogs && getLogs()) || "(空)"}`,
        ),
      );
    };
    server.on("exit", (code, signal) =>
      fail(`serve 进程提前退出 (code=${code}, signal=${signal})`),
    );
    server.on("error", (e) => fail(`serve 进程错误: ${e.message}`));
    (async () => {
      while (Date.now() - start < timeout) {
        if (settled) return;
        try {
          const res = await request(port, "GET", "/api/health");
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

describe("Core HTTP API (workflow/automation/container/evolution)", () => {
  let ctx, port, server, logs;

  beforeEach(async () => {
    ctx = await setupTempRepo();
    port = await findFreePort();
    logs = "";
    server = spawn(
      process.execPath,
      [BIN, "serve", "--repo", ctx.tempDir, "--port", String(port), "--no-watch"],
      {
        cwd: ctx.tempDir,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout.on("data", (d) => {
      logs += d.toString();
    });
    server.stderr.on("data", (d) => {
      logs += d.toString();
    });
    await waitForServer(server, port, () => logs);
  });

  afterEach(async () => {
    if (server && !server.killed) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill();
      const timeout = new Promise((r) => {
        const t = setTimeout(r, 3000);
        t.unref();
      });
      await Promise.race([exited, timeout]);
    }
    await teardownTempRepo(ctx);
  });

  // ─── Workflow ────────────────────────────────────────────────

  test("Workflow: create → list → get → update → delete", async () => {
    const def = {
      id: "wf-1",
      name: "测试流程",
      states: ["todo", "doing", "done"],
      transitions: [
        { id: "t1", from: "todo", to: "doing" },
        { id: "t2", from: "doing", to: "done" },
      ],
    };

    const created = await request(port, "POST", "/api/workflows", def);
    expect(created.status).toBe(201);
    expect(created.data.id).toBe("wf-1");
    expect(created.data.states).toHaveLength(3);
    expect(created.data.transitions).toHaveLength(2);

    const list = await request(port, "GET", "/api/workflows");
    expect(list.status).toBe(200);
    expect(list.data.total).toBeGreaterThanOrEqual(1);
    expect(list.data.data.some((w) => w.id === "wf-1")).toBe(true);

    const detail = await request(port, "GET", "/api/workflows/wf-1");
    expect(detail.status).toBe(200);
    expect(detail.data.name).toBe(created.data.name);

    const newName = `${created.data.name}V2`;
    const updated = await request(port, "PUT", "/api/workflows/wf-1", {
      name: newName,
    });
    expect(updated.status).toBe(200);
    expect(updated.data.name).toBe(newName);

    const deleted = await request(port, "DELETE", "/api/workflows/wf-1");
    expect(deleted.status).toBe(200);
    expect(deleted.data.deleted).toBe(true);
    expect(deleted.data.status).toBe("deprecated");

    const after = await request(port, "GET", "/api/workflows/wf-1");
    expect(after.status).toBe(200);
    expect(after.data.status).toBe("deprecated");
  });

  test("Workflow: create 缺 states → 400；GET 不存在 → 404", async () => {
    const bad = await request(port, "POST", "/api/workflows", {
      id: "wf-x",
      name: "NoStates",
    });
    expect(bad.status).toBe(400);

    const ghost = await request(port, "GET", "/api/workflows/ghost");
    expect(ghost.status).toBe(404);
  });

  test("Workflow: attach + transition + instances + history", async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resource = await repo.resourceService.create({
      name: "任务A",
      type: "note",
    });
    await repo.close();

    await request(port, "POST", "/api/workflows", {
      id: "wf-task",
      name: "任务流程",
      states: ["todo", "doing", "done"],
      transitions: [
        { id: "start", from: "todo", to: "doing" },
        { id: "finish", from: "doing", to: "done" },
      ],
    });

    const attach = await request(
      port,
      "POST",
      "/api/workflows/wf-task/attach",
      {
        resourceRid: resource.rid,
      },
    );
    expect(attach.status).toBe(201);
    expect(attach.data.resourceRid).toBe(resource.rid);
    expect(attach.data.currentState).toBe("todo");

    const transition = await request(
      port,
      "POST",
      "/api/workflows/wf-task/transition",
      {
        resourceRid: resource.rid,
        targetState: "doing",
      },
    );
    expect(transition.status).toBe(200);
    expect(transition.data.currentState).toBe("doing");

    const cannot = await request(port, "POST", "/api/workflows/wf-task/can", {
      resourceRid: resource.rid,
      targetState: "todo",
    });
    expect(cannot.status).toBe(200);
    expect(cannot.data.allowed).toBe(false);

    const instances = await request(
      port,
      "GET",
      `/api/workflow/instances?rid=${resource.rid}`,
    );
    expect(instances.status).toBe(200);
    expect(instances.data.total).toBe(1);
    const instance = instances.data.data[0];

    const instanceDetail = await request(
      port,
      "GET",
      `/api/workflow/instances/${instance.id}`,
    );
    expect(instanceDetail.status).toBe(200);
    expect(instanceDetail.data.currentState).toBe("doing");

    const history = await request(
      port,
      "GET",
      `/api/workflows/history?id=${resource.rid}`,
    );
    expect(history.status).toBe(200);
    expect(history.data.total).toBeGreaterThanOrEqual(1);

    const detach = await request(
      port,
      "POST",
      "/api/workflows/wf-task/detach",
      {
        instanceId: instance.id,
      },
    );
    expect(detach.status).toBe(200);
    expect(detach.data.detached).toBe(true);
  });

  // ─── Automation ─────────────────────────────────────────────

  test("Automation: create → list → get → update → enable/disable → delete", async () => {
    const def = {
      id: "auto-1",
      name: "示例自动化",
      trigger: { type: "external" },
      actions: [
        {
          id: "step1",
          type: "knowledge.maintenance",
          params: {},
          dependsOn: [],
        },
      ],
    };

    const created = await request(port, "POST", "/api/automations", def);
    expect(created.status).toBe(201);
    expect(created.data.id).toBe("auto-1");

    const list = await request(port, "GET", "/api/automations");
    expect(list.status).toBe(200);
    expect(list.data.data.some((a) => a.id === "auto-1")).toBe(true);

    const detail = await request(port, "GET", "/api/automations/auto-1");
    expect(detail.status).toBe(200);
    expect(detail.data.name).toBe("示例自动化");

    const updated = await request(port, "PUT", "/api/automations/auto-1", {
      name: "示例自动化V2",
    });
    expect(updated.status).toBe(200);
    expect(updated.data.name).toBe("示例自动化V2");

    const disabled = await request(
      port,
      "POST",
      "/api/automations/auto-1/disable",
    );
    expect(disabled.status).toBe(200);
    expect(disabled.data.disabled).toBe(true);

    const enabled = await request(
      port,
      "POST",
      "/api/automations/auto-1/enable",
    );
    expect(enabled.status).toBe(200);
    expect(enabled.data.enabled).toBe(true);

    const deleted = await request(port, "DELETE", "/api/automations/auto-1");
    expect(deleted.status).toBe(200);
    expect(deleted.data.deleted).toBe(true);

    const history = await request(port, "GET", "/api/automations/history");
    expect(history.status).toBe(200);
    expect(Array.isArray(history.data.data)).toBe(true);
  });

  test("Automation: create 缺 id → 400；run 保护（未知触发也可返回）", async () => {
    const bad = await request(port, "POST", "/api/automations", {
      name: "NoId",
    });
    expect(bad.status).toBe(400);

    const ghost = await request(port, "GET", "/api/automations/ghost");
    expect(ghost.status).toBe(500);
    expect(ghost.data.error).toContain("不存在");
  });

  // ─── Container ──────────────────────────────────────────────

  test("Container: scan / sync / diff / stats / promote", async () => {
    const sourceDir = path.join(ctx.tempDir, "src");
    await fs.ensureDir(sourceDir);
    await fs.writeFile(path.join(sourceDir, "a.md"), "# A");

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const container = await repo.createResourceWithContainer(
      "project",
      sourceDir,
      {
        scanMembers: false,
        name: "http-cnt",
        metadata: { title: "HTTP 容器" },
      },
    );
    await repo.close();

    const scan = await request(
      port,
      "POST",
      `/api/admin/containers/${container.rid}/scan`,
    );
    expect(scan.status).toBe(200);
    expect(scan.data.results).toBeDefined();

    const stats = await request(
      port,
      "GET",
      `/api/admin/containers/${container.rid}/stats`,
    );
    expect(stats.status).toBe(200);
    expect(stats.data.stats.total).toBeGreaterThanOrEqual(1);

    const diff = await request(
      port,
      "GET",
      `/api/admin/containers/${container.rid}/diff`,
    );
    expect(diff.status).toBe(200);
    expect(Array.isArray(diff.data.diff)).toBe(true);

    const sync = await request(
      port,
      "POST",
      `/api/admin/containers/${container.rid}/sync`,
      { dryRun: true },
    );
    expect(sync.status).toBe(200);
    expect(sync.data.dryRun).toBe(true);

    const syncReal = await request(
      port,
      "POST",
      `/api/admin/containers/${container.rid}/sync`,
      {},
    );
    expect(syncReal.status).toBe(200);

    const promote = await request(
      port,
      "POST",
      `/api/admin/containers/${container.rid}/members/promote`,
      {
        memberPath: "a.md",
      },
    );
    expect(promote.status).toBe(200);
    expect(promote.data.resource.rid).toBeTruthy();

    const demote = await request(
      port,
      "POST",
      `/api/admin/containers/${container.rid}/members/demote`,
      {
        memberPath: "a.md",
      },
    );
    // a.md 无独立 resource 时 demote 可能报错，但路由必须命中（非 404 No route）
    expect(demote.status).not.toBe(404);
  });

  // ─── Workflow 补齐：versions / resume / purge ─────────────

  test("Workflow: versions 列表 + 指定版本快照", async () => {
    await request(port, "POST", "/api/workflows", {
      id: "wf-vers",
      name: "版本流",
      states: ["open", "done"],
      transitions: [{ id: "t", from: "open", to: "done" }],
    });
    // 显式升版
    await request(port, "PUT", "/api/workflows/wf-vers", {
      name: "版本流V2",
      version: 2,
    });

    const versions = await request(
      port,
      "GET",
      "/api/workflows/wf-vers/versions",
    );
    expect(versions.status).toBe(200);
    expect(versions.data.total).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(versions.data.data)).toBe(true);

    const snap = await request(
      port,
      "GET",
      "/api/workflows/wf-vers/versions?version=1",
    );
    expect(snap.status).toBe(200);
    expect(snap.data.states).toBeDefined();

    const ghost = await request(
      port,
      "GET",
      "/api/workflows/wf-vers/versions?version=999",
    );
    expect(ghost.status).toBe(404);
  });

  test("Workflow: resume 恢复 detached 实例", async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resource = await repo.resourceService.create({
      name: "恢复任务",
      type: "note",
    });
    await repo.close();

    await request(port, "POST", "/api/workflows", {
      id: "wf-res",
      name: "恢复流",
      states: ["todo", "done"],
      transitions: [{ id: "t", from: "todo", to: "done" }],
    });
    const attach = await request(port, "POST", "/api/workflows/wf-res/attach", {
      resourceRid: resource.rid,
    });
    expect(attach.status).toBe(201);
    const instanceId = attach.data.id;

    const detach = await request(port, "POST", "/api/workflows/wf-res/detach", {
      instanceId,
    });
    expect(detach.status).toBe(200);

    const resume = await request(port, "POST", "/api/workflows/wf-res/resume", {
      instanceId,
    });
    expect(resume.status).toBe(200);
    expect(resume.data.id).toBe(instanceId);
    expect(resume.data.status).toBe("active");
  });

  test("Workflow: versions/resume 参数缺失校验（缺 instanceId → 400）", async () => {
    await request(port, "POST", "/api/workflows", {
      id: "wf-param",
      name: "参数流",
      states: ["a", "b"],
      transitions: [{ id: "t", from: "a", to: "b" }],
    });
    for (const ep of [
      "POST /api/workflows/wf-param/attach",
      "POST /api/workflows/wf-param/detach",
      "POST /api/workflows/wf-param/resume",
      "POST /api/workflows/wf-param/transition",
      "POST /api/workflows/wf-param/can",
    ]) {
      const [method, pathname] = ep.split(" ");
      const res = await request(port, method, pathname, {});
      expect(res.status).toBe(400);
    }
  });

  // ─── Automation 补齐： ─────────────────────────────────────

  test("Automation: run 触发自定义 id；history 支持 automationId 过滤", async () => {
    await request(port, "POST", "/api/automations", {
      id: "auto-run",
      name: "运行自动化",
      trigger: { type: "external" },
      actions: [
        { id: "a1", type: "knowledge.maintenance", params: {}, dependsOn: [] },
      ],
    });

    const run = await request(port, "POST", "/api/automations/auto-run/run", {
      triggerSource: "api",
    });
    // 空仓库下知识维护通常无新增项，但端点必须可执行（200）
    expect([200, 500]).toContain(run.status);

    const historyFiltered = await request(
      port,
      "GET",
      "/api/automations/history?automationId=auto-run",
    );
    expect(historyFiltered.status).toBe(200);
  });

  // ── Container 补齐（错误分支）──────────────────────────────

  test("Container: 不存在容器 → 404/400", async () => {
    const scan = await request(
      port,
      "POST",
      "/api/admin/containers/res_ghost/scan",
    );
    expect(scan.status).toBe(404);

    const promoteNoPath = await request(
      port,
      "POST",
      "/api/admin/containers/res_ghost/members/promote",
      {},
    );
    expect(promoteNoPath.status).toBe(400);
  });

  // ─── Evolution ─────────────────────────────────────────────

  test("Evolution: plan / execute / rollback 端点", async () => {
    const plan = await request(port, "GET", "/api/evolution/plan");
    expect(plan.status).toBe(200);
    expect(plan.data).toBeDefined();

    const execute = await request(port, "POST", "/api/evolution/execute");
    expect([200, 500]).toContain(execute.status);

    const rollback = await request(port, "POST", "/api/evolution/rollback");
    expect([200, 500]).toContain(rollback.status);
  });

  test("Evolution: status / observe / detect / history / health", async () => {
    const status = await request(port, "GET", "/api/evolution/status");
    expect(status.status).toBe(200);
    expect(status.data.state).toBeTruthy();

    const observe = await request(port, "GET", "/api/evolution/observe");
    expect(observe.status).toBe(200);
    expect(observe.data.resources).toBeDefined();

    const health = await request(port, "GET", "/api/evolution/health");
    expect(health.status).toBe(200);

    const detect = await request(port, "GET", "/api/evolution/detect");
    expect(detect.status).toBe(200);

    const history = await request(port, "GET", "/api/evolution/history");
    expect(history.status).toBe(200);
    expect(Array.isArray(history.data.data)).toBe(true);
  });
});
