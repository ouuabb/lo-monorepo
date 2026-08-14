/**
 * tag 命令测试（新架构）
 *
 * tag 命令通过 staging stageMetadata 暂存标签变更，需 lo commit 后标签才写入 resource_tags 表。
 * 支持操作: add（添加标签）、rm（删除标签）、list（列出资源标签，需 rid）。
 */

const path = require('path');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const tagCommand = require('../../src/commands/tag.cjs');

describe('tag command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('should stage tag addition', async () => {
    // 创建资源
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Note');
    const resource = await repo.importFile(path.join(ctx.tempDir, 'test.md'));
    await repo.close();

    // 添加标签（暂存）
    await tagCommand({ _: ['lo'], action: 'add', rid: resource.rid, tag: 'important' });

    // 验证标签暂存到 staging metadata
    const repo2 = new Repository(ctx.tempDir);
    await repo2.init();
    const status = await repo2.staging.getStatus();
    await repo2.close();

    const stagedMeta = status.metadata.find(m => m.rid === resource.rid);
    expect(stagedMeta).toBeDefined();
    expect(stagedMeta.tags).toContain('important');
  });

  test('should stage tag removal', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Note');
    const resource = await repo.importFile(path.join(ctx.tempDir, 'test.md'));
    // 先暂存添加两个标签
    await repo.staging.stageMetadata(resource.rid, { tags: ['keep', 'remove'] });
    await repo.close();

    // 删除标签（操作名是 'rm'）
    await tagCommand({ _: ['lo'], action: 'rm', rid: resource.rid, tag: 'remove' });

    // 验证标签从暂存中移除
    const repo2 = new Repository(ctx.tempDir);
    await repo2.init();
    const status = await repo2.staging.getStatus();
    await repo2.close();

    const stagedMeta = status.metadata.find(m => m.rid === resource.rid);
    expect(stagedMeta).toBeDefined();
    expect(stagedMeta.tags).toContain('keep');
    expect(stagedMeta.tags).not.toContain('remove');
  });

  test('should list tags for a resource', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.init();
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Note');
    const resource = await repo.importFile(path.join(ctx.tempDir, 'test.md'));
    await repo.resourceService.update(resource.rid, { metadata: { tags: ['tag1', 'tag2'] } });
    await repo.close();

    // list 需要 rid
    await expect(tagCommand({
      _: ['lo'],
      action: 'list',
      rid: resource.rid
    })).resolves.toBeUndefined();
  });
});
