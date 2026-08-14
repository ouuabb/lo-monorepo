const cp = require('child_process');
const crypto = require('crypto');
const nodeFs = require('fs');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const SshAuth = require('../../src/utils/sshAuth.cjs');

jest.mock('child_process', () => ({
  execSync: jest.fn(),
  execFileSync: jest.fn()
}));

const SESSION_CACHE_FILE = path.join(os.tmpdir(), '.lo-auth-session.json');

const defaultExecFileSync = (cmd, args) => {
  if (args && args[0] === '-lf') return '2048 SHA256:mockFp1 user@host (RSA)\n';
  return Buffer.from('');
};

const defaultExecSync = (cmd) => {
  if (cmd.startsWith('ssh-keygen -V')) return 'OpenSSH_8.9p1 OpenSSL 3.0.2\n';
  if (cmd.startsWith('ssh-add -l')) return 'The agent has no identities.\n';
  return Buffer.from('');
};

let sshDir;
let baseDir;
let savedUserProfile;

beforeEach(async () => {
  cp.execFileSync.mockReset();
  cp.execFileSync.mockImplementation(defaultExecFileSync);
  cp.execSync.mockReset();
  cp.execSync.mockImplementation(defaultExecSync);
  savedUserProfile = process.env.USERPROFILE;
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-ssh-'));
  sshDir = path.join(baseDir, '.ssh');
  await fs.ensureDir(sshDir);
  process.env.USERPROFILE = baseDir;
  // 跨平台：非 win32 下 _getSshDir() 用 os.homedir()，固定指向测试临时目录，避免读到真实 ~/.ssh
  jest.spyOn(os, 'homedir').mockReturnValue(baseDir);
  try {
    nodeFs.unlinkSync(SESSION_CACHE_FILE);
  } catch {}
});

afterEach(async () => {
  process.env.USERPROFILE = savedUserProfile;
  try {
    nodeFs.unlinkSync(SESSION_CACHE_FILE);
  } catch {}
  await fs.remove(baseDir);
  jest.restoreAllMocks();
});

describe('SshAuth environment detection', () => {
  test('isAvailable returns true when ssh-keygen runs', () => {
    expect(SshAuth.isAvailable()).toBe(true);
  });

  test('isAvailable returns false when ssh-keygen missing', () => {
    cp.execFileSync.mockImplementation(() => {
      const e = new Error('spawn ssh-keygen ENOENT');
      e.code = 'ENOENT';
      throw e;
    });
    expect(SshAuth.isAvailable()).toBe(false);
  });

  test('isAvailable returns false on EACCES', () => {
    cp.execFileSync.mockImplementation(() => {
      const e = new Error('permission denied');
      e.code = 'EACCES';
      throw e;
    });
    expect(SshAuth.isAvailable()).toBe(false);
  });

  test('isAvailable returns true on unrelated errors', () => {
    cp.execFileSync.mockImplementation(() => {
      throw new Error('weird failure');
    });
    expect(SshAuth.isAvailable()).toBe(true);
  });

  test('supportsYSign returns true when -Y accepted', () => {
    expect(SshAuth.supportsYSign()).toBe(true);
  });

  test('supportsYSign returns false for unknown option', () => {
    cp.execFileSync.mockImplementation(() => {
      const e = new Error('usage error');
      e.stderr = Buffer.from('unknown option -- Y');
      throw e;
    });
    expect(SshAuth.supportsYSign()).toBe(false);
  });

  test('supportsYSign returns false for illegal option', () => {
    cp.execFileSync.mockImplementation(() => {
      const e = new Error('usage error');
      e.stderr = Buffer.from('illegal option -- Y');
      throw e;
    });
    expect(SshAuth.supportsYSign()).toBe(false);
  });

  test('supportsYSign returns true for unrelated errors', () => {
    cp.execFileSync.mockImplementation(() => {
      const e = new Error('unexpected');
      e.stderr = Buffer.from('some other message');
      throw e;
    });
    expect(SshAuth.supportsYSign()).toBe(true);
  });

  test('supportsYSign returns true when error has no stderr', () => {
    cp.execFileSync.mockImplementation(() => {
      throw new Error('plain error');
    });
    expect(SshAuth.supportsYSign()).toBe(true);
  });

  test('getVersion extracts OpenSSH version', () => {
    cp.execSync.mockImplementation(() => 'OpenSSH_8.9p1 OpenSSL 3.0.2\n');
    expect(SshAuth.getVersion()).toBe('8.9');
  });

  test('getVersion returns null when no version match', () => {
    cp.execSync.mockImplementation(() => 'git version 2.40.0\n');
    expect(SshAuth.getVersion()).toBeNull();
  });

  test('getVersion returns null on error', () => {
    cp.execSync.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(SshAuth.getVersion()).toBeNull();
  });

  test('isAgentRunning returns true when agent responds', () => {
    cp.execSync.mockImplementation(() => '256 SHA256:abc user@host (ED25519)\n');
    expect(SshAuth.isAgentRunning()).toBe(true);
  });

  test('isAgentRunning returns false when agent unreachable', () => {
    cp.execSync.mockImplementation(() => 'Could not open a connection to your authentication agent.\n');
    expect(SshAuth.isAgentRunning()).toBe(false);
  });

  test('isAgentRunning returns false on error connecting', () => {
    cp.execSync.mockImplementation(() => 'Error connecting to agent: no such file\n');
    expect(SshAuth.isAgentRunning()).toBe(false);
  });

  test('isAgentRunning returns false on throw', () => {
    cp.execSync.mockImplementation(() => {
      throw new Error('gone');
    });
    expect(SshAuth.isAgentRunning()).toBe(false);
  });
});

