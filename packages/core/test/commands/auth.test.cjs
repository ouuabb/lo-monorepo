const fs = require('fs-extra');
const path = require('path');
const { setupTempRepo, teardownTempRepo, Repository } = require('./commandTestHelper.cjs');
const CryptoUtils = require('../../src/utils/crypto.cjs');

jest.mock('../../src/utils/sshAuth.cjs', () => {
  let sessionValid = false;
  return {
    _setSessionValid(v) { sessionValid = v; },
    isAvailable: jest.fn(() => true),
    getVersion: jest.fn(() => '1.2.0'),
    supportsYSign: jest.fn(() => true),
    isAgentRunning: jest.fn(() => false),
    isSessionValid: jest.fn(() => sessionValid),
    setSessionCache: jest.fn(() => { sessionValid = true; }),
    clearSessionCache: jest.fn(() => { sessionValid = false; }),
    listKeys: jest.fn(() => []),
    validateKeypair: jest.fn(() => ({ valid: true })),
    computeFingerprint: jest.fn(() => 'fp-abc'),
    getPublicKey: jest.fn(() => ({ raw: 'ssh-ed25519 AAAATEST', type: 'ed25519' }))
  };
});

jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));

const inquirer = require('inquirer');
const SshAuth = require('../../src/utils/sshAuth.cjs');
const auth = require('../../src/commands/auth.cjs');

