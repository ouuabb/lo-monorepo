const http = require("http");
const path = require("path");
const fs = require("fs-extra");
const chalk = require("chalk");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const os = require("os");
const Repository = require("../repo/repository.cjs");
const CryptoUtils = require("../utils/crypto.cjs");
const SshAuth = require("../utils/sshAuth.cjs");
const SyncRemote = require("../utils/syncRemote.cjs");
const {
  mountPluginRoutes,
  isPluginEndpointAllowed,
} = require("../plugin/pluginHttp.cjs");
const { resolveRemote } = require("./remote.cjs");

// ---------------------------------------------------------------------------
// Project root & admin SPA config
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const ADMIN_DIST = path.join(PROJECT_ROOT, "admin", "dist");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function notFound(res, message = "Not found") {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

function badRequest(res, message) {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

function serverError(res, message) {
  res.writeHead(500, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

function conflict(res, message) {
  res.writeHead(409, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

function jsonOk(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * 读取 body（用于 JSON 解析）
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * 解析 URL 路径中的 rid
 */
function extractRid(urlPath) {
  const match = urlPath.match(/^\/api\/notes\/(res_[a-zA-Z0-9_]+)/);
  return match ? match[1] : null;
}

/**
 * 读取资源文件内容（自动解密）
 */
async function readResourceContent(filePath, cryptoKey) {
  const raw = await fs.readFile(filePath);

  if (raw.length >= 4 && raw.subarray(0, 4).equals(CryptoUtils.MAGIC)) {
    if (!cryptoKey) {
      throw new Error("文件已加密但无法获取解密密钥");
    }
    return CryptoUtils.decryptFile(raw, cryptoKey).toString("utf-8");
  }

  return raw.toString("utf-8");
}

// ---------------------------------------------------------------------------
// Multipart 解析（文件上传）
// ---------------------------------------------------------------------------

/**
 * 解析 multipart/form-data 请求体
 * @param {Buffer} body - 原始请求体
 * @param {string} boundary - 分界符（不含开头的 --）
 * @returns {{fields: Object<string,string>, files: Array<{name:string, filename:string, contentType:string, data:Buffer}>}}
 */
function parseMultipart(body, boundary) {
  const fields = {};
  const files = [];
  const fullBoundary = Buffer.from(`--${boundary}`);

  let pos = body.indexOf(fullBoundary);
  while (pos !== -1) {
    // 跳过 boundary 和 \r\n
    let start = pos + fullBoundary.length;
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;

    // 找到下一个 boundary
    const nextBoundary = body.indexOf(fullBoundary, start);
    if (nextBoundary === -1) break;

    // 提取当前 part（去掉末尾 \r\n）
    let partEnd = nextBoundary - 2;
    if (body[partEnd] === 0x0d && body[partEnd + 1] === 0x0a) {
      // ok
    } else {
      partEnd = nextBoundary;
    }
    const part = body.slice(start, partEnd);

    // 分割 headers 和 body
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) {
      pos = nextBoundary;
      continue;
    }

    const headerText = part.slice(0, headerEnd).toString("utf-8");
    const data = part.slice(headerEnd + 4);

    // 解析 Content-Disposition
    const nameMatch = headerText.match(/name="([^"]+)"/);
    if (!nameMatch) {
      pos = nextBoundary;
      continue;
    }
    const name = nameMatch[1];

    const filenameMatch = headerText.match(/filename="([^"]+)"/);
    const contentTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);

    if (filenameMatch) {
      files.push({
        name,
        filename: decodeURIComponent(filenameMatch[1]),
        contentType: contentTypeMatch
          ? contentTypeMatch[1].trim()
          : "application/octet-stream",
        data,
      });
    } else {
      fields[name] = data.toString("utf-8");
    }

    pos = nextBoundary;
  }

  return { fields, files };
}

// ---------------------------------------------------------------------------
// SSH 挑战-应答认证（API 层）
// ---------------------------------------------------------------------------

/**
 * 验证 SSH 签名
 * @param {string} nonce - 挑战随机数
 * @param {string} publicKey - 注册的公钥（OpenSSH 格式）
 * @param {string} signatureBase64 - 客户端发来的签名（.sig 文件的 base64）
 * @returns {boolean}
 */
function verifySshSignature(nonce, publicKey, signatureBase64) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "lo-api-auth-"));
  try {
    const challengeFile = path.join(workDir, "challenge.txt");
    const sigFile = path.join(workDir, "challenge.txt.sig");
    const allowedSignersFile = path.join(workDir, "allowed_signers");

    fs.writeFileSync(challengeFile, nonce);
    fs.writeFileSync(sigFile, Buffer.from(signatureBase64, "base64"));

    const pubParts = publicKey.split(/\s+/);
    if (pubParts.length < 2) return false;
    const signersContent = `* ${pubParts[0]} ${pubParts[1]} ${pubParts.slice(2).join(" ") || ""}`;
    fs.writeFileSync(allowedSignersFile, signersContent);

    execFileSync(
      "ssh-keygen",
      ["-Y", "verify", "-f", allowedSignersFile, "-n", "lo-cli", "-I", "lo-cli", "-s", sigFile],
      { stdio: "pipe", windowsHide: true, timeout: 15000, input: nonce },
    );

    return true;
  } catch {
    return false;
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (e) {
      console.error("serve: 清理SSH验证临时目录失败", e);
    }
  }
}

// ---------------------------------------------------------------------------
// 会话管理
// ---------------------------------------------------------------------------

/**
 * @type {Map<string, {fingerprint: string, label: string, expiresAt: number}>}
 */
const sessions = new Map();

/**
 * @type {Map<string, {timestamp: number}>}
 */
const pendingChallenges = new Map();

const SESSION_TTL_MS = 60 * 60 * 1000; // session 有效期 60 分钟
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 挑战有效期 5 分钟

function createSession(user, label) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    user,
    label,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function validateSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function cleanupExpired() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token);
  }
  for (const [nonce, challenge] of pendingChallenges) {
    if (now - challenge.timestamp > CHALLENGE_TTL_MS)
      pendingChallenges.delete(nonce);
  }
}

// 每 5 分钟清理过期数据
setInterval(cleanupExpired, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// 路由表
// ---------------------------------------------------------------------------

const GET_ROUTES = new Map();
const POST_ROUTES = new Map();
const PUT_ROUTES = new Map();
const DELETE_ROUTES = new Map();

function route(method, pattern, handler) {
  const map = {
    GET: GET_ROUTES,
    POST: POST_ROUTES,
    PUT: PUT_ROUTES,
    DELETE: DELETE_ROUTES,
  }[method];
  if (!map) throw new Error(`Unknown HTTP method: ${method}`);
  const isNew = !map.has(pattern);
  map.set(pattern, handler);
  return isNew;
}

// ---- SSH 认证端点 ------------------------------------------------

route(
  "POST",
  "/api/auth/challenge",
  async (req, res, { authState, reloadKeys }) => {
    await reloadKeys();
    if (!authState.needAuth) {
      return badRequest(res, "仓库未注册任何 SSH 公钥，无需认证");
    }
    const nonce = crypto.randomBytes(32).toString("hex");
    pendingChallenges.set(nonce, { timestamp: Date.now() });

    jsonOk(res, {
      nonce,
      namespace: "lo-cli",
      registeredKeys: authState.registeredKeys.map((k) => ({
        fingerprint: k.fingerprint,
        label: k.label,
        keyType: k.keyType,
      })),
    });
  },
);

route(
  "POST",
  "/api/auth/reload",
  async (req, res, { authState, reloadKeys }) => {
    await reloadKeys();
    jsonOk(res, {
      message: "密钥列表已刷新",
      count: authState.registeredKeys.length,
      keys: authState.registeredKeys.map((k) => ({
        fingerprint: k.fingerprint,
        label: k.label,
      })),
    });
  },
);

route("POST", "/api/auth/login", async (req, res, { authState }) => {
  if (!authState.registeredKeys || authState.registeredKeys.length === 0) {
    return badRequest(res, "仓库未注册任何 SSH 公钥，无需认证");
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }

  const { nonce, fingerprint, signature } = body;
  if (!nonce || !fingerprint || !signature) {
    return badRequest(res, "缺少 nonce、fingerprint 或 signature 字段");
  }

  // 验证 nonce 有效（防重放）
  const challenge = pendingChallenges.get(nonce);
  if (!challenge) {
    return badRequest(res, "无效或已过期的 nonce，请重新获取挑战");
  }
  pendingChallenges.delete(nonce);

  // 找到对应的注册公钥
  const registeredKey = authState.registeredKeys.find(
    (k) => k.fingerprint === fingerprint,
  );
  if (!registeredKey) {
    return badRequest(res, "未注册的 SSH 指纹");
  }

  // 验证签名
  if (!verifySshSignature(nonce, registeredKey.publicKey, signature)) {
    return jsonOk(res, { error: "SSH 签名验证失败" }, 401);
  }

  // 签发 session token
  const token = createSession(fingerprint, registeredKey.label);
  jsonOk(res, { token, label: registeredKey.label, fingerprint });
});

// ---- 业务端点 ------------------------------------------------

route("GET", "/api/health", async (req, res, { repo }) => {
  const stats = await repo.getStats();
  jsonOk(res, { status: "ok", uptime: process.uptime(), stats });
});

route("GET", "/api/stats", async (req, res, { repo }) => {
  const stats = await repo.getStats();
  jsonOk(res, stats);
});

route("GET", "/api/tags", async (req, res, { repo }) => {
  const resources = await repo.getAllResources();
  const tags = new Set();
  for (const r of resources) {
    const md = r.metadata || {};
    if (Array.isArray(md.tags)) {
      md.tags.forEach((t) => tags.add(t));
    }
  }
  jsonOk(res, { tags: [...tags].sort() });
});

route("GET", "/api/notes", async (req, res, { repo, url }) => {
  const type = url.searchParams.get("type") || null;
  const schema = url.searchParams.get("schema") || null;
  const limit = parseInt(url.searchParams.get("limit")) || 50;
  const offset = parseInt(url.searchParams.get("offset")) || 0;
  const resources = await repo.getAllResources({ type, schema, limit, offset });
  jsonOk(res, { total: resources.length, limit, offset, data: resources });
});

route("GET", "/api/notes/:rid", async (req, res, { repo, url }) => {
  const rid = extractRid(url.pathname);
  if (!rid) return notFound(res, "Invalid rid");

  const resource = await repo.getResource(rid);
  if (!resource) return notFound(res, "Resource not found");
  if (resource.deleted) return notFound(res, "Resource has been deleted");

  try {
    const content = await readResourceContent(resource.path, repo.cryptoKey);
    jsonOk(res, { ...resource, content });
  } catch (e) {
    serverError(res, `Failed to read file: ${e.message}`);
  }
});

route("GET", "/api/search", async (req, res, { repo, url }) => {
  const q = url.searchParams.get("q");
  if (!q) return badRequest(res, 'Missing query parameter "q"');
  const results = await repo.search(q);
  jsonOk(res, { query: q, total: results.length, data: results });
});

route("POST", "/api/notes/upload", async (req, res, { repo }) => {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(.+)/);
  if (!boundaryMatch) {
    return badRequest(res, "需要 multipart/form-data 请求");
  }
  const boundary = boundaryMatch[1].replace(/^["']|["']$/g, "");

  // 读取完整 body
  const chunks = [];
  try {
    await new Promise((resolve, reject) => {
      req.on("data", (c) => chunks.push(c));
      req.on("end", resolve);
      req.on("error", reject);
    });
  } catch (e) {
    return badRequest(res, "读取文件失败");
  }

  const body = Buffer.concat(chunks);
  const { fields, files } = parseMultipart(body, boundary);

  if (files.length === 0) {
    return badRequest(res, '未找到上传的文件（field name 需为 "file"）');
  }

  const results = [];
  for (const file of files) {
    const title = fields.title || file.filename;
    let tags = [];
    if (fields.tags) {
      tags = fields.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }

    // 资源类型由 Core 模型层按 filename 认定（createResource 内部），此处不推断

    try {
      const result = await repo.createResource(null, file.data, {
        filename: file.filename,
        metadata: {
          title,
          tags,
          mimetype: file.contentType,
          size: file.data.length,
        },
      });
      results.push(result);
    } catch (e) {
      if (e.code === "RESOURCE_EXISTS") return conflict(res, e.message);
      return serverError(res, `保存文件失败: ${e.message}`);
    }
  }

  jsonOk(
    res,
    {
      uploaded: results.length,
      data: results,
    },
    201,
  );
});

route("POST", "/api/notes", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }

  const { type, content, metadata = {}, filename } = body;
  if (!content && !body.title)
    return badRequest(res, 'Missing "content" or "title" field');

  const actualContent = content || body.title || "";
  const mergedMetadata = { ...metadata };
  if (body.title && !mergedMetadata.title) mergedMetadata.title = body.title;
  if (body.tags && !mergedMetadata.tags) mergedMetadata.tags = body.tags;
  if (body.category && !mergedMetadata.category)
    mergedMetadata.category = body.category;

  try {
    const result = await repo.createResource(type, actualContent, {
      filename,
      metadata: mergedMetadata,
    });
    jsonOk(res, result, 201);
  } catch (e) {
    if (e.code === "RESOURCE_EXISTS") return conflict(res, e.message);
    serverError(res, e.message);
  }
});

