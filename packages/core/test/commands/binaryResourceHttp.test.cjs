/**
 * Resource Binary 端点集成测试（GET /api/resources/:rid/binary）
 *
 * 验证：二进制资源读取由 Core 负责解密，返回明文 base64——
 * 加密仓库（crypto.encryptByDefault=true）导入的图片经本端点可解回原文；
 * 外部消费者（@lo/client）不读盘、不参与解密。
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

describe("Resource Binary HTTP API", () => {
  describe("未加密仓库", () => {
    let ctx, port, server;

    beforeEach(async () => {
      ctx = await setupTempRepo();
      port = await findFreePort();
      server = spawn(
        process.execPath,
        [BIN, "serve", "--repo", ctx.tempDir, "--port", String(port), "--no-watch"],
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

    test("import 图片 → binary 返回明文 base64 与正确 mime", async () => {
      const png = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]);
      const imp = await request(port, "POST", "/api/resources/import", {
        buffer: png.toString("base64"),
        filename: "test.png",
        type: "image",
        metadata: { mimetype: "image/png" },
      });
      expect(imp.status).toBe(201);
      const rid = imp.data.rid;
      expect(rid).toMatch(/^res_/);

      const bin = await request(port, "GET", `/api/resources/${rid}/binary`);
      expect(bin.status).toBe(200);
      expect(bin.data.rid).toBe(rid);
      expect(bin.data.mime).toBe("image/png");
      expect(bin.data.size).toBe(png.length);
      expect(Buffer.from(bin.data.buffer, "base64").equals(png)).toBe(true);
    });

    test("未知 rid → 404", async () => {
      const res = await request(port, "GET", "/api/resources/res_none/binary");
      expect(res.status).toBe(404);
    });
  });

  describe("加密仓库（Core 侧解密）", () => {
    let ctx, port, server, encryptedRid;

    beforeEach(async () => {
      ctx = await setupTempRepo({ withCrypto: true });

      // 模拟真实场景：磁盘上已存在 LOEC 密文资源文件 + DB 登记
      const CryptoUtils = require("../../src/utils/crypto.cjs");
      const jpeg = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
      ]);
      const filePath = path.join(ctx.tempDir, "resources", "photo.jpg");
      await fs.ensureDir(path.dirname(filePath));
      const key = CryptoUtils.loadRepoKey(ctx.tempDir);
      await CryptoUtils.writeEncryptedFile(filePath, jpeg, key);

      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      const resource = await repo.resourceService.create({
        type: "image",
        location_kind: "local",
        location: "resources/photo.jpg",
        name: "photo.jpg",
        metadata: { mimetype: "image/jpeg" },
      });
      encryptedRid = resource.rid;
      await repo.close();

      port = await findFreePort();
      server = spawn(
        process.execPath,
        [BIN, "serve", "--repo", ctx.tempDir, "--port", String(port), "--no-watch"],
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

    test("LOEC 密文资源 → binary 端点返回解密后的明文 base64", async () => {
      const jpeg = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
      ]);

      // 落盘确认为密文（LOEC magic），磁盘大小 ≠ 明文大小（+33 头）
      const disk = await fs.readFile(path.join(ctx.tempDir, "resources", "photo.jpg"));
      expect(disk.subarray(0, 4).toString("latin1")).toBe("LOEC");
      expect(disk.length).not.toBe(jpeg.length);

      // binary 端点解密返回原文
      const bin = await request(port, "GET", `/api/resources/${encryptedRid}/binary`);
      expect(bin.status).toBe(200);
      expect(bin.data.rid).toBe(encryptedRid);
      expect(bin.data.mime).toBe("image/jpeg");
      expect(bin.data.size).toBe(jpeg.length);
      expect(Buffer.from(bin.data.buffer, "base64").equals(jpeg)).toBe(true);
    });
  });
});