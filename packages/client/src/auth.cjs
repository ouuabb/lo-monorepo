/**
 * auth.cjs —— lo serve 认证
 *
 * lo serve 使用 SSH 挑战-应答认证：
 *   1. POST /api/auth/challenge → { nonce, namespace: 'lo-cli', registeredKeys }
 *   2. 本地 ssh-keygen -Y sign 对 nonce 签名（namespace 由 serve 决定）
 *   3. POST /api/auth/login { nonce, fingerprint, signature } → { token }
 *   4. 后续请求携带 Authorization: Bearer <token>
 *
 * 本模块抽象签名细节：签名函数可由调用方注入（libSSH / ssh-keygen / 自实现），
 * 默认使用系统 ssh-keygen。
 */
const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

/**
 * 展开 ~ 为用户主目录并输出绝对路径（ssh-keygen 不做 ~ 展开）
 * @param {string} p
 * @returns {string}
 */
function expandHome(p) {
  if (!p || typeof p !== 'string') return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return path.resolve(p);
}

/**
 * 使用 ssh-keygen 生成签名文件（OpenSSH 格式）
 * @param {string} nonce
 * @param {string} privateKeyPath
 * @param {string} [namespace='lo-cli']
 * @returns {string} base64 签名
 */
function signWithSshKeygen(nonce, privateKeyPath, namespace = 'lo-cli') {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-client-sign-'));
  try {
    const challengeFile = path.join(workDir, 'challenge.txt');
    const sigFile = `${challengeFile}.sig`;
    fs.writeFileSync(challengeFile, nonce);

    const result = spawnSync(
      'ssh-keygen',
      ['-Y', 'sign', '-f', privateKeyPath, '-n', namespace, challengeFile],
      { encoding: 'utf8', windowsHide: true, timeout: 15000 },
    );
    if (result.status !== 0) {
      throw new Error(`ssh-keygen 签名失败: ${(result.stderr || result.stdout || '').trim()}`);
    }
    if (!fs.existsSync(sigFile)) {
      throw new Error('ssh-keygen 未生成签名文件');
    }
    return fs.readFileSync(sigFile).toString('base64');
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (e) {
      /* 忽略清理失败 */
    }
  }
}

/**
 * AuthClient —— challenge/login/token 管理
 */
class AuthClient {
  /**
   * @param {object} client — LoClient，需含 _request 与 baseUrl
   * @param {object} [options] — { signer, namespace }
   */
  constructor(client, options = {}) {
    this._client = client;
    this._signer = options.signer;
    this._namespace = options.namespace || 'lo-cli';
    this._token = null;
    this._fingerprint = null;
    this._label = null;
  }

  get token() {
    return this._token;
  }

  get fingerprint() {
    return this._fingerprint;
  }

  /** 是否已通过认证 */
  get authenticated() {
    return !!(this._token && this._fingerprint);
  }

  /** 获取挑战与已注册公钥 */
  async challenge() {
    const res = await this._client.request('POST', '/api/auth/challenge', undefined, {
      skipAuth: true,
    });
    return res.body;
  }

  /**
   * 通过 SSH 签名完成登录
   * @param {object} params — { privateKeyPath?, signature?, fingerprint?, nonce? }
   * @returns {Promise<{ token, label, fingerprint }>}
   */
  async login(params = {}) {
    // 兼容文档入参 { fingerprint / publicKey } 与 { privateKeyPath }。
    // 仅提供 privateKeyPath 时，自动从同目录 .pub 推导指纹以匹配 serve 注册的公钥。
    const keyPath = expandHome(params.privateKeyPath || params.privateKey);
    let fd = params.fingerprint;

    if (!fd && params.publicKey) {
      fd = await this._deriveFingerprint(params.publicKey);
    }
    if (!fd && keyPath) {
      const pubPath = `${keyPath}.pub`;
      if (!fs.existsSync(pubPath)) {
        throw new Error(`公钥文件不存在: ${pubPath}`);
      }
      fd = await this._deriveFingerprint(fs.readFileSync(pubPath, 'utf8'));
    }
    if (!fd) {
      throw new Error('login 需要提供 fingerprint、publicKey 或 privateKeyPath 以匹配注册密钥');
    }

    // 若无签名,生成挑战并签名
    let nonce = params.nonce;
    let signature = params.signature;
    if (!nonce || !signature) {
      const chall = await this.challenge();
      nonce = chall.nonce;
      const key = (chall.registeredKeys || []).find((k) => k.fingerprint === fd);
      if (!key) {
        throw new Error(`未注册的公钥指纹: ${fd}`);
      }
      const signer = this._signer || ((n, p) => signWithSshKeygen(n, p, this._namespace));
      signature = signer(nonce, keyPath);
    }

    const res = await this._client.request('POST', '/api/auth/login', undefined, {
      body: { nonce, fingerprint: fd, signature },
      skipAuth: true,
    });
    const body = res.body;
    this._token = body.token;
    this._fingerprint = body.fingerprint || fd;
    this._label = body.label || null;
    return body;
  }

  /**
   * 计算公钥的 OpenSSH fingerprint（格式 SHA256:xxxx）
   * 使用 ssh-keygen -lf。
   * @param {string} publicKey — OpenSSH 公钥字符串
   * @returns {string}
   */
  _deriveFingerprint(publicKey) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-client-fp-'));
    const pubFile = path.join(workDir, 'key.pub');
    try {
      fs.writeFileSync(pubFile, publicKey);
      const result = spawnSync('ssh-keygen', ['-lf', pubFile], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000,
      });
      if (result.status !== 0) {
        throw new Error(`ssh-keygen -lf 失败: ${(result.stderr || '').trim()}`);
      }
      const match = result.stdout.match(/(SHA\d+:[A-Za-z0-9+/=]+)/i);
      return match ? match[1] : null;
    } finally {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch (e) {
        /* 忽略 */
      }
    }
  }

  /** 登出（本地清 token） */
  logout() {
    this._token = null;
    this._fingerprint = null;
    this._label = null;
  }
}

module.exports = { AuthClient, signWithSshKeygen };