route("PUT", "/api/notes/:rid", async (req, res, { repo, url }) => {
  const rid = extractRid(url.pathname);
  if (!rid) return notFound(res, "Invalid rid");

  const resource = await repo.getResource(rid);
  if (!resource) return notFound(res, "Resource not found");
  if (resource.deleted) return notFound(res, "Resource has been deleted");

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }

  const updates = {};
  const { content } = body;

  try {
    if (content !== undefined) {
      // 内容写入下沉到 resourceService.updateContent（加密感知 + refresh）
      const refreshed = await repo.resourceService.updateContent(rid, content);
      updates.hash = refreshed.hash;
      if (!body.metadata && !body.title) {
        // 未显式传 metadata 时，使用 refresh 提取的结果
        updates.metadata = refreshed.metadata;
      }
    }

    // 用户显式传入的 metadata/title/tags/category 覆盖 refresh 结果
    if (body.metadata !== undefined) {
      updates.metadata = {
        ...(updates.metadata || resource.metadata || {}),
        ...body.metadata,
      };
    }
    if (body.title !== undefined) {
      updates.metadata = {
        ...(updates.metadata || resource.metadata || {}),
        title: body.title,
      };
    }
    if (body.tags !== undefined) {
      updates.metadata = {
        ...(updates.metadata || resource.metadata || {}),
        tags: body.tags,
      };
    }
    if (body.category !== undefined) {
      updates.metadata = {
        ...(updates.metadata || resource.metadata || {}),
        category: body.category,
      };
    }

    if (Object.keys(updates).length > 0) {
      const result = await repo.updateResource(rid, updates);
      jsonOk(res, result);
    } else {
      jsonOk(res, resource);
    }
  } catch (e) {
    serverError(res, e.message);
  }
});

route("DELETE", "/api/notes/:rid", async (req, res, { repo, url }) => {
  const rid = extractRid(url.pathname);
  if (!rid) return notFound(res, "Invalid rid");

  const hard = url.searchParams.get("hard") === "true";
  try {
    const result = await repo.deleteResource(rid, !hard);
    jsonOk(res, result);
  } catch (e) {
    serverError(res, e.message);
  }
});

// ---- Schema 端点 ----------------------------------------------------
// 供 Schema 语义系统的管理/消费入口：CRUD + attach/detach + 按 schema 过滤资源

function extractSchemaId(urlPath) {
  const match = urlPath.match(/^\/api\/schemas\/([^/]+)(\/attach|\/detach)?$/);
  return match
    ? { id: decodeURIComponent(match[1]), action: match[2] || null }
    : null;
}