describe('SshAuth key discovery', () => {
  test('_getSshDir falls back to homedir on non-win32', () => {
    jest.spyOn(os, 'platform').mockReturnValue('linux');
    expect(SshAuth._getSshDir()).toBe(path.join(os.homedir(), '.ssh'));
  });

  test('listKeys returns empty when ssh dir missing', () => {
    process.env.USERPROFILE = path.join(os.tmpdir(), 'lo-test-missing-profile');
    expect(SshAuth.listKeys()).toEqual([]);
  });

  test('listKeys returns empty for empty ssh dir', () => {
    expect(SshAuth.listKeys()).toEqual([]);
  });

  test('listKeys lists valid key pairs', async () => {
    await fs.writeFile(path.join(sshDir, 'id_rsa.pub'), 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAB test@host\n');
    await fs.writeFile(path.join(sshDir, 'id_rsa'), 'PRIVATE');
    const keys = SshAuth.listKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0].name).toBe('id_rsa');
    expect(keys[0].publicKeyPath).toBe(path.join(sshDir, 'id_rsa.pub'));
    expect(keys[0].privateKeyPath).toBe(path.join(sshDir, 'id_rsa'));
    expect(keys[0].fingerprint).toBe('SHA256:mockFp1');
    expect(keys[0].type).toBe('ssh-rsa');
    expect(keys[0].comment).toBe('test@host');
  });

  test('listKeys skips pub files without a private key', async () => {
    await fs.writeFile(path.join(sshDir, 'orphan.pub'), 'ssh-rsa AAAA comment\n');
    expect(SshAuth.listKeys()).toEqual([]);
  });

  test('listKeys skips commented pub files', async () => {
    await fs.writeFile(path.join(sshDir, 'commented.pub'), '# generated comment\n');
    await fs.writeFile(path.join(sshDir, 'commented'), 'PRIVATE');
    expect(SshAuth.listKeys()).toEqual([]);
  });

  test('listKeys skips malformed pub content', async () => {
    await fs.writeFile(path.join(sshDir, 'bad.pub'), 'onlyonetoken\n');
    await fs.writeFile(path.join(sshDir, 'bad'), 'PRIVATE');
    expect(SshAuth.listKeys()).toEqual([]);
  });

  test('listKeys uses filename as comment fallback', async () => {
    await fs.writeFile(path.join(sshDir, 'nocomment.pub'), 'ssh-ed25519 AAAA\n');
    await fs.writeFile(path.join(sshDir, 'nocomment'), 'PRIVATE');
    const keys = SshAuth.listKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0].comment).toBe('nocomment.pub');
  });

  test('listKeys skips unreadable pub files', async () => {
    await fs.writeFile(path.join(sshDir, 'locked.pub'), 'ssh-rsa AAAA comment\n');
    await fs.writeFile(path.join(sshDir, 'locked'), 'PRIVATE');
    const original = nodeFs.readFileSync;
    jest.spyOn(nodeFs, 'readFileSync').mockImplementation((p, enc) => {
      if (String(p).endsWith('locked.pub')) throw new Error('EACCES');
      return original.call(nodeFs, p, enc);
    });
    expect(SshAuth.listKeys()).toEqual([]);
  });

  test('listKeys marks keys loaded in agent', async () => {
    await fs.writeFile(path.join(sshDir, 'id_ed25519.pub'), 'ssh-ed25519 AAAA user@host\n');
    await fs.writeFile(path.join(sshDir, 'id_ed25519'), 'PRIVATE');
    cp.execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('ssh-add -l')) return '256 SHA256:mockFp1 user@host (ED25519)\n';
      return Buffer.from('');
    });
    const keys = SshAuth.listKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0].inAgent).toBe(true);
  });

  test('listKeys leaves inAgent unset when fingerprint differs', async () => {
    await fs.writeFile(path.join(sshDir, 'id_rsa.pub'), 'ssh-rsa AAAA user@host\n');
    await fs.writeFile(path.join(sshDir, 'id_rsa'), 'PRIVATE');
    cp.execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('ssh-add -l')) return '256 SHA256:otherFp user@host (ED25519)\n';
      return Buffer.from('');
    });
    const keys = SshAuth.listKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0].inAgent).toBeUndefined();
  });

  test('listKeys ignores agent query failures', async () => {
    await fs.writeFile(path.join(sshDir, 'id_rsa.pub'), 'ssh-rsa AAAA user@host\n');
    await fs.writeFile(path.join(sshDir, 'id_rsa'), 'PRIVATE');
    cp.execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('ssh-add -l 2>&1')) return 'The agent has no identities.\n';
      if (cmd === 'ssh-add -l') throw new Error('agent gone');
      return Buffer.from('');
    });
    expect(SshAuth.listKeys()).toHaveLength(1);
  });

  test('getPublicKey parses standard format', async () => {
    const pubPath = await testUtils.createTestFile(sshDir, 'k.pub', 'ssh-ed25519 AAAAk1 comment here');
    const parsed = SshAuth.getPublicKey(pubPath);
    expect(parsed.type).toBe('ssh-ed25519');
    expect(parsed.key).toBe('AAAAk1');
    expect(parsed.comment).toBe('comment here');
    expect(parsed.raw).toBe('ssh-ed25519 AAAAk1 comment here');
  });

  test('getPublicKey throws for invalid content', async () => {
    const pubPath = await testUtils.createTestFile(sshDir, 'k.pub', 'onlyone');
    expect(() => SshAuth.getPublicKey(pubPath)).toThrow('无效的公钥文件');
  });

  test('getPrivateKeyPath strips .pub suffix', () => {
    expect(SshAuth.getPrivateKeyPath('/x/y/id.pub')).toBe('/x/y/id');
  });

  test('getPrivateKeyPath passes through non-pub paths', () => {
    expect(SshAuth.getPrivateKeyPath('/x/y/id')).toBe('/x/y/id');
  });
});

