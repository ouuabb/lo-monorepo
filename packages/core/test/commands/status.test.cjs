/**
 * status 命令测试（新架构）
 *
 * status 命令显示仓库状态，新架构下无参数或通过 argv.path 指定路径。
 */

const path = require('path');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const statusCommand = require('../../src/commands/status.cjs');

describe('status command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('should show empty status for new repo', async () => {
    // 空仓库应该输出状态不报错
    await expect(statusCommand({ _: ['lo'] })).resolves.toBeUndefined();
  });

  test('should show status with changes', async () => {
    // 创建文件后查看状态
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await repo.importFile(path.join(ctx.tempDir, 'test.md'));
    await repo.close();

    await expect(statusCommand({ _: ['lo'] })).resolves.toBeUndefined();
  });
});
