/**
 * add 命令测试（新架构）
 *
 * add 命令使用 yargs argv，内部隐式依赖 process.cwd()。
 * 测试通过 setupTempRepo 切换到临时仓库目录后调用命令，
 * 验证 staging area 中的文件是否正确添加。
 */

const path = require('path');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const addCommand = require('../../src/commands/add.cjs');

describe('add command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('should add a single file to staging', async () => {
    // 在临时仓库中创建测试文件
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test\n\nContent');

    // 新架构: add(argv), argv 中使用 _ 数组指定文件
    await addCommand({ _: ['lo', 'test.md'] });

    // 验证: 重新打开仓库检查 staging
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    const status = await repo.staging.getStatus();
    await repo.close();

    expect(status.added).toContain('test.md');
  });

  test('should add a file by path option', async () => {
    await createTestFile(path.join(ctx.tempDir, 'file1.md'), '# File 1');
    await createTestFile(path.join(ctx.tempDir, 'file2.md'), '# File 2');

    // argv.path 指定单个文件
    await addCommand({ _: ['lo'], path: 'file1.md' });

    const repo = new Repository(ctx.tempDir);
    await repo.init();
    const status = await repo.staging.getStatus();
    await repo.close();

    expect(status.added).toContain('file1.md');
  });

  test('should add all files when no path specified', async () => {
    await createTestFile(path.join(ctx.tempDir, 'file1.md'), '# File 1');
    await createTestFile(path.join(ctx.tempDir, 'file2.md'), '# File 2');

    // 不指定文件路径 → 添加所有
    await addCommand({ _: ['lo'] });

    const repo = new Repository(ctx.tempDir);
    await repo.init();
    const status = await repo.staging.getStatus();
    await repo.close();

    expect(status.added.length).toBeGreaterThanOrEqual(2);
  });
});
