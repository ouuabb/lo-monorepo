const { signWithSshKeygen } = require('../src/auth.cjs');
const { LoClient } = require('../src/index.cjs');
const path = require('path');
const os = require('os');
const fs = require('fs');

/** 构造带 mock transport 的 client,记录请求 */
function makeClient(handler) {
  const calls = [];
  const client = new LoClient({
    host: '127.0.0.1',
    port: 8765,
    transport: ({ method, url, requestOpts }) => {
      calls.push({ method, url, requestOpts });
      return handler(method, url, requestOpts);
    },
  });
  return { client, calls };
}

describe('AuthClient.challenge', () => {
  it('POST /api/auth/challenge 并返回 nonce', async () => {
    const { client, calls } = makeClient(() =>
      Promise.resolve({
        status: 200,
        body: { nonce: 'abc123', registeredKeys: [] },
        headers: {},
      }),
    );
    const res = await client.challenge();
    expect(res.nonce).toBe('abc123');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/api/auth/challenge');
    expect(calls[0].requestOpts.headers.Authorization).toBeUndefined();
  });
});

describe('AuthClient 状态', () => {
  it('默认未认证', () => {
    const { client } = makeClient(() => Promise.resolve({ status: 200, body: {}, headers: {} }));
    expect(client.auth.authenticated).toBe(false);
    expect(client.auth.token).toBeNull();
  });

  it('login 后置 authenticated/token', async () => {
    const { client, calls } = makeClient((method, url) => {
      if (url.includes('/api/auth/challenge')) {
        return Promise.resolve({
          status: 200,
          body: { nonce: 'n1', registeredKeys: [{ fingerprint: 'fp1' }] },
          headers: {},
        });
      }
      if (url.includes('/api/auth/login')) {
        return Promise.resolve({
          status: 200,
          body: { token: 'T1', fingerprint: 'fp1', label: 'laptop' },
          headers: {},
        });
      }
      return Promise.resolve({ status: 404, body: { error: 'no' }, headers: {} });
    });
    const res = await client.auth.login({
      fingerprint: 'fp1',
      nonce: 'n1',
      signature: 'sig-base64',
    });
    expect(res.token).toBe('T1');
    expect(client.auth.authenticated).toBe(true);
    expect(client.auth.fingerprint).toBe('fp1');
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/auth/login'))).toBe(true);
  });

  it('logout 清空认证状态', async () => {
    const { client } = makeClient(() => Promise.resolve({ status: 200, body: {}, headers: {} }));
    client.auth._token = 'x';
    client.auth._fingerprint = 'fp';
    client.logout();
    expect(client.auth.authenticated).toBe(false);
  });

  it('login 无入参需先 challenge 且缺 fingerprint 抛错', async () => {
    const { client } = makeClient(() =>
      Promise.resolve({
        status: 200,
        body: { nonce: 'n', registeredKeys: [{ fingerprint: 'fp' }] },
        headers: {},
      }),
    );
    await expect(client.auth.login({ nonce: 'n', signature: 's' })).rejects.toThrow(
      'login 需要提供 fingerprint、publicKey 或 privateKeyPath',
    );
  });

  it('login 签名用自定义 signer', async () => {
    const signer = jest.fn(() => 'signed-from-signer');
    const { client, calls } = makeClient((method, url) => {
      if (url.endsWith('/api/auth/challenge')) {
        return Promise.resolve({
          status: 200,
          body: {
            nonce: 'nn',
            registeredKeys: [{ fingerprint: 'f2' }],
          },
          headers: {},
        });
      }
      if (url.endsWith('/api/auth/login')) {
        return Promise.resolve({
          status: 200,
          body: { token: 'T', fingerprint: 'f2' },
          headers: {},
        });
      }
      return Promise.resolve({ status: 200, body: {}, headers: {} });
    });
    // 直接在 auth 注入 signer 来绕过文件 IO
    client.auth._signer = signer;
    await client.auth.login({ fingerprint: 'f2', privateKeyPath: 'key' });
    expect(signer).toHaveBeenCalled();
    const loginCall = calls.find((c) => c.url.endsWith('/api/auth/login'));
    expect(loginCall.requestOpts.body.signature).toBe('signed-from-signer');
  });

  it('login 只用 privateKeyPath 也能完成（自动推导指纹并签名）', async () => {
    const { client, calls } = makeClient((method, url) => {
      if (url.endsWith('/api/auth/challenge')) {
        return Promise.resolve({
          status: 200,
          body: { nonce: 'nn', registeredKeys: [{ fingerprint: 'fp3' }] },
          headers: {},
        });
      }
      if (url.endsWith('/api/auth/login')) {
        return Promise.resolve({
          status: 200,
          body: { token: 'T', fingerprint: 'fp3' },
          headers: {},
        });
      }
      return Promise.resolve({ status: 200, body: {}, headers: {} });
    });

    const priv = path.join(os.tmpdir(), `lo-auth-test-${Date.now()}`, 'id_key');
    fs.mkdirSync(path.dirname(priv), { recursive: true });
    fs.writeFileSync(`${priv}.pub`, 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIx fake pub key comment');

    const signer = jest.fn(() => 'signed-from-path');
    client.auth._signer = signer;
    const spy = jest
      .spyOn(client.auth, '_deriveFingerprint')
      .mockResolvedValue('fp3');

    try {
      const res = await client.auth.login({ privateKeyPath: priv });
      expect(res.token).toBe('T');
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIx'),
      );
      expect(signer).toHaveBeenCalledWith('nn', path.resolve(priv));
      const loginCall = calls.find((c) => c.url.endsWith('/api/auth/login'));
      expect(loginCall.requestOpts.body.signature).toBe('signed-from-path');
      expect(loginCall.requestOpts.body.fingerprint).toBe('fp3');
    } finally {
      spy.mockRestore();
      fs.rmSync(path.dirname(priv), { recursive: true, force: true });
    }
  });

  it('未注册指纹抛错', async () => {
    const { client } = makeClient(() =>
      Promise.resolve({
        status: 200,
        body: { nonce: 'n', registeredKeys: [{ fingerprint: 'other' }] },
        headers: {},
      }),
    );
    await expect(client.auth.login({ fingerprint: 'unknown' })).rejects.toThrow('未注册的公钥指纹');
  });
});

describe('signWithSshKeygen 接口', () => {
  it('导出函数且内部依赖外部 ssh-keygen(跳过实际签名)', () => {
    expect(typeof signWithSshKeygen).toBe('function');
  });
});