describe('SshAuth fingerprint', () => {
  test('computeFingerprint parses ssh-keygen output', async () => {
    const pubPath = await testUtils.createTestFile(sshDir, 'f.pub', 'ssh-rsa AAAA c');
    cp.execFileSync.mockImplementation(() => '2048 SHA256:AbCdEfGh user@host (RSA)\n');
    expect(SshAuth.computeFingerprint(pubPath)).toBe('SHA256:AbCdEfGh');
  });

  test('computeFingerprint returns null when output has no SHA256', async () => {
    const pubPath = await testUtils.createTestFile(sshDir, 'f.pub', 'ssh-rsa AAAA c');
    cp.execFileSync.mockImplementation(() => '2048 abcdef123 user@host (RSA)\n');
    expect(SshAuth.computeFingerprint(pubPath)).toBeNull();
  });

  test('computeFingerprint falls back to manual sha256', async () => {
    const b64 = 'AAAAC3NzaC1lZDI1NTE5AAAAI';
    const pubPath = await testUtils.createTestFile(sshDir, 'f.pub', `ssh-ed25519 ${b64} user`);
    cp.execFileSync.mockImplementation(() => {
      throw new Error('ssh-keygen missing');
    });
    const expected = `SHA256:${  crypto.createHash('sha256').update(Buffer.from(b64, 'base64')).digest('base64').replace(/=+$/, '')}`;
    expect(SshAuth.computeFingerprint(pubPath)).toBe(expected);
  });

  test('computeFingerprint returns null when all methods fail', () => {
    cp.execFileSync.mockImplementation(() => {
      throw new Error('no');
    });
    expect(SshAuth.computeFingerprint(path.join(sshDir, 'missing.pub'))).toBeNull();
  });
});

