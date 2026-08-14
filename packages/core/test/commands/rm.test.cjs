/**
 * rm 命令测试（新架构）
 *
 * rm 命令将文件暂存为删除状态（staging.remove），不直接删除数据库记录。
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const rmCommand = require('../../src/commands/rm.cjs');

describe('rm command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('should stage a file for removal', async () => {
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await repo.importFile(path.join(ctx.tempDir, 'test.md'));
    await repo.close();

    // rm 命令暂存删除
    await expect(rmCommand({ _: ['lo', 'test.md'] })).resolves.toBeUndefined();

    // 验证暂存区有删除记录
    const repo2 = new Repository(ctx.tempDir);
    await repo2.init();
    const status = await repo2.staging.getStatus();
    await repo2.close();

    expect(status.deleted).toContain('test.md');
  });

  test('should print usage when no target path given', async () => {
    await expect(rmCommand({ _: ['lo'] })).resolves.toBeUndefined();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('should stage removal using argv.path', async () => {
    await createTestFile(path.join(ctx.tempDir, 'viapath.md'), '# Via Path');
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await repo.importFile(path.join(ctx.tempDir, 'viapath.md'));
    await repo.close();

    await expect(rmCommand({
      _: ['lo'],
      path: path.join(ctx.tempDir, 'viapath.md')
    })).resolves.toBeUndefined();

    const repo2 = new Repository(ctx.tempDir);
    await repo2.init();
    const status = await repo2.staging.getStatus();
    await repo2.close();

    expect(status.deleted).toContain('viapath.md');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('should reject absolute path outside repository', async () => {
    const outside = path.join(os.tmpdir(), `lo-rm-outside-${Date.now()}.md`);
    await fs.writeFile(outside, 'x');

    await expect(rmCommand({ _: ['lo', outside] })).resolves.toBeUndefined();
    expect(process.exit).toHaveBeenCalledWith(0);

    await fs.remove(outside);
  });

  test('should reject relative path outside repository', async () => {
    await expect(rmCommand({ _: ['lo', '../outside.md'] })).resolves.toBeUndefined();
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
