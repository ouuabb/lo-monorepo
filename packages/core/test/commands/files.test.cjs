/**
 * files 命令测试（新架构）
 *
 * files 命令列出 resources/ 目录下的文件，因此需要将测试文件放到 resources/ 子目录中。
 */

const path = require('path');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo, Repository } = require('./commandTestHelper.cjs');
const filesCommand = require('../../src/commands/files.cjs');

describe('files command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
    // 创建 resources/ 目录（files 命令需要）
    await fs.ensureDir(path.join(ctx.tempDir, 'resources'));
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('should list tracked files', async () => {
    // 在 resources/ 下创建文件并导入
    const testFile = path.join(ctx.tempDir, 'resources', 'test.md');
    await fs.writeFile(testFile, '# Test');
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await repo.importFile(testFile);
    await repo.close();

    // 验证不抛异常
    await expect(filesCommand({ _: ['lo'] })).resolves.toBeUndefined();
  });

  test('should handle empty resources directory', async () => {
    // resources/ 存在但为空
    await expect(filesCommand({ _: ['lo'] })).resolves.toBeUndefined();
  });
});
