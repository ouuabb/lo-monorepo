/**
 * reset 命令测试（新架构）
 *
 * reset 命令取消暂存，新架构下通过 argv._[1] 获取文件路径。
 */

const path = require('path');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const resetCommand = require('../../src/commands/reset.cjs');
const addCommand = require('../../src/commands/add.cjs');

describe('reset command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('should unstage a file', async () => {
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    await addCommand({ _: ['lo', 'test.md'] });

    // 重置暂存
    await expect(resetCommand({ _: ['lo', 'test.md'] })).resolves.toBeUndefined();

    // 验证暂存区已清空
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    const status = await repo.staging.getStatus();
    await repo.close();

    expect(status.added).not.toContain('test.md');
  });

  test('should unstage all files', async () => {
    await createTestFile(path.join(ctx.tempDir, 'file1.md'), '# File 1');
    await createTestFile(path.join(ctx.tempDir, 'file2.md'), '# File 2');
    await addCommand({ _: ['lo'] });

    // 不指定文件 → 重置全部
    await expect(resetCommand({ _: ['lo'] })).resolves.toBeUndefined();

    const repo = new Repository(ctx.tempDir);
    await repo.init();
    const status = await repo.staging.getStatus();
    await repo.close();

    expect(status.added.length).toBe(0);
  });
});
