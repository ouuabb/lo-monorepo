const fs = require('fs-extra');
const path = require('path');
const Repository = require('../../src/repo/repository.cjs');

describe('syncMarkdownRelations', () => {
  let tempDir;
  let repo;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });
  });

  afterEach(async () => {
    if (repo) await repo.close();
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('should create embed relation for markdown image in same directory', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'photo.png'), 'fake-image-data');

    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'photo.png'));
    expect(imgResource).not.toBeNull();

    const mdContent = '# Test\n\n![photo](photo.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));
    expect(mdResource).not.toBeNull();

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(1);
    expect(embeds[0].to_rid).toBe(imgResource.rid);
    expect(embeds[0].metadata.origin).toBe('markdown_parser');
    expect(embeds[0].metadata.alt).toBe('photo');
  });

  test('should create embed relation for image in subdirectory', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes', 'assets'));
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'assets', 'photo.png'), 'fake-image-data');

    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'assets', 'photo.png'));

    const mdContent = '# Test\n\n![photo](assets/photo.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(1);
    expect(embeds[0].to_rid).toBe(imgResource.rid);
  });

  test('should create embed relation for image with relative path ../', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'assets'));
    await fs.writeFile(path.join(tempDir, 'resources', 'assets', 'photo.png'), 'fake-image-data');

    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'assets', 'photo.png'));

    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    const mdContent = '# Test\n\n![photo](../assets/photo.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(1);
    expect(embeds[0].to_rid).toBe(imgResource.rid);
  });

  test('should count broken references when image file does not exist', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    const mdContent = '# Test\n\n![missing](nonexistent.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(0);

    const result = await repo.syncMarkdownRelations(mdResource.rid);
    expect(result.broken).toBeGreaterThanOrEqual(1);
  });

  test('should handle multiple image references in one markdown', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'a.png'), 'fake-a');
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'b.png'), 'fake-b');

    const imgA = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'a.png'));
    const imgB = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'b.png'));

    const mdContent = '# Test\n\n![A](a.png)\n\n![B](b.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(2);
    const targetRids = embeds.map(e => e.to_rid).sort();
    expect(targetRids).toEqual([imgA.rid, imgB.rid].sort());
  });

  test('should exclude remote URLs from embed relations', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    const mdContent = '# Test\n\n![remote](https://example.com/img.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(0);
  });

  test('should rebuild embed relations on re-sync', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'photo.png'), 'fake');
    await repo.importFile(path.join(tempDir, 'resources', 'notes', 'photo.png'));

    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), '# Test\n\n![old](photo.png)');
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds1 = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds1.length).toBe(1);

    // 修改 Markdown 内容 — 移除图片引用
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), '# Test\n\nNo images here.');
    await repo.syncMarkdownRelations(mdResource.rid);

    const embeds2 = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds2.length).toBe(0);
  });

  test('should handle HTML img tags in markdown', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'photo.png'), 'fake');
    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'photo.png'));

    const mdContent = '# Test\n\n<img src="photo.png" alt="html img">';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(1);
    expect(embeds[0].to_rid).toBe(imgResource.rid);
    expect(embeds[0].metadata.alt).toBe('html img');
  });

  test('should handle wikilinks and embeds together in one sync', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));

    // 创建目标文件用于 wikilink
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'target.md'), '# Target');
    const targetResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'target.md'));

    // 创建图片
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'photo.png'), 'fake');
    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'photo.png'));

    // 包含 wikilink + embed 的 Markdown
    const mdContent = '# Test\n\n[[target]]\n\n![photo](photo.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    // 验证 wikilink 关系
    const wikilinks = await repo.relationService.getByFromRidAndType(mdResource.rid, 'wikilink');
    expect(wikilinks.length).toBe(1);
    expect(wikilinks[0].to_rid).toBe(targetResource.rid);

    // 验证 embed 关系
    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(1);
    expect(embeds[0].to_rid).toBe(imgResource.rid);
  });

  test('syncMarkdownRelations should return counts for both types', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));

    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'target.md'), '# Target');
    await repo.importFile(path.join(tempDir, 'resources', 'notes', 'target.md'));

    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'img.png'), 'fake');
    await repo.importFile(path.join(tempDir, 'resources', 'notes', 'img.png'));

    const mdContent = '# Test\n\n[[target]]\n\n[[target]]\n\n![img](img.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const result = await repo.syncMarkdownRelations(mdResource.rid);
    expect(result.wikilinks).toBe(1); // 同一个 target 去重
    expect(result.embeds).toBe(1);
    expect(result.broken).toBe(0);
    expect(result.error).toBeUndefined();
  });
});