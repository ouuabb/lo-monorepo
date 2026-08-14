/**
 * @lo/client —— lo 知识库 API 客户端 SDK 入口
 *
 * 消费 log serve 的 HTTP 协议（REST/JSON）。
 *
 * 稳定公开 API:
 *   - LoClient       —— 主客户端类(聚合所有端点)
 *   - LoApiError     —— 服务端业务错误(非 2xx)
 *   - LoHttpError    —— 连接层/超时错误
 *   - AuthClient     —— SSH 挑战-应答认证
 *   - signWithSshKeygen —— 使用系统 ssh-keygen 签名 nonce
 *
 * 用法:
 *   const { LoClient } = require('@lo/client');
 *   const client = new LoClient({ host: '127.0.0.1', port: 8765 });
 *   await client.login({ privateKeyPath: '~/.ssh/id_ed25519' });
 *   const res = await client.notes.get('res_xxx');
 */
const { LoClient, LoApiError, LoHttpError, signWithSshKeygen } = require('./client.cjs');
const { AuthClient } = require('./auth.cjs');
const http = require('./http.cjs');

const SDK_VERSION = require('../package.json').version;

module.exports = {
  LoClient,
  AuthClient,
  LoApiError,
  LoHttpError,
  signWithSshKeygen,
  buildQuery: http.buildQuery,
  SDK_VERSION,
};