describe('SshAuth validateKeypair', () => {
  test('reports missing public key', () => {
    const res = SshAuth.validateKeypair(path.join(sshDir, 'nope.pub'));
    expect(res.valid).toBe(false);
    expect(res.error).toContain('公钥文件不存在');
  });

  test('reports missing private key', async () => {
    await fs.writeFile(path.join(sshDir, 'only.pub'), 'ssh-rsa AAAA c\n');
    const res = SshAuth.validateKeypair(path.join(sshDir, 'only.pub'));
    expect(res.valid).toBe(false);
    expect(res.error).toContain('私钥文件不存在');
  });

  test('accepts valid pair on win32', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('win32');
    await fs.writeFile(path.join(sshDir, 'k.pub'), 'ssh-rsa AAAA c\n');
    await fs.writeFile(path.join(sshDir, 'k'), 'PRIVATE');
    expect(SshAuth.validateKeypair(path.join(sshDir, 'k.pub'))).toEqual({ valid: true, error: null });
  });

  test('rejects loose permissions on non-win32', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('linux');
    await fs.writeFile(path.join(sshDir, 'k.pub'), 'ssh-rsa AAAA c\n');
    await fs.writeFile(path.join(sshDir, 'k'), 'PRIVATE');
    jest.spyOn(nodeFs, 'statSync').mockReturnValue({ mode: 0o100644 });
    const res = SshAuth.validateKeypair(path.join(sshDir, 'k.pub'));
    expect(res.valid).toBe(false);
    expect(res.error).toContain('私钥权限过于宽松');
  });

  test('accepts proper permissions on non-win32', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('linux');
    await fs.writeFile(path.join(sshDir, 'k.pub'), 'ssh-rsa AAAA c\n');
    await fs.writeFile(path.join(sshDir, 'k'), 'PRIVATE');
    jest.spyOn(nodeFs, 'statSync').mockReturnValue({ mode: 0o100600 });
    expect(SshAuth.validateKeypair(path.join(sshDir, 'k.pub')).valid).toBe(true);
  });

  test('ignores stat failures on non-win32', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('linux');
    await fs.writeFile(path.join(sshDir, 'k.pub'), 'ssh-rsa AAAA c\n');
    await fs.writeFile(path.join(sshDir, 'k'), 'PRIVATE');
    jest.spyOn(nodeFs, 'statSync').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(SshAuth.validateKeypair(path.join(sshDir, 'k.pub')).valid).toBe(true);
  });
});

