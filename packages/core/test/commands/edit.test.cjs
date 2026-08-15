const path = require('path');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const CryptoUtils = require('../../src/utils/crypto.cjs');

jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const { exec } = require('child_process');
const edit = require('../../src/commands/edit.cjs');

describe('edit command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
    // teardown 的 restoreAllMocks 会恢复 process.exit；此处重新 mock，
    // 防止 edit.cjs 编辑器关闭回调的迟到 process.exit(0) 真退出 jest worker
    jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  async function createResource(name = 'edit.md', content = '# Editable') {
    const filePath = path.join(ctx.tempDir, name);
    await createTestFile(filePath, content);
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resource = await repo.importFile(filePath);
    await repo.close();
    return resource;
  }

  async function waitForExit(expectedCode, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const calls = process.exit.mock.calls;
      if (calls.length > 0) {
        expect(calls[calls.length - 1][0]).toBe(expectedCode);
        return;
      }
      await new Promise(r => setTimeout(r, 10));
    }
    throw new Error(`process.exit(${expectedCode}) was not called within ${timeoutMs}ms`);
  }

  test('should report error and exit 1 for missing resource', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await edit({ _: ['lo', 'edit'], rid: 'res_missing' });
    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  test('should open a plaintext resource in the editor', async () => {
    const resource = await createResource();
    exec.mockImplementation((cmd, cb) => cb(null));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await edit({ _: ['lo', 'edit'], rid: resource.rid });

    await waitForExit(0);
    expect(exec).toHaveBeenCalled();
    const cmd = exec.mock.calls[0][0];
    expect(cmd).toContain(path.join(ctx.tempDir, resource.location));
    logSpy.mockRestore();
  });

  test('should honor the editor argument', async () => {
    const resource = await createResource();
    exec.mockImplementation((cmd, cb) => cb(null));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await edit({ _: ['lo', 'edit'], rid: resource.rid, editor: 'code' });

    expect(exec.mock.calls[0][0]).toContain('code');
    logSpy.mockRestore();
  });

  test('should exit 1 when the editor fails', async () => {
    const resource = await createResource();
    exec.mockImplementation((cmd, cb) => cb(new Error('editor crashed')));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await edit({ _: ['lo', 'edit'], rid: resource.rid });

    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  test('should report failure and exit 1 when setup throws', async () => {
    const resource = await createResource();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(Repository.prototype, 'resolveResource').mockRejectedValueOnce(new Error('db down'));

    await edit({ _: ['lo', 'edit'], rid: resource.rid });

    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  describe('encrypted resources', () => {
    test('should decrypt, edit and re-encrypt an encrypted resource', async () => {
      await teardownTempRepo(ctx);
      ctx = await setupTempRepo({ withCrypto: true });

      const filePath = path.join(ctx.tempDir, 'secret.md');
      await createTestFile(filePath, '# Secret');
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      const resource = await repo.importFile(filePath);
      const key = repo.cryptoKey;
      const resourceAbs = path.join(ctx.tempDir, resource.location);
      await CryptoUtils.writeEncryptedFile(resourceAbs, Buffer.from('# Secret'), key);
      await repo.close();

      const fresh = new Repository(ctx.tempDir);
      await fresh.open({ skipAuth: true });
      const raw = await require('fs-extra').readFile(resourceAbs);
      expect(raw.subarray(0, 4).equals(CryptoUtils.MAGIC)).toBe(true);
      await fresh.close();

      exec.mockImplementation((cmd, cb) => cb(null));
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await edit({ _: ['lo', 'edit'], rid: resource.rid });

      await waitForExit(0);
      const after = await require('fs-extra').readFile(resourceAbs);
      expect(after.subarray(0, 4).equals(CryptoUtils.MAGIC)).toBe(true);
      logSpy.mockRestore();
    });

    test('should exit 1 when an encrypted file has no crypto key', async () => {
      await teardownTempRepo(ctx);
      ctx = await setupTempRepo();

      const filePath = path.join(ctx.tempDir, 'fake.md');
      await createTestFile(filePath, '# Plain');
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      const resource = await repo.importFile(filePath);
      const fakeKey = Buffer.alloc(32, 7);
      await CryptoUtils.writeEncryptedFile(
        path.join(ctx.tempDir, resource.location),
        Buffer.from('# Secret'),
        fakeKey,
      );
      await repo.close();

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await edit({ _: ['lo', 'edit'], rid: resource.rid });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });
  });
});
