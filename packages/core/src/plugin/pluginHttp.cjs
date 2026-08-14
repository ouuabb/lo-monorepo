/**
 * PluginHttp — 插件 HTTP 端点挂载
 *
 * P2-0: 让 lo serve 消费插件注册的 commands 扩展点，动态挂载 HTTP 路由。
 *
 * 插件在 register() 中注册 HTTP 端点（结构约定）：
 *   extRegistry.register(pluginId, 'commands', key, {
 *     method: 'POST',                     // GET | POST | PUT | DELETE
 *     path: '/api/plugins/<id>/xxx',      // 完整路径
 *     handler: async (req, res) => {},    // Express 风格
 *     description: '...',
 *   });
 *
 * 插件 handler 使用 Express 风格 API：
 *   req.body                 — 已解析 JSON body（无 body 时为空对象）
 *   res.status(code).json(d) — 指定状态码 + JSON
 *   res.json(d)              — 200 + JSON
 *   res.setHeader(n, v)
 *
 * serve.cjs 启动时调用 mountPluginRoutes(repo, route)，
 * 把插件端点适配成原生 http handler 注册进路由表。
 */

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);

/**
 * 判断是否为 HTTP 端点结构（区别于 CLI 命令等 commands 扩展）
 * @param {any} handler — extensionRegistry 中 commands 扩展的 handler
 * @returns {boolean}
 */
function isHttpEndpoint(handler) {
  return !!handler
    && typeof handler === 'object'
    && typeof handler.handler === 'function'
    && typeof handler.path === 'string'
    && HTTP_METHODS.has(String(handler.method).toUpperCase());
}

/**
 * 读取请求体（JSON 解析）
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<object>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  if (!res.headersSent) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify(data));
}

/**
 * 把原生 ServerResponse 适配成 Express 风格 res
 * @param {import('http').ServerResponse} res
 */
function createResponseAdapter(res) {
  return {
    status(code) {
      return { json: (data) => sendJson(res, code, data) };
    },
    json(data) {
      sendJson(res, 200, data);
    },
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    end(data) {
      res.end(data);
    },
  };
}

/**
 * 判断请求是否命中已挂载的插件 HTTP 端点（serve 鉴权豁免判定）
 *
 * 只对"实际已挂载"的 method+path 豁免认证，避免前缀匹配导致
 * 未注册的 /api/plugins/ 路径也绕过 SSH 认证。
 *
 * @param {string} method — HTTP 方法（大写）
 * @param {string} pathname — URL 路径
 * @param {Array<{method: string, path: string}>} mounted — 已挂载端点清单
 * @returns {boolean}
 */
function isPluginEndpointAllowed(method, pathname, mounted) {
  if (!mounted || mounted.length === 0) return false;
  return mounted.some(e => e.method === method && e.path === pathname);
}

/**
 * 把插件 handler 包装成原生 http handler（(req, res) => Promise<void>）
 * @param {Function} pluginHandler — 插件端点 handler
 * @param {object} [meta] — { pluginId, key }，用于日志
 */
function adaptPluginHandler(pluginHandler, meta = {}) {
  return async (req, res) => {
    try {
      // 读取并解析 body（仅带请求体的方法；GET 无 body 直接空对象）
      let body = {};
      if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        try {
          body = await readBody(req);
        } catch (e) {
          // 非法 JSON：返回 400，不静默降级为空对象
          if (!res.headersSent) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          return;
        }
      }
      const adaptedReq = { ...req, body };
      await pluginHandler(adaptedReq, createResponseAdapter(res));
    } catch (e) {
      const where = meta.pluginId ? `[plugin:${meta.pluginId}]` : '[plugin]';
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: `${where} ${e.message}` }));
    }
  };
}

/**
 * 收集插件注册的 HTTP 端点
 * @param {object} repo — Repository 实例（需有 getPluginExtensionRegistry）
 * @returns {Array<{key: string, pluginId: string, method: string, path: string, handler: Function}>}
 */
function collectPluginEndpoints(repo) {
  const extRegistry = (repo && repo.getPluginExtensionRegistry)
    ? repo.getPluginExtensionRegistry()
    : null;
  if (!extRegistry || typeof extRegistry.list !== 'function') return [];

  const endpoints = [];
  const commands = extRegistry.list('commands') || [];
  for (const { key, pluginId, handler } of commands) {
    if (!isHttpEndpoint(handler)) continue;
    endpoints.push({
      key,
      pluginId,
      method: String(handler.method).toUpperCase(),
      path: handler.path,
      handler: handler.handler,
    });
  }
  return endpoints;
}

/**
 * 把插件 HTTP 端点挂载到 serve 的路由表
 *
 * registerRoute 返回 false 表示该 method+path 已被占用（与内置路由或其他插件冲突），
 * 冲突端点跳过并警告，避免静默覆盖已有路由。
 *
 * @param {object} repo — Repository 实例
 * @param {Function} registerRoute — serve.cjs 的 route(method, pattern, handler)，返回是否新注册
 * @returns {Promise<Array<{key, pluginId, method, path}>>} 挂载清单
 */
async function mountPluginRoutes(repo, registerRoute) {
  const mounted = [];
  const conflicts = [];
  for (const ep of collectPluginEndpoints(repo)) {
    const adapted = adaptPluginHandler(ep.handler, {
      pluginId: ep.pluginId,
      key: ep.key,
    });
    const isNew = registerRoute(ep.method, ep.path, adapted);
    if (isNew === false) {
      conflicts.push(ep);
      continue;
    }
    mounted.push({
      key: ep.key,
      pluginId: ep.pluginId,
      method: ep.method,
      path: ep.path,
    });
  }
  for (const ep of conflicts) {
    console.warn(
      `[plugin:${ep.pluginId}] HTTP 端点 ${ep.method} ${ep.path} 与已有路由冲突，已跳过挂载`
    );
  }
  return mounted;
}

module.exports = {
  isHttpEndpoint,
  isPluginEndpointAllowed,
  adaptPluginHandler,
  collectPluginEndpoints,
  mountPluginRoutes,
};
