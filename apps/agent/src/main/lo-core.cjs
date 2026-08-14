/**
 * lo-core.cjs —— lo 核心连接服务（主进程）
 *
 * 封装 @lo/client，向渲染进程提供受控能力：
 *   - configure:   配置仓库地址(host/port/protocol)
 *   - login:       SSH 挑战-应答登录(支持私钥路径或手动 nonce/signature)
 *   - getStatus:   获取 repo 状态(stats)
 *   - listNotes:   获取资源列表
 *   - getNote:     获取单个资源(含 content)
 *   - updateNote:  更新资源字段
 *
 * 全部方法返回可序列化数据；网络/业务错误统一转成 { error, message } 结构，
 * 避免把 Error 实例直接抛给 IPC。
 */
const { LoClient, LoApiError, LoHttpError } = require('@lo/client');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;

class LoCoreService {
  /**
   * @param {object} [deps]
   * @param {Function} [deps.LoClient]  — 便于测试注入 mock
   * @param {Function} [deps.loadConfig] — 返回持久化配置的对象
   */
  constructor(deps = {}) {
    this._Client = deps.LoClient || LoClient;
    this._loadConfig = deps.loadConfig || (() => ({}));
    this._saveConfig = deps.saveConfig || (() => {});
    this.client = null;
    this.config = {};
    /** 当前 SSE 事件订阅(单例,登录后激活,登出关闭) */
    this._eventSub = null;
  }

  /** 读取持久化配置并预填当前配置 */
  load() {
    this.config = this._loadConfig() || {};
    return this.config;
  }

  /**
   * 配置仓库地址
   * @param {object} cfg — { host, port, protocol }
   * @returns {{ ok: true, config }}
   */
  configure(cfg = {}) {
    const base = { ...this._loadConfig(), ...this.config };
    const host = cfg.host || base.host || DEFAULT_HOST;
    const port = cfg.port === undefined ? base.port ?? DEFAULT_PORT : Number(cfg.port);
    const protocol = cfg.protocol || base.protocol || 'http';
    const timeout =
      cfg.timeout === undefined
        ? base.timeout === undefined
          ? 15000
          : Number(base.timeout)
        : Number(cfg.timeout);

    const config = { ...this.config, host, port, protocol, timeout };
    this.config = config;
    this.client = new this._Client(config);
    this._save(config);
    return { ok: true, config };
  }

  /** 保存配置(合并 currentConfig 与持久化已有字段) */
  _save(patch = {}) {
    const next = { ...this._loadConfig(), ...this.config, ...patch };
    this.config = next;
    this._saveConfig(next);
    return next;
  }

  /** 是否已配置 */
  get configured() {
    return !!this.client;
  }

  /**
   * SSH 登录
   * @param {object} [params] — { privateKeyPath?, nonce?, signature?, fingerprint? }
   */
  async login(params = {}) {
    try {
      this._ensureClient();
      const result = await this.client.login(params);
      const session = {
        ok: true,
        token: result.token,
        fingerprint: result.fingerprint || null,
      };
      if (params.privateKeyPath) {
        this._save({ privateKeyPath: params.privateKeyPath });
      }
      return session;
    } catch (e) {
      return this._toError(e);
    }
  }

  /** 获取 repo 状态(stats) */
  async getStatus() {
    try {
      this._ensureClient();
      const stats = await this.client.health.stats();
      return { ok: true, stats };
    } catch (e) {
      return this._toError(e);
    }
  }

  /**
   * 获取资源列表
   * @param {object} [query] — { type, schema, limit, offset }
   */
  async listNotes(query = {}) {
    try {
      this._ensureClient();
      const result = await this.client.notes.list(query);
      return { ok: true, total: result.total, data: result.data };
    } catch (e) {
      return this._toError(e);
    }
  }

  /**
   * 获取单个资源(含 content)
   * @param {string} rid
   */
  async getNote(rid) {
    try {
      this._ensureClient();
      const data = await this.client.notes.get(rid);
      return { ok: true, data };
    } catch (e) {
      return this._toError(e);
    }
  }

  /**
   * 更新资源(content/metadata/title/tags/category)
   *
   * 写路径已收敛到 Operation 语义(010 Phase1/Phase2):
   *   client.operations.execute("resource.update", { rid, updates })
   * 保持外部调用接口不变: updateNote(rid, body) → { ok, operationId?, data }
   * @param {string} rid
   * @param {object} body
   */
  async updateNote(rid, body) {
    try {
      this._ensureClient();
      const { operationId, result } = await this.client.operations.execute(
        'resource.update',
        { rid, updates: body || {} },
        {},
      );
      return { ok: true, operationId, data: result };
    } catch (e) {
      return this._toError(e);
    }
  }

  /**
   * 获取资源关联关系
   * @param {string} rid
   * @returns {Promise<{ ok: true, data: { outgoing, incoming } }>}
   */
  async getRelations(rid) {
    try {
      this._ensureClient();
      const data = await this.client.relations.list({ rid });
      return { ok: true, data };
    } catch (e) {
      return this._toError(e);
    }
  }

  /**
   * 获取操作历史
   * @param {object} [query] — { limit?, type?, status? }
   */
  async listOperations(query = {}) {
    try {
      this._ensureClient();
      const result = await this.client.operations.list(query);
      return { ok: true, total: result.total, data: result.data };
    } catch (e) {
      return this._toError(e);
    }
  }

  /**
   * 撤销操作
   * @param {string} operationId
   */
  async undoOperation(operationId) {
    try {
      this._ensureClient();
      const result = await this.client.operations.undo(operationId);
      return { ok: true, data: result };
    } catch (e) {
      return this._toError(e);
    }
  }

  /**
   * 订阅 Core 事件(SSE)
   *
   * 复用 @lo/client.events.subscribe；单例订阅，重复调用会先关闭旧订阅。
   * 事件经回调透传给调用方(主进程 IPC handler 转发到渲染进程)。
   * @param {string[]} types — 事件类型列表(如 ['resource.created'])
   * @param {Function} handler — (event) => void
   * @returns {{ ok: true }}
   */
  subscribeEvents(types, handler) {
    try {
      this._ensureClient();
      if (this._eventSub) {
        this._eventSub.close();
        this._eventSub = null;
      }
      this._eventSub = this.client.events.subscribe(types, (event) => handler(event));
      return { ok: true };
    } catch (e) {
      return this._toError(e);
    }
  }

  /** 关闭当前事件订阅 */
  unsubscribeEvents() {
    if (this._eventSub) {
      this._eventSub.close();
      this._eventSub = null;
    }
    return { ok: true };
  }

  /** 登出(清除本地 token,并移除持久化的私钥路径,避免下次自动登录) */
  logout() {
    this.unsubscribeEvents();
    if (this.client) this.client.logout();
    const next = { ...this._loadConfig(), ...this.config };
    delete next.privateKeyPath;
    this.config = next;
    this._saveConfig(next);
    return { ok: true };
  }

  _ensureClient() {
    if (!this.client) {
      throw new Error('请先配置仓库地址（configure）');
    }
  }

  _toError(e) {
    if (e instanceof LoApiError) {
      return {
        ok: false,
        error: 'api',
        status: e.status,
        message: e.message,
      };
    }
    if (e instanceof LoHttpError) {
      return {
        ok: false,
        error: 'http',
        code: e.code,
        message: e.message,
      };
    }
    return { ok: false, error: 'unknown', message: e.message || String(e) };
  }
}

module.exports = { LoCoreService, DEFAULT_HOST, DEFAULT_PORT };