function extractViewId(urlPath) {
  const match = urlPath.match(/^\/api\/views\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractRunViewId(urlPath) {
  const match = urlPath.match(/^\/api\/views\/([^/]+)\/run$/);
  return match ? decodeURIComponent(match[1]) : null;
}

route("GET", "/api/schemas", async (req, res, { repo, url }) => {
  const status = url.searchParams.get("status") || undefined;
  try {
    const schemas = await repo.schemaRegistry.listSchemas({ status });
    jsonOk(res, { total: schemas.length, data: schemas });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/schemas", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { id, name, fields, relations, metadata, behaviors } = body;
  if (!id) return badRequest(res, 'Missing "id" field');
  try {
    const schema = await repo.createSchema({
      id,
      name: name || id,
      fields: fields || [],
      relations: relations || [],
      metadata: metadata || {},
      behaviors: behaviors || {},
    });
    jsonOk(res, schema, 201);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/schemas/:id", async (req, res, { repo, url }) => {
  const parsed = extractSchemaId(url.pathname);
  if (!parsed || parsed.action) return notFound(res, "Invalid schema id");
  const schema =
    (await repo.schemaRegistry.getSchema(parsed.id)) ||
    (await repo.schemaRegistry.getSchemaByName(parsed.id));
  if (!schema) return notFound(res, "Schema not found");
  jsonOk(res, schema);
});

route("PUT", "/api/schemas/:id", async (req, res, { repo, url }) => {
  const parsed = extractSchemaId(url.pathname);
  if (!parsed || parsed.action) return notFound(res, "Invalid schema id");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  try {
    const schema = await repo.updateSchema(parsed.id, body);
    jsonOk(res, schema);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("DELETE", "/api/schemas/:id", async (req, res, { repo, url }) => {
  const parsed = extractSchemaId(url.pathname);
  if (!parsed || parsed.action) return notFound(res, "Invalid schema id");
  try {
    const ok = await repo.deleteSchema(parsed.id);
    if (!ok || !ok.deleted) return notFound(res, "Schema not found");
    jsonOk(res, { deleted: true, id: parsed.id });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/schemas/:id/attach", async (req, res, { repo, url }) => {
  const parsed = extractSchemaId(url.pathname);
  if (!parsed || parsed.action !== "/attach")
    return notFound(res, "Invalid attach path");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { rid } = body;
  if (!rid) return badRequest(res, 'Missing "rid" field');
  try {
    const resource = await repo.resourceService.getByRid(rid);
    if (!resource) return notFound(res, "Resource not found");
    const attached = await repo.schemaRegistry.attachSchema(rid, parsed.id);
    jsonOk(res, attached);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/schemas/:id/detach", async (req, res, { repo, url }) => {
  const parsed = extractSchemaId(url.pathname);
  if (!parsed || parsed.action !== "/detach")
    return notFound(res, "Invalid detach path");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const rid = (body && body.rid) || url.searchParams.get("rid");
  if (!rid) return badRequest(res, 'Missing "rid" field');
  try {
    const ok = await repo.schemaRegistry.detachSchema(rid);
    if (!ok) return notFound(res, "Resource has no schema attached");
    jsonOk(res, { detached: true, rid });
  } catch (e) {
    serverError(res, e.message);
  }
});

// ---- View 端点 ------------------------------------------------------
// 供 View 资源观察层（方案 C）的管理/消费入口：CRUD + run + export/import

route("GET", "/api/views", async (req, res, { repo, url }) => {
  const status = url.searchParams.get("status") || undefined;
  try {
    const views = await repo.viewRegistry.listViews({ status });
    jsonOk(res, { total: views.length, data: views });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/views", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { id, name, query, fields, mode, presentation, metadata } = body;
  if (!id) return badRequest(res, 'Missing "id" field');
  try {
    const view = await repo.createView({
      id,
      name: name || id,
      query: query || { conditions: [] },
      fields: fields || [],
      mode,
      presentation: presentation || {},
      metadata: metadata || {},
    });
    jsonOk(res, view, 201);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/views/:id", async (req, res, { repo, url }) => {
  const id = extractViewId(url.pathname);
  if (!id) return notFound(res, "Invalid view id");
  const view =
    (await repo.viewRegistry.getView(id)) ||
    (await repo.viewRegistry.getViewByName(id));
  if (!view) return notFound(res, "View not found");
  jsonOk(res, view);
});

route("PUT", "/api/views/:id", async (req, res, { repo, url }) => {
  const id = extractViewId(url.pathname);
  if (!id) return notFound(res, "Invalid view id");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  try {
    const view = await repo.updateView(id, body);
    jsonOk(res, view);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("DELETE", "/api/views/:id", async (req, res, { repo, url }) => {
  const id = extractViewId(url.pathname);
  if (!id) return notFound(res, "Invalid view id");
  try {
    const ok = await repo.deleteView(id);
    if (!ok || !ok.deleted) return notFound(res, "View not found");
    jsonOk(res, { deleted: true, id });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/views/:id/run", async (req, res, { repo, url }) => {
  const id = extractRunViewId(url.pathname);
  if (!id) return notFound(res, "Invalid run path");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    body = {};
  }
  try {
    const result = await repo.viewRegistry.renderView(id, {
      limit: body && body.limit,
      offset: body && body.offset,
    });
    jsonOk(res, result);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/views/:id/export", async (req, res, { repo, url }) => {
  const m = url.pathname.match(/^\/api\/views\/([^/]+)\/export$/);
  const id = m ? decodeURIComponent(m[1]) : null;
  if (!id) return notFound(res, "Invalid view id");
  const data = await repo.viewRegistry.exportView(id);
  if (!data) return notFound(res, "View not found");
  jsonOk(res, data);
});

route("POST", "/api/views/import", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  if (!body || typeof body !== "object" || !body.id)
    return badRequest(res, "Empty or invalid view definition");
  try {
    const view = await repo.createView(body);
    jsonOk(res, view, 201);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/sync", async (req, res, { repo, url }) => {
  const full = url.searchParams.get("full") === "true";
  try {
    const result = await repo.sync({ full });
    jsonOk(res, result);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/sync/push", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }

  const { remote } = body;
  if (!remote) return badRequest(res, 'Missing "remote" field');

  try {
    const target = resolveRemote(repo, remote) || remote;
    const syncRemote = new SyncRemote(repo.repoPath);
    const syncOps = repo.syncOps;

    const ops = await syncOps.getUnsyncedOps(target);
    if (!ops || ops.length === 0) {
      return jsonOk(res, { pushed: 0, message: "没有需要推送的变更" });
    }

    const batchId = await syncRemote.pushBatch(target, ops);
    await syncOps.markSynced(ops, target);
    jsonOk(res, { pushed: ops.length, batchId });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/sync/pull", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }

  const { remote } = body;
  if (!remote) return badRequest(res, 'Missing "remote" field');

  try {
    const target = resolveRemote(repo, remote) || remote;
    const syncRemote = new SyncRemote(repo.repoPath);
    const result = await syncRemote.pullLatestBatch(target);
    if (!result) {
      return jsonOk(res, { pulled: 0, message: "没有新的批次" });
    }

    const { manifest, ops } = result;
    const syncOps = repo.syncOps;
    const applied = await syncOps.applyOps(ops, manifest.device_id);

    await syncRemote.installResources(result.extractDir, repo.repoPath);

    const latestOp = ops.reduce(
      (max, op) => (op.timestamp > max.timestamp ? op : max),
      ops[0],
    );
    await syncOps.setSyncAnchor(target, {
      last_op_id: latestOp.op_id,
      last_op_timestamp: latestOp.timestamp,
    });

    await repo.sync({ silent: true });

    jsonOk(res, { pulled: applied, opsInBatch: ops.length });
  } catch (e) {
    serverError(res, e.message);
  }
});

// ===========================================================================
// Workflow 端点（状态机）
// ===========================================================================

route("GET", "/api/workflows", async (req, res, { repo, url }) => {
  try {
    await repo.initWorkflowSystem();
    const workflows = await repo.listWorkflows();
    jsonOk(res, { total: workflows.length, data: workflows });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/workflows", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  if (!body || !Array.isArray(body.states) || body.states.length === 0) {
    return badRequest(res, "创建工作流需要定义 states");
  }
  try {
    await repo.initWorkflowSystem();
    const wf = await repo.createWorkflow(body);
    jsonOk(res, wf, 201);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/workflows/:id", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/workflows\/([^/]+)$/);
  if (!match) return notFound(res, "Invalid workflow id");
  const id = decodeURIComponent(match[1]);
  try {
    await repo.initWorkflowSystem();
    const wf = await repo.getWorkflow(id);
    if (!wf) return notFound(res, "Workflow not found");
    jsonOk(res, wf);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("PUT", "/api/workflows/:id", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/workflows\/([^/]+)$/);
  if (!match) return notFound(res, "Invalid workflow id");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  try {
    await repo.initWorkflowSystem();
    const wf = await repo.updateWorkflow(decodeURIComponent(match[1]), body);
    jsonOk(res, wf);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("DELETE", "/api/workflows/:id", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/workflows\/([^/]+)$/);
  if (!match) return notFound(res, "Invalid workflow id");
  const id = decodeURIComponent(match[1]);
  const purge = url.searchParams.get("purge") === "true";
  try {
    await repo.initWorkflowSystem();
    if (purge) {
      await repo.purgeWorkflow(id);
      jsonOk(res, { deleted: true, purge: true, id });
    } else {
      await repo.deleteWorkflow(id);
      jsonOk(res, { deleted: true, id, status: "deprecated" });
    }
  } catch (e) {
    serverError(res, e.message);
  }
});

route(
  "GET",
  "/api/workflows/:id/versions",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(/^\/api\/workflows\/([^/]+)\/versions$/);
    if (!match) return notFound(res, "Invalid workflow id");
    const id = decodeURIComponent(match[1]);
    const version = url.searchParams.get("version");
    try {
      await repo.initWorkflowSystem();
      if (version !== null) {
        const snap = await repo.getWorkflowVersion(id, parseInt(version));
        if (!snap) return notFound(res, "Workflow version snapshot not found");
        return jsonOk(res, snap);
      }
      const versions = await repo.listWorkflowVersions(id);
      jsonOk(res, { total: versions.length, data: versions });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

route("POST", "/api/workflows/:id/attach", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/workflows\/([^/]+)\/attach$/);
  if (!match) return notFound(res, "Invalid attach path");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { resourceRid, state, actor } = body;
  if (!resourceRid) return badRequest(res, 'Missing "resourceRid" field');
  try {
    await repo.initWorkflowSystem();
    const instance = await repo.attachWorkflow(resourceRid, match[1], {
      initialState: state,
      actor: actor || "api",
    });
    jsonOk(res, instance, 201);
  } catch (e) {
    serverError(res, e.message);
  }
});

route(
  "POST",
  "/api/workflows/:id/detach",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(/^\/api\/workflows\/([^/]+)\/detach$/);
    if (!match) return notFound(res, "Invalid detach path");
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return badRequest(res, e.message);
    }
    const { instanceId } = body;
    if (!instanceId) return badRequest(res, 'Missing "instanceId" field');
    try {
      await repo.initWorkflowSystem();
      const ok = await repo.detachWorkflow(instanceId);
      if (!ok) return notFound(res, "Workflow instance not found");
      jsonOk(res, { detached: true, instanceId });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

route("POST", "/api/workflows/:id/resume", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/workflows\/([^/]+)\/resume$/);
  if (!match) return notFound(res, "Invalid resume path");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { instanceId, actor } = body;
  if (!instanceId) return badRequest(res, 'Missing "instanceId" field');
  try {
    await repo.initWorkflowSystem();
    const instance = await repo.resumeWorkflow(instanceId, {
      actor: actor || "api",
    });
    jsonOk(res, instance);
  } catch (e) {
    serverError(res, e.message);
  }
});

route(
  "POST",
  "/api/workflows/:id/transition",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(/^\/api\/workflows\/([^/]+)\/transition$/);
    if (!match) return notFound(res, "Invalid transition path");
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return badRequest(res, e.message);
    }
    const { resourceRid, targetState, actor, metadata } = body;
    if (!resourceRid) return badRequest(res, 'Missing "resourceRid" field');
    if (!targetState) return badRequest(res, 'Missing "targetState" field');
    try {
      await repo.initWorkflowSystem();
      const instance = await repo.transitionWorkflow({
        resourceRid,
        workflowId: match[1],
        targetState,
        actor: actor || "api",
        metadata,
      });
      jsonOk(res, instance);
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

route("POST", "/api/workflows/:id/can", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/workflows\/([^/]+)\/can$/);
  if (!match) return notFound(res, "Invalid precheck path");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { resourceRid, targetState } = body;
  if (!resourceRid) return badRequest(res, 'Missing "resourceRid" field');
  if (!targetState) return badRequest(res, 'Missing "targetState" field');
  try {
    await repo.initWorkflowSystem();
    const result = await repo.canTransitionWorkflow({
      resourceRid,
      workflowId: match[1],
      targetState,
    });
    jsonOk(res, result);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/workflow/instances", async (req, res, { repo, url }) => {
  try {
    await repo.initWorkflowSystem();
    const instances = await repo.listWorkflowInstances({
      workflowId: url.searchParams.get("wf") || undefined,
      resourceRid: url.searchParams.get("rid") || undefined,
    });
    jsonOk(res, { total: instances.length, data: instances });
  } catch (e) {
    serverError(res, e.message);
  }
});

route(
  "GET",
  "/api/workflow/instances/:id",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(/^\/api\/workflow\/instances\/([^/]+)$/);
    if (!match) return notFound(res, "Invalid instance id");
    try {
      await repo.initWorkflowSystem();
      const instance = await repo.getWorkflowInstance(match[1]);
      if (!instance) return notFound(res, "Workflow instance not found");
      jsonOk(res, instance);
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

route("GET", "/api/workflows/history", async (req, res, { repo, url }) => {
  try {
    await repo.initWorkflowSystem();
    const limit = parseInt(url.searchParams.get("limit")) || 20;
    const filter = {};
    const id = url.searchParams.get("id");
    if (id) {
      const instance = await repo.getWorkflowInstance(id);
      if (instance) filter.instanceId = id;
      else {
        const wf = await repo.getWorkflow(id);
        if (wf) filter.workflowId = id;
        else filter.resourceRid = id;
      }
    }
    const history = await repo.getWorkflowHistory(filter, limit);
    jsonOk(res, { total: history.length, data: history });
  } catch (e) {
    serverError(res, e.message);
  }
});

// ===========================================================================
// Automation 端点（行为编排）
// ===========================================================================

route("GET", "/api/automations", async (req, res, { repo }) => {
  try {
    await repo.initAutomationSystem();
    const automations = await repo.automationList();
    jsonOk(res, { total: automations.length, data: automations });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/automations", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  if (!body || !body.id) return badRequest(res, 'Missing "id" field');
  try {
    await repo.initAutomationSystem();
    const automation = await repo.automationCreate(body);
    jsonOk(res, automation, 201);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/automations/:id", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/automations\/([^/]+)$/);
  if (!match) return notFound(res, "Invalid automation id");
  try {
    await repo.initAutomationSystem();
    const automation = await repo.automationShow(match[1]);
    if (!automation) return notFound(res, "Automation not found");
    jsonOk(res, automation);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("PUT", "/api/automations/:id", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/automations\/([^/]+)$/);
  if (!match) return notFound(res, "Invalid automation id");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  try {
    await repo.initAutomationSystem();
    const automation = await repo.automationUpdate(match[1], body);
    jsonOk(res, automation);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("DELETE", "/api/automations/:id", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/automations\/([^/]+)$/);
  if (!match) return notFound(res, "Invalid automation id");
  try {
    await repo.initAutomationSystem();
    const result = await repo.automationRemove(match[1]);
    jsonOk(res, { deleted: true, id: match[1], result });
  } catch (e) {
    serverError(res, e.message);
  }
});

route(
  "POST",
  "/api/automations/:id/enable",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(/^\/api\/automations\/([^/]+)\/enable$/);
    if (!match) return notFound(res, "Invalid enable path");
    try {
      await repo.initAutomationSystem();
      const automation = await repo.automationEnable(match[1]);
      jsonOk(res, { enabled: true, id: match[1], automation });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

route(
  "POST",
  "/api/automations/:id/disable",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(/^\/api\/automations\/([^/]+)\/disable$/);
    if (!match) return notFound(res, "Invalid disable path");
    try {
      await repo.initAutomationSystem();
      const automation = await repo.automationDisable(match[1]);
      jsonOk(res, { disabled: true, id: match[1], automation });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

route("POST", "/api/automations/:id/run", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/automations\/([^/]+)\/run$/);
  if (!match) return notFound(res, "Invalid run path");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  try {
    await repo.initAutomationSystem();
    const run = await repo.automationRun(match[1], {
      triggerSource: (body && body.triggerSource) || "api",
      input: (body && body.input) || null,
    });
    jsonOk(res, run);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/automations/history", async (req, res, { repo, url }) => {
  try {
    await repo.initAutomationSystem();
    const history = await repo.automationHistory({
      automationId: url.searchParams.get("automationId") || undefined,
      status: url.searchParams.get("status") || undefined,
      limit: parseInt(url.searchParams.get("limit")) || 50,
    });
    jsonOk(res, { total: history.length, data: history });
  } catch (e) {
    serverError(res, e.message);
  }
});

// ===========================================================================
// Evolution 端点（知识自演化）
// ===========================================================================

route("GET", "/api/evolution/status", async (req, res, { repo }) => {
  try {
    const status = await repo.getEvolutionStatus();
    jsonOk(res, status);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/evolution/observe", async (req, res, { repo }) => {
  try {
    const snapshot = await repo.observeSystem();
    jsonOk(res, snapshot);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/evolution/health", async (req, res, { repo }) => {
  try {
    const health = await repo.analyzeHealth();
    jsonOk(res, health);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/evolution/detect", async (req, res, { repo }) => {
  try {
    const opportunities = await repo.detectEvolution();
    jsonOk(res, { total: opportunities.length, data: opportunities });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/evolution/plan", async (req, res, { repo }) => {
  try {
    const plan = await repo.generateEvolutionPlan();
    jsonOk(res, plan);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/evolution/execute", async (req, res, { repo }) => {
  try {
    const result = await repo.executeEvolution();
    jsonOk(res, result);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/evolution/history", async (req, res, { repo, url }) => {
  try {
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const history = await repo.getEvolutionHistory(limit);
    jsonOk(res, { total: history.length, data: history });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/evolution/rollback", async (req, res, { repo }) => {
  try {
    const result = await repo.rollbackEvolution();
    jsonOk(res, result);
  } catch (e) {
    serverError(res, e.message);
  }
});

// ---- Admin API 端点（本地无需认证，监听 127.0.0.1）------------------

route("GET", "/api/admin/stats", async (req, res, { repo }) => {
  try {
    const stats = await repo.getStats();

    // suggestions 数量
    let suggestionCount = 0;
    try {
      const row = await repo.db.get("SELECT COUNT(*) as c FROM ai_suggestions");
      suggestionCount = row ? row.c : 0;
    } catch (e) {
      console.error("serve: 获取建议统计失败", e);
    }

    // containers 数量
    let containerCount = 0;
    try {
      const row = await repo.db.get(
        "SELECT COUNT(*) as c FROM resources WHERE type = 'container' AND deleted = 0",
      );
      containerCount = row ? row.c : 0;
    } catch (e) {
      console.error("serve: 获取容器统计失败", e);
    }

    // tags/categories（从 metadata 提取）
    const allResources = await repo.getAllResources();
    const tagSet = new Set();
    const categorySet = new Set();
    for (const r of allResources) {
      const md = r.metadata || {};
      if (Array.isArray(md.tags)) md.tags.forEach((t) => tagSet.add(t));
      if (md.category) categorySet.add(md.category);
    }

    // agents 数量
    let agentCount = 0;
    try {
      agentCount = (await repo.listAgents()).length;
    } catch (e) {
      console.error("serve: 获取agent统计失败", e);
    }

    // workflows 数量
    let workflowCount = 0;
    try {
      workflowCount = (await repo.listWorkflows()).length;
    } catch (e) {
      console.error("serve: 获取workflow统计失败", e);
    }

    jsonOk(res, {
      resources: stats.totalResources,
      relations: stats.totalRelations,
      tags: tagSet.size,
      categories: categorySet.size,
      suggestions: suggestionCount,
      containers: containerCount,
      agents: agentCount,
      workflows: workflowCount,
    });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/admin/resources", async (req, res, { repo, url }) => {
  try {
    const q = url.searchParams.get("q") || "";
    const type = url.searchParams.get("type") || null;
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const offset = parseInt(url.searchParams.get("offset")) || 0;

    let resources = await repo.getAllResources({ type, limit, offset });

    // 过滤内部系统资源
    resources = resources.filter((r) => r.rid !== "__system__");

    // 如果指定了搜索关键词，按 title 过滤
    if (q) {
      const lowerQ = q.toLowerCase();
      resources = resources.filter((r) => {
        const title = (r.metadata && r.metadata.title) || r.name || "";
        return title.toLowerCase().includes(lowerQ);
      });
    }

    jsonOk(res, {
      total: resources.length,
      limit,
      offset,
      data: resources,
    });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/admin/resources/:rid", async (req, res, { repo, url }) => {
  const rid = extractAdminRid(url.pathname);
  if (!rid) return notFound(res, "Invalid rid");

  try {
    const resource = await repo.getResource(rid);
    if (!resource) return notFound(res, "Resource not found");

    // 读取内容（加密资源用占位文本）
    let content = null;
    try {
      if (resource.path && (await fs.pathExists(resource.path))) {
        content = await readResourceContent(resource.path, repo.cryptoKey);
      }
    } catch {
      content = "[加密内容]";
    }

    // 获取该资源的所有关系
    let relations = { outgoing: [], incoming: [] };
    try {
      relations = await repo.getRelations(rid);
    } catch (e) {
      console.error("serve: 获取资源关系失败", e);
    }

    // 获取标签（从 resource_tags 表）
    let tags = [];
    try {
      const tagRows = await repo.db.all(
        "SELECT tag FROM resource_tags WHERE resource_rid = ?",
        [rid],
      );
      tags = tagRows.map((r) => r.tag);
    } catch (e) {
      console.error("serve: 获取资源标签失败", e);
    }

    jsonOk(res, {
      ...resource,
      content: content || resource.content || null,
      relations,
      tags,
    });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/admin/graph", async (req, res, { repo, url }) => {
  try {
    const limit = parseInt(url.searchParams.get("limit")) || 200;

    // 获取节点
    const resources = await repo.db.all(
      "SELECT rid, type, name, metadata FROM resources WHERE deleted = 0 LIMIT ?",
      [limit],
    );

    const nodes = resources.map((r) => ({
      id: r.rid,
      type: r.type,
      label: (() => {
        try {
          const m = JSON.parse(r.metadata || "{}");
          return m.title || r.name || r.rid;
        } catch {
          return r.name || r.rid;
        }
      })(),
      resourceType: r.type,
    }));

    // 获取边
    const rels = await repo.db.all(
      "SELECT id, from_rid, to_rid, type, metadata FROM relations WHERE deleted = 0 LIMIT ?",
      [limit],
    );

    const edges = rels.map((r) => {
      let label = "";
      try {
        const m = JSON.parse(r.metadata || "{}");
        label = m.label || m.title || "";
      } catch (e) {
        console.error("serve: 解析关系元数据失败", e);
      }
      return {
        id: r.id,
        from: r.from_rid,
        to: r.to_rid,
        type: r.type,
        label,
      };
    });

    jsonOk(res, { nodes, edges });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/admin/graph/path", async (req, res, { repo, url }) => {
  const fromRid = url.searchParams.get("from");
  const toRid = url.searchParams.get("to");

  if (!fromRid || !toRid) {
    return badRequest(res, "缺少 from 或 to 参数");
  }

  try {
    if (typeof repo.findPath !== "function") {
      return jsonOk(res, { error: "not implemented" }, 501);
    }

    const fromRes = await repo.getResource(fromRid);
    const toRes = await repo.getResource(toRid);

    if (!fromRes || !toRes) {
      return notFound(res, "源节点或目标节点不存在");
    }

    const result = await repo.findPath(fromRid, toRid);
    if (!result) {
      return jsonOk(res, { path: null, message: "无路径可达" });
    }

    jsonOk(res, { path: result.path, length: result.length });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/admin/suggestions", async (req, res, { repo }) => {
  try {
    const suggestions = await repo.listSuggestions({
      status: "pending",
      limit: 100,
    });
    jsonOk(res, { total: suggestions.length, data: suggestions });
  } catch (e) {
    serverError(res, e.message);
  }
});

route(
  "POST",
  "/api/admin/suggestions/:id/accept",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(
      /^\/api\/admin\/suggestions\/([^/]+)\/accept$/,
    );
    if (!match) return notFound(res, "Invalid suggestion id");

    const id = match[1];

    try {
      const result = await repo.approveSuggestion(id);
      jsonOk(res, result);
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

route("GET", "/api/admin/containers", async (req, res, { repo }) => {
  try {
    const containers = await repo.db.all(
      "SELECT * FROM resources WHERE type = 'container' AND deleted = 0 ORDER BY created DESC",
    );

    const result = containers.map((r) => ({
      ...r,
      metadata: (() => {
        try {
          return JSON.parse(r.metadata || "{}");
        } catch {
          return {};
        }
      })(),
    }));

    jsonOk(res, { total: result.length, data: result });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/admin/containers/:id", async (req, res, { repo, url }) => {
  // 匹配 /api/admin/containers/:id
  const match = url.pathname.match(/^\/api\/admin\/containers\/([^/]+)$/);
  if (!match) return notFound(res, "Invalid container id");

  const containerId = match[1];

  try {
    // 先查找容器
    let container = await repo.getResource(containerId);
    if (!container) {
      // 尝试用 name 找
      container = await repo.db.get(
        "SELECT * FROM resources WHERE (name = ? OR rid LIKE ?) AND type = 'container' AND deleted = 0",
        [containerId, `%${containerId}%`],
      );
    }

    if (!container) {
      return notFound(res, "Container not found");
    }

    // 获取成员
    const members = await repo.db.all(
      "SELECT * FROM container_members WHERE container_rid = ?",
      [container.rid],
    );

    jsonOk(res, {
      container,
      members,
      memberCount: members.length,
    });
  } catch (e) {
    serverError(res, e.message);
  }
});

// ---- 普通业务 API：关系（走 SSH 认证，经 repository → OperationEngine）----

route("GET", "/api/relations", async (req, res, { repo, url }) => {
  try {
    const rid = url.searchParams.get("rid") || null;
    const type = url.searchParams.get("type") || null;
    const limit = parseInt(url.searchParams.get("limit")) || 100;

    if (rid) {
      const relations = await repo.getRelations(rid);
      jsonOk(res, relations);
      return;
    }
    const data = await repo.listRelations({ type, limit });
    jsonOk(res, { total: data.length, data });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/relations/:id", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/relations\/(\d+)$/);
  if (!match) return notFound(res, "Invalid relation id");
  try {
    const relation = await repo.getRelation(parseInt(match[1]));
    if (!relation) return notFound(res, "关系不存在");
    jsonOk(res, relation);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("POST", "/api/relations", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { from, to, type = "reference", metadata } = body;
  if (!from || !to) return badRequest(res, 'Missing "from" or "to" field');
  try {
    const relation = await repo.createRelation(from, to, type, metadata || {});
    jsonOk(res, relation, 201);
  } catch (e) {
    if (e.message && e.message.includes("关系已存在")) return conflict(res, e.message);
    serverError(res, e.message);
  }
});

route("PUT", "/api/relations/:id", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/relations\/(\d+)$/);
  if (!match) return notFound(res, "Invalid relation id");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  try {
    const relation = await repo.updateRelation(parseInt(match[1]), body.updates || body);
    jsonOk(res, relation);
  } catch (e) {
    serverError(res, e.message);
  }
});

route("DELETE", "/api/relations/:id", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/relations\/(\d+)$/);
  if (!match) return notFound(res, "Invalid relation id");
  try {
    const result = await repo.removeRelation(parseInt(match[1]));
    jsonOk(res, result);
  } catch (e) {
    serverError(res, e.message);
  }
});

// ---- Operation API（对外 Operation 协议薄层，复用 OperationEngine 现有能力）----

// 执行操作
route("POST", "/api/operations", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { type, params, options } = body;
  if (!type) return badRequest(res, 'Missing "type" field');

  // type 白名单校验（复用已注册类型）
  const knownTypes = repo.getOperationTypes();
  if (!knownTypes.includes(type)) {
    return badRequest(res, `未知操作类型: ${type}（已注册: ${knownTypes.join(", ")}）`);
  }

  try {
    const result = await repo.executeOperation(type, params || {}, options || {});
    jsonOk(res, result, 201);
  } catch (e) {
    serverError(res, e.message);
  }
});

// 操作历史（系统级操作，支持 limit/type/status 过滤）
route("GET", "/api/operations", async (req, res, { repo, url }) => {
  try {
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const type = url.searchParams.get("type") || null;
    const status = url.searchParams.get("status") || null;

    const history = await repo.getContainerHistory("__system__", { limit, type });
    const data = status ? history.filter((op) => op.status === status) : history;

    jsonOk(res, { total: data.length, data });
  } catch (e) {
    serverError(res, e.message);
  }
});

// 单个操作详情
route("GET", "/api/operations/:id", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/operations\/(op_[A-Za-z0-9]+)$/);
  if (!match) return notFound(res, "Invalid operation id");
  try {
    const op = await repo.getOperationRecord(match[1]);
    if (!op) return notFound(res, "操作不存在");
    jsonOk(res, op);
  } catch (e) {
    serverError(res, e.message);
  }
});

// 撤销操作
route("POST", "/api/operations/:id/undo", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/operations\/(op_[A-Za-z0-9]+)\/undo$/);
  if (!match) return notFound(res, "Invalid operation id");
  try {
    const result = await repo.undoContainerOperation(match[1]);
    jsonOk(res, result);
  } catch (e) {
    serverError(res, e.message);
  }
});

// 事务：开始
route("POST", "/api/operations/transaction", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { containerRid = "__system__", type, description } = body;
  try {
    const result = await repo.beginTransaction(containerRid, type || "batch", description || null);
    jsonOk(res, result, 201);
  } catch (e) {
    serverError(res, e.message);
  }
});

// 事务：内执行
route("POST", "/api/operations/transaction/:id/execute", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/operations\/transaction\/(tx_[A-Za-z0-9]+)\/execute$/);
  if (!match) return notFound(res, "Invalid transaction id");
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { type, params, options } = body;
  if (!type) return badRequest(res, 'Missing "type" field');
  try {
    const result = await repo.executeInTransaction(match[1], type, params || {}, options || {});
    jsonOk(res, result);
  } catch (e) {
    serverError(res, e.message);
  }
});

// 事务：提交
route("POST", "/api/operations/transaction/:id/commit", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/operations\/transaction\/(tx_[A-Za-z0-9]+)\/commit$/);
  if (!match) return notFound(res, "Invalid transaction id");
  try {
    const result = await repo.commitTransaction(match[1]);
    jsonOk(res, result);
  } catch (e) {
    serverError(res, e.message);
  }
});

// 事务：回滚
route("POST", "/api/operations/transaction/:id/rollback", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/operations\/transaction\/(tx_[A-Za-z0-9]+)\/rollback$/);
  if (!match) return notFound(res, "Invalid transaction id");
  try {
    const result = await repo.rollbackTransaction(match[1]);
    jsonOk(res, result);
  } catch (e) {
    serverError(res, e.message);
  }
});

// ---- Event API（对外事件协议层，复用 EventBus/EventStore 现有能力）----

// 事件历史查询
route("GET", "/api/events", async (req, res, { repo, url }) => {
  try {
    const type = url.searchParams.get("type") || null;
    const source = url.searchParams.get("source") || null;
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const offset = parseInt(url.searchParams.get("offset")) || 0;

    const data = await repo.getEventHistory({ type, source, limit, offset });
    jsonOk(res, { total: data.length, limit, offset, data });
  } catch (e) {
    serverError(res, e.message);
  }
});

// SSE 实时事件流
// 订阅参数: subscribe=resource.created,relation.created（逗号分隔；空则订阅全部）
route("GET", "/api/events/stream", async (req, res, { repo, url }) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const subscribeRaw = url.searchParams.get("subscribe") || "";
  const filters = subscribeRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // 订阅模式：有 filters 时逐个注册；无 filters 时用通配符订阅全部
  const patterns = filters.length > 0 ? filters : ["*"];

  // 发送初始心跳（SSE 注释行），确认连接建立
  res.write(": connected\n\n");

  const handler = (payload, event) => {
    // 已在 patterns 中精确注册，无需再次过滤；但通配符 '*' 时需过滤到具体类型
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event.toJSON())}\n\n`;
    res.write(frame);
  };

  for (const p of patterns) {
    repo.onEvent(p, handler);
  }

  req.on("close", () => {
    for (const p of patterns) {
      repo.offEvent(p, handler);
    }
  });

  // 保持连接：定期发送心跳注释行，避免代理/超时断开
  const heartbeat = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);
  res.on("close", () => clearInterval(heartbeat));
});

route("GET", "/api/admin/relations", async (req, res, { repo, url }) => {
  try {
    const rid = url.searchParams.get("rid") || null;
    const type = url.searchParams.get("type") || null;
    const limit = parseInt(url.searchParams.get("limit")) || 100;

    let sql = "SELECT * FROM relations WHERE deleted = 0";
    const params = [];

    if (rid) {
      sql += " AND (from_rid = ? OR to_rid = ?)";
      params.push(rid, rid);
    }
    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }

    sql += " ORDER BY created DESC LIMIT ?";
    params.push(limit);

    const relations = await repo.db.all(sql, params);

    jsonOk(res, { total: relations.length, data: relations });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("DELETE", "/api/admin/relations/:id", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/admin\/relations\/(\d+)$/);
  if (!match) return notFound(res, "Invalid relation id");

  const id = parseInt(match[1]);

  try {
    await repo.relationService.remove(id);
    jsonOk(res, { ok: true, deleted: id });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("GET", "/api/admin/audit", async (req, res, { repo, url }) => {
  try {
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const actor = url.searchParams.get("actor") || null;

    const PermissionAudit = require("../security/permissionAudit.cjs");
    const audit = new PermissionAudit(repo.db);
    const options = { limit };
    if (actor) options.subject = actor;

    const results = await audit.query(options);

    jsonOk(res, { total: results.length, data: results });
  } catch (e) {
    serverError(res, e.message);
  }
});

// ===========================================================================
// Admin CRUD 端点 — 资源的增删改查、关联、标签、提交
// ===========================================================================

// ---- 创建资源 ------------------------------------------------------------

route("POST", "/api/admin/resources", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }

  const { name, content, metadata } = body;
  if (!name) return badRequest(res, "缺少 name 字段");

  try {
    // 只允许创建 note 类型，默认 .md 扩展名
    const filename = name.endsWith(".md") ? name : `${name}.md`;
    const resource = await repo.createResource("note", content || "", {
      filename,
      metadata: metadata || {},
    });

    jsonOk(res, resource, 201);
  } catch (e) {
    if (e.code === "RESOURCE_EXISTS") return conflict(res, e.message);
    serverError(res, e.message);
  }
});

// ---- 导入文件 ------------------------------------------------------------

route("POST", "/api/admin/import", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }

  const { paths } = body;
  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return badRequest(res, "缺少 paths 字段（字符串数组）");
  }

  const results = { imported: [], failed: [] };

  for (const srcPath of paths) {
    try {
      if (!(await fs.pathExists(srcPath))) {
        results.failed.push({ path: srcPath, error: "文件不存在" });
        continue;
      }

      const stats = await fs.stat(srcPath);
      if (stats.isDirectory()) {
        results.failed.push({ path: srcPath, error: "暂不支持导入目录" });
        continue;
      }

      const basename = path.basename(srcPath);
      const destPath = path.join(repo.repoPath, basename);

      // 如果目标已存在，加后缀
      let finalPath = destPath;
      if (await fs.pathExists(destPath)) {
        const ext = path.extname(basename);
        const stem = basename.slice(0, -ext.length);
        finalPath = path.join(repo.repoPath, `${stem}-${Date.now()}${ext}`);
      }

      // 复制文件
      await fs.copy(srcPath, finalPath);

      // 导入到知识库
      const resource = await repo.importFile(finalPath);
      results.imported.push(resource);
    } catch (e) {
      results.failed.push({ path: srcPath, error: e.message });
    }
  }

  jsonOk(res, results);
});

// ---- 更新资源内容 --------------------------------------------------------

route("PUT", "/api/admin/resources/:rid", async (req, res, { repo, url }) => {
  const rid = extractAdminRid(url.pathname);
  if (!rid) return notFound(res, "Invalid rid");

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }

  const { content, metadata, name } = body;

  try {
    const resource = await repo.getResource(rid);
    if (!resource) return notFound(res, "Resource not found");

    // 更新文件内容
    if (content !== undefined && resource.path) {
      const filePath = path.join(repo.repoPath, resource.path);
      await fs.writeFile(filePath, content, "utf-8");
      if (repo.cryptoKey) {
        await repo.encryptFile(filePath);
      }
      await repo.resourceService.refresh(rid);
    }

    // 更新元数据
    if (metadata !== undefined || name !== undefined) {
      const updates = {};
      if (metadata !== undefined) updates.metadata = metadata;
      if (name !== undefined) {
        const newPath = `resources/${name}`;
        updates.path = newPath;
      }
      await repo.updateResource(rid, updates);
    }

    const updated = await repo.getResource(rid);
    jsonOk(res, updated);
  } catch (e) {
    serverError(res, e.message);
  }
});

// ---- 删除资源 ------------------------------------------------------------

route(
  "DELETE",
  "/api/admin/resources/:rid",
  async (req, res, { repo, url }) => {
    const rid = extractAdminRid(url.pathname);
    if (!rid) return notFound(res, "Invalid rid");

    const hard = url.searchParams.get("hard") === "true";

    try {
      await repo.deleteResource(rid, !hard);
      jsonOk(res, { ok: true, rid, hard });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

// ---- 关联资源 ------------------------------------------------------------

route(
  "POST",
  "/api/admin/resources/:rid/link",
  async (req, res, { repo, url }) => {
    const rid = extractAdminRid(url.pathname);
    if (!rid) return notFound(res, "Invalid rid");

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return badRequest(res, e.message);
    }

    const { target, type = "reference" } = body;
    if (!target) return badRequest(res, "缺少 target 字段");

    try {
      await repo.linkResources(rid, target, type);
      jsonOk(res, { ok: true, from: rid, to: target, type });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

// ---- 解除关联 ------------------------------------------------------------

route(
  "DELETE",
  "/api/admin/resources/:rid/link/:target",
  async (req, res, { repo, url }) => {
    const rid = extractAdminRid(url.pathname);
    if (!rid) return notFound(res, "Invalid rid");

    const target = decodeURIComponent(url.pathname.split("/link/")[1] || "");
    if (!target) return notFound(res, "Invalid target");

    const type = url.searchParams.get("type") || "reference";

    try {
      await repo.unlinkResources(rid, target, type);
      jsonOk(res, { ok: true, from: rid, to: target, type });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

// ---- 更新资源标签 --------------------------------------------------------

route(
  "PUT",
  "/api/admin/resources/:rid/tags",
  async (req, res, { repo, url }) => {
    const rid = extractAdminRid(url.pathname);
    if (!rid) return notFound(res, "Invalid rid");

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return badRequest(res, e.message);
    }
    const { tags } = body;
    if (!Array.isArray(tags)) return badRequest(res, "tags 必须是数组");

    try {
      await repo.resourceService.update(rid, { metadata: { tags } });
      jsonOk(res, { ok: true, rid, tags });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

// ---- 删除单个标签 --------------------------------------------------------

route(
  "DELETE",
  "/api/admin/resources/:rid/tags/:tag",
  async (req, res, { repo, url }) => {
    const rid = extractAdminRid(url.pathname);
    if (!rid) return notFound(res, "Invalid rid");

    const tag = decodeURIComponent(url.pathname.split("/tags/")[1] || "");
    if (!tag) return notFound(res, "Invalid tag");

    try {
      const resource = await repo.resourceService.getByRid(rid);
      if (!resource) return notFound(res, "资源不存在");
      const currentTags = (resource.metadata.tags || []).filter(
        (t) => t !== tag,
      );
      await repo.resourceService.update(rid, {
        metadata: { tags: currentTags },
      });
      jsonOk(res, { ok: true, rid, tag });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

// ---- 提交变更 ------------------------------------------------------------

route("POST", "/api/admin/commit", async (req, res, { repo }) => {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }

  const { message } = body;
  if (!message) return badRequest(res, "缺少 message 字段");

  try {
    // 使用已初始化（已注入 db）的 staging 实例
    const staging = repo.staging;

    if (!(await staging.hasChanges())) {
      return jsonOk(res, { error: "没有待提交的变更" }, 400);
    }

    await repo.db.run("SAVEPOINT tx_admin_commit");
    let stagingResult;
    try {
      stagingResult = await staging.commit(repo);
      await repo.commit(message, stagingResult);
      await repo.createCommit(message);
      await repo.sync({ silent: true });
      await repo.db.run("RELEASE tx_admin_commit");
    } catch (innerErr) {
      await repo.db.run("ROLLBACK TO tx_admin_commit");
      throw innerErr;
    }

    jsonOk(res, { ok: true, message, result: stagingResult });
  } catch (e) {
    serverError(res, e.message);
  }
});

// ---- 工作区状态 ----------------------------------------------------------

route("GET", "/api/admin/status", async (req, res, { repo }) => {
  try {
    const status = await repo.staging.getStatus();
    const commits = await repo.getCommitLog();

    jsonOk(res, {
      staged: {
        added: status.added || [],
        modified: status.modified || [],
        deleted: status.deleted || [],
        renamed: status.renamed || [],
        metadata: status.metadata || [],
      },
      recentCommits: commits.slice ? commits.slice(0, 10) : [],
    });
  } catch (e) {
    serverError(res, e.message);
  }
});

// ---- 拒绝建议 ------------------------------------------------------------

route(
  "POST",
  "/api/admin/suggestions/:id/reject",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(
      /^\/api\/admin\/suggestions\/([^/]+)\/reject$/,
    );
    if (!match) return notFound(res, "Invalid suggestion id");

    const id = match[1];

    try {
      await repo.rejectSuggestion(id);
      jsonOk(res, { ok: true, id, status: "rejected" });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

// ---- 执行已通过建议 ------------------------------------------------------

route(
  "POST",
  "/api/admin/suggestions/:id/execute",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(
      /^\/api\/admin\/suggestions\/([^/]+)\/execute$/,
    );
    if (!match) return notFound(res, "Invalid suggestion id");

    const id = match[1];

    try {
      const result = await repo.executeApprovedSuggestion(id);
      jsonOk(res, { ok: true, id, result });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

// ---- 容器成员操作（promote / scan / sync / diff / stats）----------------

route(
  "POST",
  "/api/admin/containers/:id/members/promote",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(
      /^\/api\/admin\/containers\/([^/]+)\/members\/promote$/,
    );
    if (!match) return notFound(res, "Invalid container id");

    const containerId = match[1];

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return badRequest(res, e.message);
    }

    const { memberPath, type, metadata } = body;
    if (!memberPath) return badRequest(res, "缺少 memberPath 字段");

    try {
      const container = await repo.getResource(containerId);
      if (!container) return notFound(res, "Container not found");
      if (!(await repo.containerService.hasContainerCapability(container.rid))) {
        return badRequest(res, "Resource 不具有 Container Capability");
      }

      const resource = await repo.promoteMember(container.rid, memberPath, {
        type: type || null,
        metadata: metadata || {},
      });
      jsonOk(res, { ok: true, resource });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

route(
  "POST",
  "/api/admin/containers/:id/scan",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(/^\/api\/admin\/containers\/([^/]+)\/scan$/);
    if (!match) return notFound(res, "Invalid container id");

    const containerId = match[1];

    try {
      const container = await repo.getResource(containerId);
      if (!container) return notFound(res, "Container not found");

      const results = await repo.scanContainerMembers(container.rid);
      const stats = await repo.getContainerMemberStats(container.rid);
      jsonOk(res, { ok: true, results, stats });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

route(
  "POST",
  "/api/admin/containers/:id/sync",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(/^\/api\/admin\/containers\/([^/]+)\/sync$/);
    if (!match) return notFound(res, "Invalid container id");

    const containerId = match[1];

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return badRequest(res, e.message);
    }

    const dryRun = (body && body.dryRun) || false;

    try {
      const container = await repo.getResource(containerId);
      if (!container) return notFound(res, "Container not found");

      if (dryRun) {
        const diff = await repo.getContainerDiff(container.rid);
        return jsonOk(res, { ok: true, dryRun: true, diff });
      }

      const results = await repo.syncContainerMembers(container.rid);
      const stats = await repo.getContainerMemberStats(container.rid);
      jsonOk(res, { ok: true, results, stats });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

route(
  "GET",
  "/api/admin/containers/:id/diff",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(/^\/api\/admin\/containers\/([^/]+)\/diff$/);
    if (!match) return notFound(res, "Invalid container id");

    const containerId = match[1];

    try {
      const container = await repo.getResource(containerId);
      if (!container) return notFound(res, "Container not found");

      const diff = await repo.getContainerDiff(container.rid);
      jsonOk(res, { ok: true, diff });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

route(
  "GET",
  "/api/admin/containers/:id/stats",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(/^\/api\/admin\/containers\/([^/]+)\/stats$/);
    if (!match) return notFound(res, "Invalid container id");

    const containerId = match[1];

    try {
      const container = await repo.getResource(containerId);
      if (!container) return notFound(res, "Container not found");

      const stats = await repo.getContainerMemberStats(container.rid);
      jsonOk(res, { stats });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

// ---- 降级容器成员 --------------------------------------------------------

route(
  "POST",
  "/api/admin/containers/:id/members/demote",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(
      /^\/api\/admin\/containers\/([^/]+)\/members\/demote$/,
    );
    if (!match) return notFound(res, "Invalid container id");

    const containerId = match[1];

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return badRequest(res, e.message);
    }

    const { memberPath } = body;
    if (!memberPath) return badRequest(res, "缺少 memberPath 字段");

    try {
      const container = await repo.getResource(containerId);
      if (!container) return notFound(res, "Container not found");

      const result = await repo.demoteMember(container.rid, memberPath);
      jsonOk(res, { ok: true, result });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

// ---- 仓库类型管理 --------------------------------------------------------

route("GET", "/api/admin/types", async (req, res, { repo }) => {
  try {
    const types = await repo.db.all(
      "SELECT type, COUNT(*) as count FROM resources WHERE deleted = 0 AND type != 'system' GROUP BY type ORDER BY count DESC",
    );
    jsonOk(res, { data: types });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("PUT", "/api/admin/types/:name", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/admin\/types\/(.+)$/);
  if (!match) return notFound(res, "Invalid type name");

  const oldType = decodeURIComponent(match[1]);

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }

  const { newType } = body;
  if (!newType) return badRequest(res, "缺少 newType 字段");

  try {
    // 走 Service 层，逐资源更新以生成 syncOp
    const resources = await repo.db.all(
      "SELECT rid FROM resources WHERE type = ? AND deleted = 0",
      [oldType],
    );
    let affected = 0;
    for (const r of resources) {
      await repo.resourceService.update(r.rid, { type: newType });
      affected++;
    }
    jsonOk(res, { ok: true, oldType, newType, affected });
  } catch (e) {
    serverError(res, e.message);
  }
});

// ---- 标签管理 ------------------------------------------------------------

route("GET", "/api/admin/tags", async (req, res, { repo }) => {
  try {
    const rows = await repo.db.all(
      `SELECT rt.tag, COUNT(*) as count
       FROM resource_tags rt
       GROUP BY rt.tag
       ORDER BY count DESC`,
    );
    const data = rows.map((r) => ({ tag: r.tag, count: r.count }));
    jsonOk(res, { data });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("PUT", "/api/admin/tags/:name", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/admin\/tags\/(.+)$/);
  if (!match) return notFound(res, "Invalid tag name");
  const oldTag = decodeURIComponent(match[1]);

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { newTag } = body;
  if (!newTag) return badRequest(res, "缺少 newTag 字段");

  try {
    // 标签是独立表，一条 SQL 完成重命名
    const result = await repo.db.run(
      "UPDATE resource_tags SET tag = ? WHERE tag = ?",
      [newTag, oldTag],
    );
    jsonOk(res, { ok: true, oldTag, newTag, affected: result.changes });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("DELETE", "/api/admin/tags/:name", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/admin\/tags\/(.+)$/);
  if (!match) return notFound(res, "Invalid tag name");
  const tag = decodeURIComponent(match[1]);

  try {
    // 从 resource_tags 表删除
    await repo.db.run("DELETE FROM resource_tags WHERE tag = ?", [tag]);
    jsonOk(res, { ok: true, tag });
  } catch (e) {
    serverError(res, e.message);
  }
});

// ---- 分类管理 ------------------------------------------------------------

route("GET", "/api/admin/categories", async (req, res, { repo }) => {
  try {
    const rows = await repo.db.all(
      "SELECT metadata FROM resources WHERE deleted = 0 AND type != 'system'",
    );
    const catCounts = {};
    for (const row of rows) {
      try {
        const m = JSON.parse(row.metadata || "{}");
        const cat = m.category;
        if (cat && cat.trim()) {
          catCounts[cat] = (catCounts[cat] || 0) + 1;
        }
      } catch (e) {
        console.error("serve: 解析资源分类失败", e);
      }
    }
    const data = Object.entries(catCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category));
    jsonOk(res, { data });
  } catch (e) {
    serverError(res, e.message);
  }
});

route("PUT", "/api/admin/categories/:name", async (req, res, { repo, url }) => {
  const match = url.pathname.match(/^\/api\/admin\/categories\/(.+)$/);
  if (!match) return notFound(res, "Invalid category");
  const oldCat = decodeURIComponent(match[1]);

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return badRequest(res, e.message);
  }
  const { newCategory } = body;
  if (!newCategory) return badRequest(res, "缺少 newCategory 字段");

  try {
    const resources = await repo.db.all(
      "SELECT rid FROM resources WHERE json_extract(metadata, '$.category') = ? AND deleted = 0 AND type != 'system'",
      [oldCat],
    );
    for (const r of resources) {
      await repo.resourceService.update(r.rid, {
        metadata: { category: newCategory },
      });
    }
    jsonOk(res, {
      ok: true,
      oldCategory: oldCat,
      newCategory,
      affected: resources.length,
    });
  } catch (e) {
    serverError(res, e.message);
  }
});

route(
  "DELETE",
  "/api/admin/categories/:name",
  async (req, res, { repo, url }) => {
    const match = url.pathname.match(/^\/api\/admin\/categories\/(.+)$/);
    if (!match) return notFound(res, "Invalid category");
    const cat = decodeURIComponent(match[1]);

    try {
      const resources = await repo.db.all(
        "SELECT rid FROM resources WHERE json_extract(metadata, '$.category') = ? AND deleted = 0 AND type != 'system'",
        [cat],
      );
      for (const r of resources) {
        await repo.resourceService.update(r.rid, {
          metadata: { category: "" },
        });
      }
      jsonOk(res, { ok: true, category: cat, affected: resources.length });
    } catch (e) {
      serverError(res, e.message);
    }
  },
);

// ===========================================================================
// 辅助函数
// ===========================================================================

function extractAdminRid(urlPath) {
  const match = urlPath.match(/^\/api\/admin\/resources\/(res_[a-zA-Z0-9_]+)/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// 静态文件服务（Admin SPA）
// ---------------------------------------------------------------------------

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * 提供 admin SPA 静态文件
 */
async function serveAdminStatic(req, res, urlPath) {
  // 去掉 /admin 前缀
  let relativePath = urlPath.replace(/^\/admin\/?/, "");
  if (!relativePath || relativePath === "/") relativePath = "index.html";

  // 安全检查：防止路径穿越
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ADMIN_DIST, safePath);

  // 确保文件在 admin/dist 内
  if (!filePath.startsWith(ADMIN_DIST)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      // 目录 → index.html（SPA fallback）
      return serveAdminStatic(req, res, "/admin/index.html");
    }

    const content = await fs.readFile(filePath);
    const contentType = getContentType(filePath);

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.length,
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch (e) {
    if (e.code === "ENOENT") {
      // 文件不存在 → SPA fallback 到 index.html
      try {
        const indexPath = path.join(ADMIN_DIST, "index.html");
        const content = await fs.readFile(indexPath);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": content.length,
          "Cache-Control": "no-cache",
        });
        res.end(content);
      } catch {
        notFound(res, "Admin SPA not built. Run the admin build first.");
      }
    } else {
      serverError(res, `Failed to read file: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 路由匹配
// ---------------------------------------------------------------------------

function matchRoute(method, pathname) {
  const map = {
    GET: GET_ROUTES,
    POST: POST_ROUTES,
    PUT: PUT_ROUTES,
    DELETE: DELETE_ROUTES,
  }[method];
  if (!map) return null;

  if (map.has(pathname)) return map.get(pathname);

  // 尾部斜杠容错：/api/plugins/epub-library/ → /api/plugins/epub-library
  if (
    pathname.length > 1 &&
    pathname.endsWith("/") &&
    map.has(pathname.slice(0, -1))
  ) {
    return map.get(pathname.slice(0, -1));
  }

  // 参数化路由匹配
  if (pathname.startsWith("/api/notes/") && pathname.split("/").length === 4) {
    const exactKey = "/api/notes/:rid";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (
    pathname.startsWith("/api/admin/resources/") &&
    pathname.split("/").length === 5
  ) {
    const exactKey = "/api/admin/resources/:rid";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/admin\/suggestions\/[^/]+\/accept$/.test(pathname)) {
    const exactKey = "/api/admin/suggestions/:id/accept";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/admin\/containers\/[^/]+$/.test(pathname)) {
    const exactKey = "/api/admin/containers/:id";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/admin\/containers\/[^/]+\/(scan|sync|diff|stats)$/.test(pathname)) {
    const action = pathname.split("/").pop();
    const exactKey = `/api/admin/containers/:id/${action}`;
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/admin\/containers\/[^/]+\/members\/(promote|demote)$/.test(pathname)) {
    const action = pathname.split("/").pop();
    const exactKey = `/api/admin/containers/:id/members/${action}`;
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/admin\/relations\/\d+$/.test(pathname)) {
    const exactKey = "/api/admin/relations/:id";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/relations\/\d+$/.test(pathname)) {
    const exactKey = "/api/relations/:id";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/operations\/op_[A-Za-z0-9]+$/.test(pathname)) {
    const exactKey = "/api/operations/:id";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/operations\/op_[A-Za-z0-9]+\/undo$/.test(pathname)) {
    const exactKey = "/api/operations/:id/undo";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/operations\/transaction\/tx_[A-Za-z0-9]+\/(execute|commit|rollback)$/.test(pathname)) {
    const action = pathname.split("/").pop();
    const exactKey = `/api/operations/transaction/:id/${action}`;
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/schemas\/[^/]+$/.test(pathname)) {
    const exactKey = "/api/schemas/:id";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/schemas\/[^/]+\/(attach|detach)$/.test(pathname)) {
    const action = pathname.endsWith("/attach") ? "attach" : "detach";
    const exactKey = `/api/schemas/:id/${action}`;
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/views\/[^/]+\/run$/.test(pathname)) {
    const exactKey = "/api/views/:id/run";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/views\/[^/]+\/export$/.test(pathname)) {
    const exactKey = "/api/views/:id/export";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/views\/[^/]+$/.test(pathname)) {
    const exactKey = "/api/views/:id";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/workflows\/[^/]+$/.test(pathname)) {
    const exactKey = "/api/workflows/:id";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/workflows\/[^/]+\/versions$/.test(pathname)) {
    const exactKey = "/api/workflows/:id/versions";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/workflows\/[^/]+\/(attach|detach|resume|transition|can)$/.test(pathname)) {
    const action = pathname.split("/").pop();
    const exactKey = `/api/workflows/:id/${action}`;
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/workflow\/instances\/[^/]+$/.test(pathname)) {
    const exactKey = "/api/workflow/instances/:id";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/automations\/[^/]+$/.test(pathname)) {
    const exactKey = "/api/automations/:id";
    if (map.has(exactKey)) return map.get(exactKey);
  }

  if (/^\/api\/automations\/[^/]+\/(enable|disable|run)$/.test(pathname)) {
    const action = pathname.split("/").pop();
    const exactKey = `/api/automations/:id/${action}`;
    if (map.has(exactKey)) return map.get(exactKey);
  }

  return null;
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

module.exports = async function serve(argv) {
  const repoPath = path.resolve(argv.repo || process.cwd());
  const port = parseInt(argv.port) || 8765;
  const host = "127.0.0.1";
  const serveSpa = argv.serveSpa === true;

  // Admin API 共享密钥认证
  // 设置环境变量 LO_ADMIN_TOKEN 启用 Admin API 保护
  // 未设置时 Admin API 无认证（仅限本地开发）
  const adminToken = process.env.LO_ADMIN_TOKEN || argv["admin-token"] || null;

  // 打开仓库
  const repo = new Repository(repoPath);

  try {
    await repo.open();
  } catch (e) {
    console.error(chalk.red(`无法打开仓库: ${e.message}`));
    process.exit(1);
  }

  // 读取已注册的 SSH 公钥（启动时加载，支持热更新）
  const authState = { needAuth: false, registeredKeys: [] };

  async function reloadKeys() {
    try {
      const keysJson = await repo.getConfig("auth.ssh.keys");
      if (keysJson) {
        authState.registeredKeys = JSON.parse(keysJson);
        authState.needAuth = authState.registeredKeys.length > 0;
      } else {
        authState.registeredKeys = [];
        authState.needAuth = false;
      }
    } catch {
      authState.registeredKeys = [];
      authState.needAuth = false;
    }
  }

  await reloadKeys();

  // P2-0: 初始化插件系统并挂载插件 HTTP 端点
  // 插件注册的 commands 扩展点（{ method, path, handler }）会被挂载为动态路由
  // 插件加载失败不阻塞 serve（插件属于增强能力，非核心链路）
  let pluginEndpoints = [];
  try {
    await repo.initPluginSystem();
    pluginEndpoints = await mountPluginRoutes(repo, route);
  } catch (e) {
    console.error(chalk.yellow(`插件系统初始化失败: ${e.message}`));
  }

  // 写锁（按顺序排队写操作）
  let writeChain = Promise.resolve();

  function withWriteLock(fn) {
    const result = writeChain.then(fn, fn);
    writeChain = result.catch(() => {});
    return result;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const method = req.method.toUpperCase();
    const pathname = url.pathname;

    // CORS（宽松，只监听 127.0.0.1）
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // 静态文件服务：/admin/* → admin/dist/ (SPA 模式)
    if (
      serveSpa &&
      pathname.startsWith("/admin/") &&
      !pathname.startsWith("/api/admin/")
    ) {
      return serveAdminStatic(req, res, pathname);
    }

    // 鉴权：
    // - /api/admin/* 无需认证（监听 127.0.0.1）
    // - /api/auth/* 不需要认证（SSH）
    // - 其余接口需要 SSH 认证
    const isAdminEndpoint = pathname.startsWith("/api/admin/");
    const isAuthEndpoint =
      pathname === "/api/auth/challenge" ||
      pathname === "/api/auth/login" ||
      pathname === "/api/auth/reload";
    // P2-0: 插件端点豁免 SSH 认证（仅限已实际挂载的插件端点）
    // 外部系统（如 Chrome 扩展）不具备 SSH 签名能力；
    // 服务仅监听 127.0.0.1，插件端点由插件自身控制访问策略
    const isPluginEndpoint = isPluginEndpointAllowed(
      method,
      pathname,
      pluginEndpoints,
    );
    // Admin 认证端点（LO_ADMIN_TOKEN 校验在下方统一完成）无需写锁豁免，
    // 所有发起修改的 admin 端点（POST/PUT/DELETE）都应持写锁串行执行
    const isAdminAuthEndpoint = false;

    // Admin 端点：使用共享密钥认证（LO_ADMIN_TOKEN）
    if (isAdminEndpoint) {
      if (adminToken) {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : null;

        if (token !== adminToken) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Unauthorized",
              hint: "Admin API 需要 Bearer token 认证。设置 LO_ADMIN_TOKEN 环境变量或在请求头中携带 Authorization: Bearer <token>",
            }),
          );
          return;
        }
      }

      const handler = matchRoute(method, pathname);
      if (!handler) {
        return notFound(res, `No route for ${method} ${pathname}`);
      }

      const ctx = { repo, url, authState, reloadKeys };

      if (["POST", "PUT", "DELETE"].includes(method) && !isAdminAuthEndpoint) {
        withWriteLock(() => handler(req, res, ctx));
      } else {
        handler(req, res, ctx).catch((e) => {
          if (!res.headersSent) serverError(res, e.message);
        });
      }
      return;
    }

    if (authState.needAuth && !isAuthEndpoint && !isPluginEndpoint) {
      const authHeader = req.headers["authorization"] || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;
      const session = validateSession(token);

      if (!session) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Unauthorized",
            hint: "请先通过 SSH 认证: POST /api/auth/challenge → POST /api/auth/login",
          }),
        );
        return;
      }
    }

    const handler = matchRoute(method, pathname);
    if (!handler) {
      return notFound(res, `No route for ${method} ${pathname}`);
    }

    const ctx = { repo, url, authState, reloadKeys };

    if (["POST", "PUT", "DELETE"].includes(method) && !isAuthEndpoint) {
      withWriteLock(() => handler(req, res, ctx));
    } else {
      handler(req, res, ctx).catch((e) => {
        if (!res.headersSent) serverError(res, e.message);
      });
    }
  });

  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(chalk.red(`端口 ${port} 已被占用`));
      process.exit(1);
    } else {
      console.error(chalk.red(`服务器错误: ${e.message}`));
      process.exit(1);
    }
  });

  await new Promise((resolve) => server.listen(port, host, resolve));

  // 启动信息
  if (serveSpa) {
    console.log(chalk.green(`\n  lo admin 已启动`));
    console.log(chalk.gray(`  地址: http://${host}:${port}/admin/`));
  } else {
    console.log(chalk.green(`\n  lo serve 已启动`));
    console.log(chalk.gray(`  地址: http://${host}:${port}`));
  }
  console.log(chalk.gray(`  仓库: ${repoPath}`));

  if (authState.needAuth) {
    console.log(
      chalk.gray(
        `  认证: SSH 挑战-应答（${authState.registeredKeys.length} 把已注册密钥）`,
      ),
    );
    if (SshAuth.supportsYSign()) {
      console.log(chalk.gray(`  签名: ssh-keygen -Y sign (OpenSSH)`));
    }
  } else {
    console.log(chalk.yellow(`  认证: 未启用（仓库未注册 SSH 公钥）`));
    console.log(
      chalk.gray(`  任何本机程序均可调用 API，建议运行 lo auth add 注册密钥`),
    );
  }

  if (serveSpa) {
    if (adminToken) {
      console.log(
        chalk.gray(`  Admin API: /api/admin/*（LO_ADMIN_TOKEN 已启用）`),
      );
    } else {
      console.log(
        chalk.yellow(
          `  Admin API: /api/admin/*（⚠ 未设置 LO_ADMIN_TOKEN，无认证保护）`,
        ),
      );
      console.log(
        chalk.gray(
          `  设置环境变量 LO_ADMIN_TOKEN=<your-token> 以启用 Admin API 认证`,
        ),
      );
    }
  }

  // P2-0: 已挂载的插件 HTTP 端点
  if (pluginEndpoints.length > 0) {
    console.log(chalk.cyan(`  插件端点: ${pluginEndpoints.length} 个`));
    for (const ep of pluginEndpoints) {
      console.log(chalk.gray(`    ${ep.method} ${ep.path}（${ep.pluginId}）`));
    }
    console.log(chalk.gray(`  插件端点已豁免 SSH 认证（仅监听 127.0.0.1）`));
  }

  console.log(chalk.gray(`  按 Ctrl+C 停止`));
  console.log("");

  // SPA 模式：自动打开浏览器
  if (serveSpa) {
    const adminUrl = `http://${host}:${port}/admin/`;
    try {
      const { exec } = require("child_process");
      const platform = process.platform;
      let cmd;
      if (platform === "darwin") {
        cmd = `open "${adminUrl}"`;
      } else if (platform === "win32") {
        cmd = `start "" "${adminUrl}"`;
      } else {
        cmd = `xdg-open "${adminUrl}"`;
      }
      exec(cmd, (err) => {
        if (err) {
          console.log(chalk.gray(`  请手动打开浏览器访问: ${adminUrl}`));
        }
      });
    } catch {
      console.log(chalk.gray(`  请手动打开浏览器访问: ${adminUrl}`));
    }
  }

  // 优雅关闭
  const shutdown = async () => {
    console.log(chalk.gray("\n  正在关闭..."));
    server.close();
    await repo.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};
