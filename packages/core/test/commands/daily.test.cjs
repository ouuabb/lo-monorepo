/**
 * daily 命令测试
 *
 * daily 命令创建当日日记 resources/<today>-daily.md，必须是幂等的：
 * 当日已存在（DB 记录或磁盘文件）时不得重复创建、不得覆盖已有内容。
 */

const path = require('path');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const DateUtils = require('../../src/utils/date.cjs');
const dailyCommand = require('../../src/commands/daily.cjs');

describe('daily command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  function todayDailyPath() {
    const filename = `${DateUtils.today()}-daily.md`;
    return path.join(ctx.tempDir, 'resources', filename);
  }

  async function countByPath(targetPath) {
    const repo = new Repository(ctx.tempDir);
    await repo.open({ skipAuth: true });
    const all = await repo.getAllResources();
    await repo.close();
    return all.filter(r => r.path === targetPath).length;
  }

  test('首次执行创建当日日记（DB 记录 + 磁盘文件）', async () => {
    await dailyCommand({ _: ['lo'] });

    const dailyPath = todayDailyPath();
    expect(await fs.pathExists(dailyPath)).toBe(true);
    expect(await countByPath(dailyPath)).toBe(1);

    const repo = new Repository(ctx.tempDir);
    await repo.open({ skipAuth: true });
    const resource = await repo.resourceService.getByPath(dailyPath);
    const byRid = await repo.resourceService.getByRid(resource.rid);
    await repo.close();

    expect(resource).not.toBeNull();
    expect(resource.type).toBe('note');
    expect(resource.path).toBe(dailyPath);
    expect(byRid.metadata.category).toBe('日记');
    expect(byRid.tags).toContain('daily');
  });

  test('当日重复执行不覆盖文件、不重复登记', async () => {
    await dailyCommand({ _: ['lo'] });

    const dailyPath = todayDailyPath();
    // 模拟用户已写入内容
    await fs.writeFile(dailyPath, '# 今日日记\n\n我已经写了内容，不能被覆盖\n');

    await dailyCommand({ _: ['lo'] });

    // 磁盘内容保持不变
    const content = await fs.readFile(dailyPath, 'utf-8');
    expect(content).toContain('我已经写了内容，不能被覆盖');
    // 模板内容没有被重新写入
    expect(content).not.toContain('今日完成');

    // DB 仍然只有一条记录指向该路径
    expect(await countByPath(dailyPath)).toBe(1);
  });

  test('磁盘文件存在但未登记时，不覆盖并保持未登记状态', async () => {
    const dailyPath = todayDailyPath();
    await fs.ensureDir(path.dirname(dailyPath));
    await createTestFile(dailyPath, '# 手动创建的日记\n');

    await dailyCommand({ _: ['lo'] });

    const content = await fs.readFile(dailyPath, 'utf-8');
    expect(content).toBe('# 手动创建的日记\n');
    expect(await countByPath(dailyPath)).toBe(0);
  });
});
