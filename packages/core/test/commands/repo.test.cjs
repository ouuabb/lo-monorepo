/**
 * lo repo reinitialize 命令测试（D2：副本独立化唯一途径）
 */
const fs = require('fs-extra');
const path = require('path');
const { setupTempRepo, teardownTempRepo } = require('./commandTestHelper.cjs');
const Repository = require('../../src/repo/repository.cjs');
const { readMetadata } = require('../../src/repo/repositoryMetadata.cjs');
const { repoReinitialize } = require('../../src/commands/repo.cjs');

describe('lo repo reinitialize', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
    // 创建资源以验证数据不变
    const repo = new Repository(ctx.tempDir);
    await repo.open({ skipAuth: true });
    await repo.createResource('note', '# A', { filename: 'reinit.md' });
    await repo.close();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('--yes 直接执行：新 Identity + lineage.origin + 资源数据不变', async () => {
    const before = await readMetadata(ctx.tempDir);
    const oldId = before.repositoryId;
    const ridFile = path.join(ctx.tempDir, 'resources', 'reinit.md');
    const contentBefore = await fs.readFile(ridFile, 'utf8');

    await repoReinitialize({ yes: true });

    const after = await readMetadata(ctx.tempDir);
    expect(after.repositoryId).not.toBe(oldId);
    expect(after.lineage.origin).toBe(oldId);

    // Resource rid / location / 文件内容 / DB 数据保持不变
    const repo = new Repository(ctx.tempDir);
    await repo.open({ skipAuth: true });
    const resources = await repo.resourceService.getAll();
    const res = resources.find((r) => r.rid !== '__system__');
    expect(res.location_kind).toBe('local');
    expect(res.location).toBe(path.join('resources', 'reinit.md'));
    await repo.close();
    expect(await fs.readFile(ridFile, 'utf8')).toBe(contentBefore);
  });

  test('无 --yes 且输入 n：取消，Identity 不变', async () => {
    const before = await readMetadata(ctx.tempDir);
    jest
      .spyOn(require('readline'), 'createInterface')
      .mockImplementation(() => ({
        question: (_prompt, cb) => cb('n'),
        close: jest.fn(),
      }));

    await repoReinitialize({ yes: false });

    jest.restoreAllMocks();
    const after = await readMetadata(ctx.tempDir);
    expect(after.repositoryId).toBe(before.repositoryId);
    expect(after.lineage.origin).toBeNull();
  });
});
