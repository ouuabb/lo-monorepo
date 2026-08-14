/**
 * encrypt 命令测试
 *
 * 测试 lo encrypt <rid> 单文件加密和 lo encrypt --all 全量加密
 */

const path = require('path');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo, Repository } = require('./commandTestHelper.cjs');
const CryptoUtils = require('../../src/utils/crypto.cjs');
const encryptCommand = require('../../src/commands/encrypt.cjs');

describe('encrypt command', () => {
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

    test('should encrypt a plaintext file', async () => {
      // 创建明文文件
      const testContent = '# Test Note\n\nSome content here.';
      const filePath = path.join(ctx.tempDir, 'resources', 'test-note.md');
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, testContent);

      // 入库（明文）
      const repo = await openRepo();
      const resource = await repo.resourceService.create({
        type: 'note',
        path: filePath,
        name: 'test-note'
      });
      await repo.close();

      // 验证文件是明文
      expect(resource.encrypted).toBe(false);
      expect(CryptoUtils.isEncryptedFile(filePath)).toBe(false);

      // 执行加密命令
      await encryptCommand({ rid: resource.rid });

      // 验证文件已加密
      expect(CryptoUtils.isEncryptedFile(filePath)).toBe(true);

      // 验证 DB 中 encrypted 标记
      const repo2 = await openRepo();
      const updated = await repo2.resourceService.getByRid(resource.rid);
      expect(updated.encrypted).toBe(true);
      await repo2.close();
    });

    test('should skip already encrypted file', async () => {
      const repo = await openRepo();

      // 创建加密文件
      const testContent = '# Encrypted Note';
      const key = CryptoUtils.loadRepoKey(ctx.tempDir);
      const filePath = path.join(ctx.tempDir, 'resources', 'encrypted-note.md');
      await fs.ensureDir(path.dirname(filePath));
      CryptoUtils.writeEncryptedFile(filePath, Buffer.from(testContent, 'utf-8'), key);

      const resource = await repo.resourceService.create({
        type: 'note',
        path: filePath,
        name: 'encrypted-note'
      });
      await repo.close();

      expect(resource.encrypted).toBe(true);

      // 再次加密应该跳过
      await encryptCommand({ rid: resource.rid });

      // 文件仍然是加密的
      expect(CryptoUtils.isEncryptedFile(filePath)).toBe(true);
    });

    test('should encrypt all plaintext files with --all', async () => {
      const repo = await openRepo();

      // 创建两个明文文件
      const fp1 = path.join(ctx.tempDir, 'resources', 'note1.md');
      const fp2 = path.join(ctx.tempDir, 'resources', 'note2.md');
      await fs.ensureDir(path.dirname(fp1));
      await fs.writeFile(fp1, '# Note 1');
      await fs.writeFile(fp2, '# Note 2');

      const r1 = await repo.resourceService.create({ type: 'note', path: fp1, name: 'note1' });
      const r2 = await repo.resourceService.create({ type: 'note', path: fp2, name: 'note2' });
      await repo.close();

      expect(r1.encrypted).toBe(false);
      expect(r2.encrypted).toBe(false);

      await encryptCommand({ all: true });

      expect(CryptoUtils.isEncryptedFile(fp1)).toBe(true);
      expect(CryptoUtils.isEncryptedFile(fp2)).toBe(true);
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
      const filePath = path.join(ctx.tempDir, 'resources', 'note.md');
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, '# Note');

      await encryptCommand({ rid: 'res_test' });
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