describe('SshAuth verify', () => {
  test('fails when public key unreadable', async () => {
    const res = await SshAuth.verify(path.join(sshDir, 'missing.pub'));
    expect(res.success).toBe(false);
    expect(res.error).toContain('无法读取公钥');
  });

  test('fails when private key missing', async () => {
    await fs.writeFile(path.join(sshDir, 'pubonly.pub'), 'ssh-rsa AAAA c\n');
    const res = await SshAuth.verify(path.join(sshDir, 'pubonly.pub'));
    expect(res.success).toBe(false);
    expect(res.error).toContain('私钥文件不存在');
  });

  test('succeeds with Y sign flow', async () => {
    await fs.writeFile(path.join(sshDir, 'k.pub'), 'ssh-rsa AAAA c\n');
    await fs.writeFile(path.join(sshDir, 'k'), 'PRIVATE');
    const res = await SshAuth.verify(path.join(sshDir, 'k.pub'));
    expect(res).toEqual({ success: true });
  });

  test('propagates errors from _verifyWithYSign', async () => {
    await fs.writeFile(path.join(sshDir, 'k.pub'), 'ssh-rsa AAAA c\n');
    await fs.writeFile(path.join(sshDir, 'k'), 'PRIVATE');
    jest.spyOn(SshAuth, 'supportsYSign').mockReturnValue(true);
    jest.spyOn(SshAuth, '_verifyWithYSign').mockResolvedValue({ success: false, error: 'private key rejected' });
    const res = await SshAuth.verify(path.join(sshDir, 'k.pub'), { namespace: 'custom' });
    expect(res).toEqual({ success: false, error: 'private key rejected' });
  });

  test('succeeds with legacy flow', async () => {
    await fs.writeFile(path.join(sshDir, 'k.pub'), 'ssh-rsa AAAA c\n');
    await fs.writeFile(path.join(sshDir, 'k'), 'PRIVATE');
    jest.spyOn(SshAuth, 'supportsYSign').mockReturnValue(false);
    const res = await SshAuth.verify(path.join(sshDir, 'k.pub'));
    expect(res.success).toBe(true);
  });

  test('cleans up temp work dir', async () => {
    await fs.writeFile(path.join(sshDir, 'k.pub'), 'ssh-rsa AAAA c\n');
    await fs.writeFile(path.join(sshDir, 'k'), 'PRIVATE');
    const workDir = path.join(os.tmpdir(), 'lo-auth-known-work');
    await fs.ensureDir(workDir);
    jest.spyOn(nodeFs, 'mkdtempSync').mockReturnValue(workDir);
    await SshAuth.verify(path.join(sshDir, 'k.pub'));
    expect(nodeFs.existsSync(workDir)).toBe(false);
  });
});

describe('SshAuth verifyMulti', () => {
  test('fails when no registered keys', async () => {
    const res = await SshAuth.verifyMulti([]);
    expect(res).toEqual({ success: false, error: '未注册任何公钥' });
  });

  test('fails when no local keys', async () => {
    jest.spyOn(SshAuth, 'listKeys').mockReturnValue([]);
    const res = await SshAuth.verifyMulti([{ publicKey: 'ssh-rsa AAAA', fingerprint: 'SHA256:x' }]);
    expect(res).toEqual({ success: false, error: '本地未找到 SSH 密钥' });
  });

  test('succeeds with Y sign and returns matched index', async () => {
    jest.spyOn(SshAuth, 'listKeys').mockReturnValue([
      { name: 'id', publicKeyPath: '/p/id.pub', privateKeyPath: '/p/id', fingerprint: 'SHA256:fp1', type: 'ssh-rsa', comment: 'c' }
    ]);
    const res = await SshAuth.verifyMulti([{ publicKey: 'ssh-rsa AAAA c', fingerprint: 'SHA256:fp1' }], { namespace: 'ns' });
    expect(res).toEqual({ success: true, matchedIndex: 0 });
  });

  test('succeeds with legacy sign', async () => {
    jest.spyOn(SshAuth, 'listKeys').mockReturnValue([{ name: 'id', privateKeyPath: '/p/id', fingerprint: 'SHA256:fp1' }]);
    jest.spyOn(SshAuth, 'supportsYSign').mockReturnValue(false);
    const res = await SshAuth.verifyMulti([{ publicKey: 'ssh-rsa AAAA', fingerprint: 'SHA256:fp1' }]);
    expect(res.success).toBe(true);
  });

  test('skips keys without fingerprint and fails', async () => {
    jest.spyOn(SshAuth, 'listKeys').mockReturnValue([{ name: 'id', privateKeyPath: '/p/id', fingerprint: 'SHA256:fp1' }]);
    const res = await SshAuth.verifyMulti([{ publicKey: 'ssh-rsa AAAA', fingerprint: '' }]);
    expect(res.success).toBe(false);
    expect(res.error).toContain('所有注册的公钥均无法通过');
  });

  test('fails when no local fingerprint matches', async () => {
    jest.spyOn(SshAuth, 'listKeys').mockReturnValue([{ name: 'id', privateKeyPath: '/p/id', fingerprint: 'SHA256:fp1' }]);
    const res = await SshAuth.verifyMulti([{ publicKey: 'ssh-rsa AAAA', fingerprint: 'SHA256:other' }]);
    expect(res.success).toBe(false);
    expect(res.error).toContain('所有注册的公钥均无法通过');
  });

  test('tries the next key when signing fails', async () => {
    jest.spyOn(SshAuth, 'listKeys').mockReturnValue([
      { name: 'a', privateKeyPath: '/p/a', fingerprint: 'SHA256:fpA' },
      { name: 'b', privateKeyPath: '/p/b', fingerprint: 'SHA256:fpB' }
    ]);
    cp.execFileSync.mockImplementation((cmd, args) => {
      if (args && args.includes('/p/a')) throw new Error('bad key');
      return Buffer.from('');
    });
    const res = await SshAuth.verifyMulti([
      { publicKey: 'ssh-rsa AAAA', fingerprint: 'SHA256:fpA' },
      { publicKey: 'ssh-rsa BBBB', fingerprint: 'SHA256:fpB' }
    ]);
    expect(res).toEqual({ success: true, matchedIndex: 1 });
  });

  test('cleans up temp work dir', async () => {
    jest.spyOn(SshAuth, 'listKeys').mockReturnValue([{ name: 'id', privateKeyPath: '/p/id', fingerprint: 'SHA256:fp1' }]);
    const workDir = path.join(os.tmpdir(), 'lo-auth-known-work2');
    await fs.ensureDir(workDir);
    jest.spyOn(nodeFs, 'mkdtempSync').mockReturnValue(workDir);
    await SshAuth.verifyMulti([{ publicKey: 'ssh-rsa AAAA', fingerprint: 'SHA256:fp1' }]);
    expect(nodeFs.existsSync(workDir)).toBe(false);
  });
});