describe('auth command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
    jest.clearAllMocks();
    SshAuth.isAvailable.mockReturnValue(true);
    SshAuth.getVersion.mockReturnValue('1.2.0');
    SshAuth.supportsYSign.mockReturnValue(true);
    SshAuth.isAgentRunning.mockReturnValue(false);
    SshAuth.listKeys.mockReturnValue([]);
    SshAuth.validateKeypair.mockReturnValue({ valid: true });
    SshAuth.computeFingerprint.mockReturnValue('fp-abc');
    SshAuth.getPublicKey.mockReturnValue({ raw: 'ssh-ed25519 AAAATEST', type: 'ed25519' });
    inquirer.prompt.mockReset();
    jest.spyOn(Repository.prototype, 'ensureAuthenticated').mockResolvedValue(true);
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  async function makePubKey(name = 'id_test.pub') {
    const keyPath = path.join(ctx.tempDir, '.ssh', name);
    await fs.ensureDir(path.dirname(keyPath));
    await fs.writeFile(keyPath, 'ssh-ed25519 AAAATEST comment');
    return keyPath;
  }

  test('should error and exit 1 for unknown action', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await auth({ _: ['lo', 'auth'], action: 'bogus' });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  test('should error and exit 1 when ssh-keygen is unavailable', async () => {
    SshAuth.isAvailable.mockReturnValue(false);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await auth({ _: ['lo', 'auth'], action: 'add', keyPath: '/tmp/x.pub' });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  describe('add', () => {
    test('should register a key by path and exit 0', async () => {
      const keyPath = await makePubKey();
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'add', keyPath, label: '我的电脑' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      expect(await repo.getConfig('auth.ssh.enabled')).toBe(true);
      const keys = JSON.parse(await repo.getConfig('auth.ssh.keys'));
      expect(keys).toHaveLength(1);
      expect(keys[0].label).toBe('我的电脑');
      await repo.close();
      logSpy.mockRestore();
    });

    test('should support the enable alias', async () => {
      const keyPath = await makePubKey();
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'enable', keyPath });

      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should error and exit 1 for a private key path', async () => {
      const keyPath = await makePubKey('id_test');
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'add', keyPath });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should error and exit 1 when the key file does not exist', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'add', keyPath: path.join(ctx.tempDir, 'nope.pub') });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should error and exit 1 when the keypair is invalid', async () => {
      const keyPath = await makePubKey();
      SshAuth.validateKeypair.mockReturnValue({ valid: false, error: 'bad key' });
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'add', keyPath });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should error and exit 1 when fingerprint computation fails', async () => {
      const keyPath = await makePubKey();
      SshAuth.computeFingerprint.mockImplementation(() => { throw new Error('bad'); });
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'add', keyPath });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should warn and skip when the key is already registered', async () => {
      const keyPath = await makePubKey();
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      await repo.setConfig('auth.ssh.keys', JSON.stringify([{ fingerprint: 'fp-abc', label: 'old' }]));
      await repo.close();
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'add', keyPath });

      expect(process.exit).toHaveBeenCalledWith(0);
      const repo2 = new Repository(ctx.tempDir);
      await repo2.open({ skipAuth: true });
      const keys = JSON.parse(await repo2.getConfig('auth.ssh.keys'));
      expect(keys).toHaveLength(1);
      await repo2.close();
      logSpy.mockRestore();
    });

    test('should error and exit 1 when no local keys exist', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'add' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should pick a key interactively when no keyPath is given', async () => {
      SshAuth.listKeys.mockReturnValue([
        { name: 'id_ed25519', publicKeyPath: '/tmp/id_ed25519.pub', fingerprint: 'fp-1', type: 'ed25519', comment: 'me', inAgent: true }
      ]);
      SshAuth.getPublicKey.mockReturnValue({ raw: 'pub', type: 'ed25519' });
      inquirer.prompt.mockResolvedValue({ keyIndex: 0, keyLabel: '工作机' });
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'add' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      const keys = JSON.parse(await repo.getConfig('auth.ssh.keys'));
      expect(keys[0].label).toBe('工作机');
      await repo.close();
      logSpy.mockRestore();
    });

    test('should warn when all local keys are already registered', async () => {
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      await repo.setConfig('auth.ssh.keys', JSON.stringify([{ fingerprint: 'fp-1', label: 'old' }]));
      await repo.close();
      SshAuth.listKeys.mockReturnValue([
        { name: 'id_ed25519', publicKeyPath: '/tmp/id_ed25519.pub', fingerprint: 'fp-1', type: 'ed25519', comment: 'me', inAgent: false }
      ]);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'add' });

      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should protect the crypto key when encryption is enabled', async () => {
      const keyPath = await makePubKey();
      jest.spyOn(CryptoUtils, 'isEncryptionEnabled').mockReturnValue(true);
      jest.spyOn(Repository.prototype, 'protectCryptoKey').mockResolvedValue({ success: true });
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'add', keyPath });

      expect(process.exit).toHaveBeenCalledWith(0);
      expect(Repository.prototype.protectCryptoKey).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    test('should warn when crypto key protection fails', async () => {
      const keyPath = await makePubKey();
      jest.spyOn(CryptoUtils, 'isEncryptionEnabled').mockReturnValue(true);
      jest.spyOn(Repository.prototype, 'protectCryptoKey').mockResolvedValue({ success: false, error: 'boom' });
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'add', keyPath });

      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });
  });

  describe('remove', () => {
    async function seedKeys(keys) {
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      await repo.setConfig('auth.ssh.enabled', 'true');
      await repo.setConfig('auth.ssh.keys', JSON.stringify(keys));
      await repo.close();
    }

    test('should warn when auth is not enabled', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'remove', fingerprint: 'fp-1' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should remove a key by fingerprint', async () => {
      await seedKeys([{ fingerprint: 'fp-1', label: 'A', keyType: 'ed25519' }, { fingerprint: 'fp-2', label: 'B', keyType: 'ed25519' }]);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'remove', fingerprint: 'fp-1' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      const keys = JSON.parse(await repo.getConfig('auth.ssh.keys'));
      expect(keys).toHaveLength(1);
      expect(keys[0].fingerprint).toBe('fp-2');
      await repo.close();
      logSpy.mockRestore();
    });

    test('should error when the fingerprint is not found', async () => {
      await seedKeys([{ fingerprint: 'fp-1', label: 'A', keyType: 'ed25519' }]);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'remove', fingerprint: 'fp-zzz' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should remove a key interactively when no fingerprint given', async () => {
      await seedKeys([{ fingerprint: 'fp-1', label: 'A', keyType: 'ed25519' }, { fingerprint: 'fp-2', label: 'B', keyType: 'ed25519' }]);
      inquirer.prompt.mockResolvedValue({ keyIndex: 1 });
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'remove' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      const keys = JSON.parse(await repo.getConfig('auth.ssh.keys'));
      expect(keys.map(k => k.fingerprint)).toEqual(['fp-1']);
      await repo.close();
      logSpy.mockRestore();
    });

    test('should warn when there are no registered keys for interactive removal', async () => {
      await seedKeys([]);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'remove' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should disable auth when all keys are removed', async () => {
      await seedKeys([{ fingerprint: 'fp-1', label: 'A', keyType: 'ed25519' }]);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'remove', fingerprint: 'fp-1' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      expect(await repo.getConfig('auth.ssh.enabled')).toBeUndefined();
      await repo.close();
      logSpy.mockRestore();
    });

    test('should clean up protected crypto keys when encryption is enabled', async () => {
      await seedKeys([{ fingerprint: 'fp-1', label: 'A', keyType: 'ed25519' }]);
      jest.spyOn(CryptoUtils, 'isEncryptionEnabled').mockReturnValue(true);
      jest.spyOn(Repository.prototype, 'removeProtectedCryptoKey').mockResolvedValue();
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'remove', fingerprint: 'fp-1' });

      expect(Repository.prototype.removeProtectedCryptoKey).toHaveBeenCalledWith('fp-1');
      logSpy.mockRestore();
    });
  });

  describe('list', () => {
    test('should warn when auth is not enabled', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'list' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should warn when no keys registered', async () => {
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      await repo.setConfig('auth.ssh.enabled', 'true');
      await repo.close();
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'list' });

      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should list registered keys', async () => {
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      await repo.setConfig('auth.ssh.enabled', 'true');
      await repo.setConfig('auth.ssh.keys', JSON.stringify([{ label: 'A', keyType: 'ed25519', fingerprint: 'fp-1' }]));
      await repo.close();
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'list' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('A');
      logSpy.mockRestore();
    });
  });

  describe('disable', () => {
    test('should warn when auth is not enabled', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'disable' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should disable auth after successful verification', async () => {
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      await repo.setConfig('auth.ssh.enabled', 'true');
      await repo.close();
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'disable' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const repo2 = new Repository(ctx.tempDir);
      await repo2.open({ skipAuth: true });
      expect(await repo2.getConfig('auth.ssh.enabled')).toBeUndefined();
      await repo2.close();
      logSpy.mockRestore();
    });

    test('should error and exit 1 when verification fails', async () => {
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      await repo.setConfig('auth.ssh.enabled', 'true');
      await repo.setConfig('auth.ssh.keys', JSON.stringify([{ fingerprint: 'fp-1', label: 'A' }]));
      await repo.close();
      jest.spyOn(Repository.prototype, 'ensureAuthenticated').mockResolvedValue(false);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'disable' });

      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });
  });

  describe('status', () => {
    test('should print status when auth is disabled', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'status' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should print status with session info when auth is enabled', async () => {
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      await repo.setConfig('auth.ssh.enabled', 'true');
      await repo.setConfig('auth.ssh.keys', JSON.stringify([{ label: 'A', keyType: 'ed25519', fingerprint: 'fp-1' }]));
      await repo.close();
      SshAuth._setSessionValid(true);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'status' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('已认证');
      logSpy.mockRestore();
    });
  });

  describe('verify', () => {
    test('should warn when auth is not enabled', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'verify' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should verify successfully when authenticated', async () => {
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      await repo.setConfig('auth.ssh.enabled', 'true');
      await repo.close();
      jest.spyOn(Repository.prototype, 'ensureAuthenticated').mockResolvedValue(true);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'verify' });

      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should error and exit 1 when verification fails', async () => {
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      await repo.setConfig('auth.ssh.enabled', 'true');
      await repo.close();
      jest.spyOn(Repository.prototype, 'ensureAuthenticated').mockResolvedValue(false);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'verify' });

      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });
  });

  describe('keys', () => {
    test('should error and exit 1 when ssh-keygen is unavailable', async () => {
      SshAuth.isAvailable.mockReturnValue(false);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'keys' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should warn when no local keys found', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await auth({ _: ['lo', 'auth'], action: 'keys' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should list local keys', async () => {
      SshAuth.listKeys.mockReturnValue([
        { name: 'id_ed25519', publicKeyPath: '/tmp/id_ed25519.pub', type: 'ed25519', fingerprint: 'fp-1', comment: 'me', inAgent: true }
      ]);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await auth({ _: ['lo', 'auth'], action: 'keys' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('id_ed25519');
      logSpy.mockRestore();
    });
  });
});
