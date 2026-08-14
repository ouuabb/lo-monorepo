/**
 * http.cjs —— HTTP 请求封装（基于 Node 原生 http/https）
 *
 * 职责：
 *   - 发起 GET / POST / PUT / DELETE 请求
 *   - JSON 序列化与响应解析
 *   - 统一错误类型 LoHttpError / LoApiError
 *   - 超时与重定向跟随
 */
const http = require('http');
const https = require('https');

const DEFAULT_TIMEOUT = 15000;
const MAX_REDIRECTS = 5;

/**
 * 客户端错误：URL/连接层问题
 */
class LoHttpError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LoHttpError';
    this.code = options.code || 'ERR_REQUEST';
    this.cause = options.cause;
  }
}

/**
 * 服务端业务错误：非 2xx 且带 { error } 响应体
 */
class LoApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LoApiError';
    this.status = options.status;
    this.body = options.body;
    this.code = options.code;
  }
}

/**
 * 合并参数为查询字符串（跳过 undefined/null）
 * @param {object} params
 * @returns {string}
 */
function buildQuery(params) {
  if (!params) return '';
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) parts.push(`${key}=${encodeURIComponent(v)}`);
    } else {
      parts.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * 发起请求（自动跟随重定向）
 * @param {string} method
 * @param {string} url
 * @param {object} [options] — { body, headers, timeout }
 * @returns {Promise<{ status: number, body: any, headers: object }>}
 */
function request(method, url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === 'https:' ? https : http;

    const body =
      options.body === undefined || options.body === null
        ? null
        : typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body);
    const timeout = options.timeout || DEFAULT_TIMEOUT;

    const req = transport.request(
      target,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(options.headers || {}),
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const raw = data.trim();
          let parsed;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch (e) {
            parsed = raw;
          }
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectsLeft = options._redirects || 0;
            if (redirectsLeft < MAX_REDIRECTS) {
              const nextUrl = new URL(res.headers.location, target).toString();
              request(method, nextUrl, {
                ...options,
                _redirects: redirectsLeft + 1,
              }).then(resolve, reject);
              return;
            }
            const err = new LoHttpError('Too many redirects', {
              code: 'too_many_redirects',
            });
            reject(err);
            return;
          }
          if (res.statusCode >= 400) {
            const message =
              parsed && typeof parsed === 'object' && parsed.error
                ? parsed.error
                : `HTTP ${res.statusCode}`;
            reject(
              new LoApiError(message, {
                status: res.statusCode,
                body: parsed,
                code: parsed && parsed.code,
              }),
            );
            return;
          }
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        });
      },
    );

    req.on('error', (err) => {
      reject(new LoHttpError(`请求失败: ${err.message}`, { cause: err }));
    });

    req.setTimeout(timeout, () => {
      req.destroy(new LoHttpError(`请求超时（${timeout}ms）`, { code: 'timeout' }));
    });

    if (body !== null) req.write(body);
    req.end();
  });
}

/** 便捷方法 */
function get(url, options = {}) {
  return request('GET', url, options);
}

function post(url, body, options = {}) {
  return request('POST', url, { ...options, body });
}

function put(url, body, options = {}) {
  return request('PUT', url, { ...options, body });
}

function del(url, options = {}) {
  return request('DELETE', url, options);
}

module.exports = {
  request,
  get,
  post,
  put,
  del,
  buildQuery,
  LoHttpError,
  LoApiError,
  DEFAULT_TIMEOUT,
};