describe('SshAuth _verifyWithYSign', () => {
  test('returns success on successful sign and verify', async () => {
    const res = await SshAuth._verifyWithYSign('/p/id', '/a/allowed', 'ns', '/w/challenge', 'nonce');
    expect(res).toEqual({ success: true });
  });

  test('maps permission denied to passphrase error', async () => {
    cp.execFileSync.mockImplementation(() => {
      const e = new Error('denied');
      e.stderr = Buffer.from('Permission denied');
      throw e;
    });
    const res = await SshAuth._verifyWithYSign('/p/id', '/a/allowed', 'ns', '/w/c', 'n');
    expect(res.error).toContain('私钥密码验证失败');
  });

  test('maps passphrase prompts to passphrase error', async () => {
    cp.execFileSync.mockImplementation(() => {
      const e = new Error('pw');
      e.stderr = Buffer.from('Enter passphrase for key');
      throw e;
    });
    const res = await SshAuth._verifyWithYSign('/p/id', '/a/allowed', 'ns', '/w/c', 'n');
    expect(res.error).toContain('私钥密码验证失败');
  });

  test('maps missing binary to unavailable error', async () => {
    cp.execFileSync.mockImplementation(() => {
      const e = new Error('nf');
      e.stderr = Buffer.from('No such file or directory');
      throw e;
    });
    const res = await SshAuth._verifyWithYSign('/p/id', '/a/allowed', 'ns', '/w/c', 'n');
    expect(res.error).toContain('ssh-keygen 不可用');
  });

  test('maps unknown option to upgrade error', async () => {
    cp.execFileSync.mockImplementation(() => {
      const e = new Error('uo');
      e.stderr = Buffer.from('unknown option -- Y');
      throw e;
    });
    const res = await SshAuth._verifyWithYSign('/p/id', '/a/allowed', 'ns', '/w/c', 'n');
    expect(res.error).toContain('不支持 -Y 签名');
  });

  test('returns raw message for other errors', async () => {
    cp.execFileSync.mockImplementation(() => {
      throw new Error('raw failure');
    });
    const res = await SshAuth._verifyWithYSign('/p/id', '/a/allowed', 'ns', '/w/c', 'n');
    expect(res).toEqual({ success: false, error: 'raw failure' });
  });
});

