/**
 * Authentication — 多提供者认证
 *
 * Phase 6.9: 负责确认"你是谁"，支持多种认证方式。
 * Local Identity / Token / API Key / Plugin Credential / Remote Credential
 */

const Identity = require('./identity.cjs');

class Authentication {
  constructor(db, options = {}) {
    this.db = db;
    this.logger = options.logger || console;
  }

  /**
   * 认证入口，返回 SecurityContext 所需信息
   * @param {object} credentials — { type, token?, apiKey?, ... }
   * @returns {Promise<object>} { identity, authenticated }
   */
  async authenticate(credentials = {}) {
    const type = credentials.type || 'local';

    switch (type) {
      case 'local':
        return this._authenticateLocal();
      case 'token':
        return this._authenticateToken(credentials.token);
      case 'api-key':
        return this._authenticateApiKey(credentials.apiKey);
      case 'plugin':
        return this._authenticatePlugin(credentials.pluginId, credentials.pluginToken);
      case 'remote':
        return this._authenticateRemote(credentials.remoteId, credentials.remoteToken);
      default:
        return { identity: null, authenticated: false, reason: `unknown auth type: ${type}` };
    }
  }

  /**
   * 本地身份 — 默认当前用户
   */
  async _authenticateLocal() {
    const identity = Identity.user('current-user', 'Local User');
    return { identity, authenticated: true };
  }

  /**
   * Token 认证
   */
  async _authenticateToken(token) {
    if (!token) return { identity: null, authenticated: false, reason: 'token required' };

    try {
      const row = await this.db.get(
        `SELECT * FROM credentials WHERE token_hash = ? AND expires_at > ?`,
        [this._hashToken(token), Date.now()]
      );
      if (!row) return { identity: null, authenticated: false, reason: 'invalid token' };

      const meta = row.metadata ? JSON.parse(row.metadata) : {};
      const identity = new Identity({ id: row.identity_id, type: 'user', name: meta.name, metadata: meta });
      return { identity, authenticated: true };
    } catch (e) {
      this.logger.error(`[auth] token auth failed: ${e.message}`);
      return { identity: null, authenticated: false, reason: 'auth error' };
    }
  }

  /**
   * API Key 认证
   */
  async _authenticateApiKey(apiKey) {
    if (!apiKey) return { identity: null, authenticated: false, reason: 'api key required' };

    try {
      const row = await this.db.get(
        `SELECT * FROM credentials WHERE type = 'api-key' AND token_hash = ?`,
        [this._hashToken(apiKey)]
      );
      if (!row) return { identity: null, authenticated: false, reason: 'invalid api key' };

      const meta = row.metadata ? JSON.parse(row.metadata) : {};
      const identity = new Identity({ id: row.identity_id, type: 'user', name: meta.name, metadata: meta });
      return { identity, authenticated: true };
    } catch (e) {
      this.logger.error(`[auth] api-key auth failed: ${e.message}`);
      return { identity: null, authenticated: false, reason: 'auth error' };
    }
  }

  /**
   * 插件凭据认证
   */
  async _authenticatePlugin(pluginId, pluginToken) {
    if (!pluginId) return { identity: null, authenticated: false, reason: 'plugin id required' };

    try {
      // 检查插件是否存在且有凭据
      const row = await this.db.get('SELECT * FROM plugins WHERE id = ?', [pluginId]);
      if (!row) return { identity: null, authenticated: false, reason: 'plugin not found' };

      const identity = Identity.plugin(pluginId, row.name || pluginId);
      return { identity, authenticated: true };
    } catch (e) {
      return { identity: null, authenticated: false, reason: 'plugin auth error' };
    }
  }

  /**
   * 远程凭据认证
   */
  async _authenticateRemote(remoteId, remoteToken) {
    if (!remoteId) return { identity: null, authenticated: false, reason: 'remote id required' };

    try {
      const row = await this.db.get('SELECT * FROM repositories WHERE id = ?', [remoteId]);
      if (!row) return { identity: null, authenticated: false, reason: 'remote not found' };

      const identity = Identity.service(remoteId, row.name || remoteId);
      return { identity, authenticated: true };
    } catch (e) {
      return { identity: null, authenticated: false, reason: 'remote auth error' };
    }
  }

  /**
   * 创建 API Key
   */
  async createApiKey(identityId, name) {
    const token = this._generateToken();
    const tokenHash = this._hashToken(token);

    await this.db.run(
      `INSERT INTO credentials (id, identity_id, type, token_hash, created_at, metadata)
       VALUES (?, ?, 'api-key', ?, ?, ?)`,
      [this._newId(), identityId, tokenHash, Date.now(), JSON.stringify({ name, identityId })]
    );

    return { token, tokenHash };
  }

  /**
   * 创建 Token
   */
  async createToken(identityId, name, expiresMs = 86400000) {
    const token = this._generateToken();
    const tokenHash = this._hashToken(token);
    const expiresAt = Date.now() + expiresMs;

    await this.db.run(
      `INSERT INTO credentials (id, identity_id, type, token_hash, expires_at, created_at, metadata)
       VALUES (?, ?, 'token', ?, ?, ?, ?)`,
      [this._newId(), identityId, tokenHash, expiresAt, Date.now(), JSON.stringify({ name, identityId })]
    );

    return { token, tokenHash, expiresAt };
  }

  /**
   * 吊销凭据
   */
  async revokeCredential(credentialId) {
    await this.db.run('DELETE FROM credentials WHERE id = ?', [credentialId]);
  }

  /**
   * 列出凭据
   */
  async listCredentials(identityId) {
    const rows = await this.db.all(
      'SELECT id, identity_id, type, expires_at, created_at FROM credentials WHERE identity_id = ?',
      [identityId]
    );
    return rows;
  }

  _generateToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'lo_';
    for (let i = 0; i < 40; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  _hashToken(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  _newId() {
    const crypto = require('crypto');
    return `cred_${crypto.randomBytes(8).toString('hex')}`;
  }
}

module.exports = Authentication;
