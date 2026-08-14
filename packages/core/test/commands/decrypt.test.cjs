/**
 * decrypt 命令测试
 *
 * 测试 lo decrypt <rid> 单文件解密和 lo decrypt --all 全量解密
 */

const path = require('path');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo, Repository } = require('./commandTestHelper.cjs');
const CryptoUtils = require('../../src/utils/crypto.cjs');
const decryptCommand = require('../../src/commands/decrypt.cjs');

describe('decrypt command', () => {
  let ctx;

  describe('with crypto key', () => {
    beforeEach(async () => {
      ctx = await setupTempRepo({ withCrypto: true });
    });

    afterEach(async () => {
      await teardownTempRepo(ctx);
    });

    async function openRepo() {
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      return repo;
    }

    test('should decrypt an encrypted file', async () => {
      const repo = await openRepo();

      // 创建加密文件
      const testContent = '# Secret Note\n\nConfidential content.';
      const key = CryptoUtils.loadRepoKey(ctx.tempDir);
      const filePath = path.join(ctx.tempDir, 'resources', 'secret.md');
      await fs.ensureDir(path.dirname(filePath));
      CryptoUtils.writeEncryptedFile(filePath, Buffer.from(testContent, 'utf-8'), key);

      const resource = await repo.resourceService.create({
        type: 'note',
        path: filePath,
        name: 'secret'
      });
      await repo.close();

      expect(resource.encrypted).toBe(true);
      expect(CryptoUtils.isEncryptedFile(filePath)).toBe(true);

      // 执行解密命令
      await decryptCommand({ rid: resource.rid });

      // 验证文件已解密
      expect(CryptoUtils.isEncryptedFile(filePath)).toBe(false);

      // 内容应为明文
      const plaintext = await fs.readFile(filePath, 'utf-8');
      expect(plaintext).toBe(testContent);

      // 验证 DB 中 encrypted 标记
      const repo2 = await openRepo();
      const updated = await repo2.resourceService.getByRid(resource.rid);
      expect(updated.encrypted).toBe(false);
      await repo2.close();
    });

    test('should skip already plaintext file', async () => {
      const testContent = '# Plain Note';
      const filePath = path.join(ctx.tempDir, 'resources', 'plain.md');
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, testContent);

      const repo = await openRepo();
      const resource = await repo.resourceService.create({
        type: 'note', path: filePath, name: 'plain'
      });
      await repo.close();

      expect(resource.encrypted).toBe(false);

      // 对明文文件解密应该跳过
      await decryptCommand({ rid: resource.rid });

      // 文件仍然是明文
      expect(CryptoUtils.isEncryptedFile(filePath)).toBe(false);
    });

    test('should decrypt all encrypted files with --all', async () => {
      const repo = await openRepo();
      const key = CryptoUtils.loadRepoKey(ctx.tempDir);

      // 创建两个加密文件
      const fp1 = path.join(ctx.tempDir, 'resources', 'enc1.md');
      const fp2 = path.join(ctx.tempDir, 'resources', 'enc2.md');
      await fs.ensureDir(path.dirname(fp1));
      CryptoUtils.writeEncryptedFile(fp1, Buffer.from('# Enc 1'), key);
      CryptoUtils.writeEncryptedFile(fp2, Buffer.from('# Enc 2'), key);

      const r1 = await repo.resourceService.create({ type: 'note', path: fp1, name: 'enc1' });
      const r2 = await repo.resourceService.create({ type: 'note', path: fp2, name: 'enc2' });
      await repo.close();

      expect(r1.encrypted).toBe(true);
      expect(r2.encrypted).toBe(true);

      await decryptCommand({ all: true });

      expect(CryptoUtils.isEncryptedFile(fp1)).toBe(false);
      expect(CryptoUtils.isEncryptedFile(fp2)).toBe(false);
    });
  });

  describe('without crypto key', () => {
    beforeEach(async () => {
      ctx = await setupTempRepo({ withCrypto: false });
    });

    afterEach(async () => {
      await teardownTempRepo(ctx);
    });

    test('should exit with error when no crypto key', async () => {
      await decryptCommand({ rid: 'res_test' });
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