describe('SshAuth _verifyWithLegacy', () => {
  test('succeeds with direct legacy sign', async () => {
    const res = await SshAuth._verifyWithLegacy('/p/id', '/a/allowed', '/w/challenge', '/w');
    expect(res).toEqual({ success: true });
  });

  test('succeeds via agent fingerprint match', async () => {
    cp.execFileSync.mockImplementation(() => {
      throw new Error('no legacy sign');
    });
    cp.execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('ssh-add -l')) return '256 SHA256:fpX user@host (ED25519)\n';
      return Buffer.from('');
    });
    jest.spyOn(SshAuth, 'computeFingerprint').mockReturnValue('SHA256:fpX');
    const res = await SshAuth._verifyWithLegacy('/p/id', '/a/allowed', '/w/challenge', '/w');
    expect(res.success).toBe(true);
  });

  test('fails when agent not running', async () => {
    cp.execFileSync.mockImplementation(() => {
      throw new Error('no legacy sign');
    });
    cp.execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('ssh-add -l')) return 'Could not open a connection to your authentication agent.\n';
      return Buffer.from('');
    });
    const res = await SshAuth._verifyWithLegacy('/p/id', '/a/allowed', '/w/challenge', '/w');
    expect(res.success).toBe(false);
    expect(res.error).toContain('升级到 OpenSSH 8.1+');
  });

  test('fails when fingerprint not present in agent', async () => {
    cp.execFileSync.mockImplementation(() => {
      throw new Error('no legacy sign');
    });
    jest.spyOn(SshAuth, 'computeFingerprint').mockReturnValue('SHA256:local');
    const res = await SshAuth._verifyWithLegacy('/p/id', '/a/allowed', '/w/challenge', '/w');
    expect(res.success).toBe(false);
    expect(res.error).toContain('升级到 OpenSSH 8.1+');
  });

  test('catches computeFingerprint errors', async () => {
    cp.execFileSync.mockImplementation(() => {
      throw new Error('no legacy sign');
    });
    jest.spyOn(SshAuth, 'computeFingerprint').mockImplementation(() => {
      throw new Error('fpboom');
    });
    const res = await SshAuth._verifyWithLegacy('/p/id', '/a/allowed', '/w/challenge', '/w');
    expect(res.success).toBe(false);
    expect(res.error).toContain('降级认证失败');
  });
});

describe('SshAuth session cache', () => {
  test('isSessionValid false when cache file missing', () => {
    expect(SshAuth.isSessionValid('/repo')).toBe(false);
  });

  test('isSessionValid false for different repo', () => {
    nodeFs.writeFileSync(SESSION_CACHE_FILE, JSON.stringify({ repoPath: '/other', authenticatedAt: Date.now() }));
    expect(SshAuth.isSessionValid('/repo')).toBe(false);
  });

  test('isSessionValid false when expired and clears cache', () => {
    nodeFs.writeFileSync(SESSION_CACHE_FILE, JSON.stringify({ repoPath: path.resolve('/repo'), authenticatedAt: Date.now() - 20 * 60 * 1000 }));
    const spy = jest.spyOn(SshAuth, 'clearSessionCache');
    expect(SshAuth.isSessionValid('/repo')).toBe(false);
    expect(spy).toHaveBeenCalled();
  });

  test('isSessionValid true when fresh', () => {
    nodeFs.writeFileSync(SESSION_CACHE_FILE, JSON.stringify({ repoPath: path.resolve('/repo'), authenticatedAt: Date.now() }));
    expect(SshAuth.isSessionValid('/repo')).toBe(true);
  });

  test('isSessionValid false on corrupt json', () => {
    nodeFs.writeFileSync(SESSION_CACHE_FILE, '{ not json');
    expect(SshAuth.isSessionValid('/repo')).toBe(false);
  });

  test('setSessionCache writes cache file', () => {
    SshAuth.setSessionCache('/repo/path');
    const cache = JSON.parse(nodeFs.readFileSync(SESSION_CACHE_FILE, 'utf8'));
    expect(cache.repoPath).toBe(path.resolve('/repo/path'));
    expect(typeof cache.authenticatedAt).toBe('number');
    expect(typeof cache.hostname).toBe('string');
    expect(typeof cache.user).toBe('string');
  });

  test('setSessionCache swallows write errors', () => {
    jest.spyOn(nodeFs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => SshAuth.setSessionCache('/repo')).not.toThrow();
  });

  test('clearSessionCache removes file', () => {
    nodeFs.writeFileSync(SESSION_CACHE_FILE, '{}');
    SshAuth.clearSessionCache();
    expect(nodeFs.existsSync(SESSION_CACHE_FILE)).toBe(false);
  });

  test('clearSessionCache no-op when missing', () => {
    expect(() => SshAuth.clearSessionCache()).not.toThrow();
  });
});
