jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
}));

jest.mock('fs', () => ({
  mkdtempSync: jest.fn(() => '/tmp/lo-mock-sign'),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn(() => Buffer.from('mock-sig')),
  rmSync: jest.fn(),
}));

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const { signWithSshKeygen, AuthClient } = require('../src/auth.cjs');

function mockClient(responses) {
  return {
    request: jest.fn(async (method, url) => {
      const body = responses[url] || {};
      return { status: 200, body, headers: {} };
    }),
  };
}

describe('signWithSshKeygen', () => {
  afterEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(Buffer.from('mock-sig'));
  });

  it('成功生成 base64 签名', () => {
    childProcess.spawnSync.mockReturnValue({ status: 0 });
    const sig = signWithSshKeygen('nonce1', '/tmp/key', 'lo-cli');
    expect(sig).toBe(Buffer.from('mock-sig').toString('base64'));
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(fs.rmSync).toHaveBeenCalled(); // 清理临时目录
  });

  it('ssh-keygen 失败抛错', () => {
    childProcess.spawnSync.mockReturnValue({
      status: 1,
      stderr: 'no such key',
    });
    expect(() => signWithSshKeygen('n', '/nope')).toThrow(/ssh-keygen 签名失败/);
  });

  it('stderr 为空时回退到 stdout 拼接错误', () => {
    childProcess.spawnSync.mockReturnValue({ status: 1, stderr: '' });
    expect(() => signWithSshKeygen('n', '/nope')).toThrow(/ssh-keygen 签名失败/);
  });

  it('未生成签名文件抛错', () => {
    childProcess.spawnSync.mockReturnValue({ status: 0 });
    fs.existsSync.mockReturnValue(false);
    expect(() => signWithSshKeygen('n', '/k')).toThrow(/未生成签名文件/);
  });
});

describe('AuthClient._deriveFingerprint', () => {
  it('成功解析 fingerprint', async () => {
    childProcess.spawnSync.mockReturnValue({
      status: 0,
      stdout: '256 SHA256:AbCdEf123456 user@host\n',
    });
    const auth = new AuthClient(mockClient({}));
    const fp = await auth._deriveFingerprint('ssh-ed25519 AAAA fake');
    expect(fp).toBe('SHA256:AbCdEf123456');
    expect(childProcess.spawnSync).toHaveBeenCalledWith(
      'ssh-keygen',
      ['-lf', expect.any(String)],
      expect.any(Object),
    );
  });

  it('ssh-keygen -lf 失败抛错', () => {
    childProcess.spawnSync.mockReturnValue({ status: 2, stderr: 'bad key' });
    const auth = new AuthClient(mockClient({}));
    expect(() => auth._deriveFingerprint('invalid')).toThrow(/lf/);
  });

  it('ssh-keygen -lf 失败且 stderr 为空', () => {
    childProcess.spawnSync.mockReturnValue({ status: 2, stderr: '' });
    const auth = new AuthClient(mockClient({}));
    expect(() => auth._deriveFingerprint('invalid')).toThrow(/lf/);
  });

  it('stdout 无 fingerprint 返回 null', async () => {
    childProcess.spawnSync.mockReturnValue({ status: 0, stdout: 'garbage' });
    const auth = new AuthClient(mockClient({}));
    expect(await auth._deriveFingerprint('x')).toBeNull();
  });
});

describe('AuthClient 认证流程', () => {
  it('login 使用注入 signer 签名(默认 signer 分支未走,避免真实 ssh-keygen)', async () => {
    const signer = jest.fn(() => 'signed-fake');
    const client = mockClient({});
    const auth = new AuthClient(client, {
      signer,
      namespace: 'lo-test',
    });
    client.request.mockImplementation(async (method, url, q, opts) => {
      if (url === '/api/auth/challenge') {
        return {
          status: 200,
          body: { nonce: 'nn', registeredKeys: [{ fingerprint: 'f2' }] },
          headers: {},
        };
      }
      if (url === '/api/auth/login') {
        expect(opts.body).toEqual({
          nonce: 'nn',
          fingerprint: 'f2',
          signature: 'signed-fake',
        });
        return {
          status: 200,
          body: { token: 'tok', fingerprint: 'f2' },
          headers: {},
        };
      }
      return { status: 200, body: {}, headers: {} };
    });
    const res = await auth.login({ fingerprint: 'f2', privateKey: '/k' });
    expect(signer).toHaveBeenCalledWith('nn', path.resolve('/k'));
    expect(res.token).toBe('tok');
    expect(auth.authenticated).toBe(true);
  });

  it('login 未注入 signer 时走默认 signWithSshKeygen 分支', async () => {
    childProcess.spawnSync.mockReturnValue({ status: 0 });
    const client = mockClient({});
    client.request.mockImplementation(async (method, url) => {
      if (url === '/api/auth/challenge') {
        return {
          status: 200,
          body: { nonce: 'nn', registeredKeys: [{ fingerprint: 'f9' }] },
          headers: {},
        };
      }
      if (url === '/api/auth/login') {
        return {
          status: 200,
          body: { token: 'tok', fingerprint: 'f9' },
          headers: {},
        };
      }
      return { status: 200, body: {}, headers: {} };
    });
    const auth = new AuthClient(client, { namespace: 'lo-test' });
    const res = await auth.login({ fingerprint: 'f9', privateKey: '/k' });
    expect(res.token).toBe('tok');
    expect(childProcess.spawnSync).toHaveBeenCalledWith(
      'ssh-keygen',
      expect.any(Array),
      expect.any(Object),
    );
  });

  it('login 无参走默认参数并抛缺 fingerprint', async () => {
    const auth = new AuthClient(mockClient({}));
    await expect(auth.login()).rejects.toThrow(/需要提供 fingerprint/);
  });

  it('fingerprint 缺但提供 publicKey 可触发派生', async () => {
    childProcess.spawnSync.mockReturnValue({
      status: 0,
      stdout: 'SHA256:pub123 host\n',
    });
    const client = mockClient({});
    client.request.mockImplementation(async (method, url) => {
      if (url === '/api/auth/challenge') {
        return {
          status: 200,
          body: { nonce: 'nn', registeredKeys: [{ fingerprint: 'SHA256:pub123' }] },
          headers: {},
        };
      }
      if (url === '/api/auth/login') {
        return { status: 200, body: { token: 't' }, headers: {} };
      }
      return { status: 200, body: {}, headers: {} };
    });
    const auth = new AuthClient(client, { signer: () => 'sig' });
    const res = await auth.login({ publicKey: 'ssh-ed25519 AAA' });
    expect(res.token).toBe('t');
    // body.fingerprint 缺失 → 回退到 fd(from publicKey)
    expect(auth.fingerprint).toBe('SHA256:pub123');
  });

  it('challenge registeredKeys 缺失时未注册指纹抛错', async () => {
    const client = mockClient({});
    client.request.mockImplementation(async (method, url) => {
      if (url === '/api/auth/challenge') {
        return { status: 200, body: { nonce: 'nn' }, headers: {} };
      }
      return { status: 200, body: {}, headers: {} };
    });
    const auth = new AuthClient(client, { signer: (n, p) => 'x' });
    await expect(auth.login({ fingerprint: 'nope' })).rejects.toThrow(/未注册的公钥指纹: nope/);
  });
});
