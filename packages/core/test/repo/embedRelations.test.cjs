const fs = require('fs-extra');
const path = require('path');
const Repository = require('../../src/repo/repository.cjs');

describe('syncMarkdownRelations (RID-only embed)', () => {
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

  test('should create embed relation when markdown uses res_xxx RID', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'images'));
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'images', 'photo.png'), 'fake-image-data');
    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'images', 'photo.png'));
    expect(imgResource).not.toBeNull();

    const mdContent = `# Test\n\n![photo](${imgResource.rid})`;
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));
    expect(mdResource).not.toBeNull();

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(1);
    expect(embeds[0].to_rid).toBe(imgResource.rid);
    expect(embeds[0].metadata.origin).toBe('markdown_parser');
    expect(embeds[0].metadata.alt).toBe('photo');
  });

  test('should mark path reference as broken (not create embed)', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'images'));
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'images', 'photo.png'), 'fake-image-data');
    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'images', 'photo.png'));

    // 路径式引用在新模型下不再被猜测命中
    const mdContent = '# Test\n\n![photo](photo.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(0);

    const result = await repo.syncMarkdownRelations(mdResource.rid);
    expect(result.broken).toBeGreaterThanOrEqual(1);
    expect(result.embeds).toBe(0);

    // image 资源仍存在（只是 MD 没引用）
    const stillExists = await repo.resourceService.getByRid(imgResource.rid);
    expect(stillExists).not.toBeNull();
  });

  test('should mark subdirectory path reference as broken', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes', 'assets'));
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'assets', 'photo.png'), 'fake-image-data');
    await repo.importFile(path.join(tempDir, 'resources', 'notes', 'assets', 'photo.png'));

    const mdContent = '# Test\n\n![photo](assets/photo.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(0);

    const result = await repo.syncMarkdownRelations(mdResource.rid);
    expect(result.broken).toBe(1);
  });

  test('should mark ../ relative path reference as broken', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'assets'));
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'assets', 'photo.png'), 'fake');
    await repo.importFile(path.join(tempDir, 'resources', 'assets', 'photo.png'));

    const mdContent = '# Test\n\n![photo](../assets/photo.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const result = await repo.syncMarkdownRelations(mdResource.rid);
    expect(result.broken).toBe(1);
    expect(result.embeds).toBe(0);
  });

  test('should handle multiple RID references in one markdown', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'images'));
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'images', 'a.png'), 'fake-a');
    await fs.writeFile(path.join(tempDir, 'resources', 'images', 'b.png'), 'fake-b');

    const imgA = await repo.importFile(path.join(tempDir, 'resources', 'images', 'a.png'));
    const imgB = await repo.importFile(path.join(tempDir, 'resources', 'images', 'b.png'));

    const mdContent = `# Test\n\n![A](${imgA.rid})\n\n![B](${imgB.rid})`;
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(2);
    const targetRids = embeds.map(e => e.to_rid).sort();
    expect(targetRids).toEqual([imgA.rid, imgB.rid].sort());
  });

  test('should NOT create embed for remote URLs (Markdown native external)', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    const mdContent = '# Test\n\n![remote](https://example.com/img.png)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(0);

    // 远程 URL 不计入 broken（语义上归 Markdown 渲染器管）
    const result = await repo.syncMarkdownRelations(mdResource.rid);
    expect(result.broken).toBe(0);
    expect(result.embeds).toBe(0);
  });

  test('should NOT create embed for data: URLs (Markdown native external)', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    const mdContent = '# Test\n\n![inline](data:image/png;base64,iVBORw0KGgo=)';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(0);
    const result = await repo.syncMarkdownRelations(mdResource.rid);
    expect(result.broken).toBe(0);
  });

  test('should rebuild embed relations on re-sync (RID form)', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'images'));
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'images', 'photo.png'), 'fake');
    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'images', 'photo.png'));

    await fs.writeFile(
      path.join(tempDir, 'resources', 'notes', 'test.md'),
      `# Test\n\n![old](${imgResource.rid})`,
    );
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds1 = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds1.length).toBe(1);

    // 修改 Markdown 内容 — 移除图片引用
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), '# Test\n\nNo images here.');
    await repo.syncMarkdownRelations(mdResource.rid);

    const embeds2 = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds2.length).toBe(0);
  });

  test('should handle HTML img tag with RID src', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'images'));
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'images', 'photo.png'), 'fake');
    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'images', 'photo.png'));

    const mdContent = `# Test\n\n<img src="${imgResource.rid}" alt="html img">`;
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(1);
    expect(embeds[0].to_rid).toBe(imgResource.rid);
    expect(embeds[0].metadata.alt).toBe('html img');
  });

  test('should handle HTML img tag with path src as broken', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    const mdContent = '# Test\n\n<img src="photo.png" alt="html img">';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const result = await repo.syncMarkdownRelations(mdResource.rid);
    expect(result.broken).toBe(1);
    expect(result.embeds).toBe(0);
  });

  test('should handle wikilink + RID-embed together in one sync', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.ensureDir(path.join(tempDir, 'resources', 'images'));

    // 创建目标文件用于 wikilink
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'target.md'), '# Target');
    const targetResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'target.md'));

    // 创建图片
    await fs.writeFile(path.join(tempDir, 'resources', 'images', 'photo.png'), 'fake');
    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'images', 'photo.png'));

    // 包含 wikilink + RID-embed + path-broken 的 Markdown
    const mdContent = [
      `# Test`,
      ``,
      `[[${targetResource.rid}]]`,
      ``,
      `![photo-rid](${imgResource.rid})`,
      ``,
      `![photo-path](photo.png)`,  // +1 broken
    ].join('\n');
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    // 验证 wikilink 关系
    const wikilinks = await repo.relationService.getByFromRidAndType(mdResource.rid, 'wikilink');
    expect(wikilinks.length).toBe(1);
    expect(wikilinks[0].to_rid).toBe(targetResource.rid);

    // 验证 embed 关系（仅 RID 引用命中）
    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(1);
    expect(embeds[0].to_rid).toBe(imgResource.rid);

    // 验证 sync 返回值
    const result = await repo.syncMarkdownRelations(mdResource.rid);
    expect(result.wikilinks).toBe(1);
    expect(result.embeds).toBe(1);
    expect(result.broken).toBe(1);
    expect(result.error).toBeUndefined();
  });

  test('syncMarkdownRelations should return counts (RID-only)', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.ensureDir(path.join(tempDir, 'resources', 'images'));

    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'target.md'), '# Target');
    const targetResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'target.md'));

    await fs.writeFile(path.join(tempDir, 'resources', 'images', 'img.png'), 'fake');
    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'images', 'img.png'));

    const mdContent = [
      `# Test`,
      ``,
      `[[${targetResource.rid}]]`,
      `[[${targetResource.rid}]]`,  // 重复
      `![img](${imgResource.rid})`,
    ].join('\n');
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const result = await repo.syncMarkdownRelations(mdResource.rid);
    expect(result.wikilinks).toBe(1); // 同一个 target 去重
    expect(result.embeds).toBe(1);
    expect(result.broken).toBe(0);
    expect(result.error).toBeUndefined();
  });

  test('RID-only: rid 直接 resolve 后立即建关系（无需路径上下文）', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'images'));
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    await fs.writeFile(path.join(tempDir, 'resources', 'images', 'photo.png'), 'fake');
    const imgResource = await repo.importFile(path.join(tempDir, 'resources', 'images', 'photo.png'));

    // markdown 引用 RID 不依赖兄弟目录解析
    const mdContent = `# Test\n\n![photo](${imgResource.rid})`;
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const embeds = await repo.relationService.getByFromRidAndType(mdResource.rid, 'embed');
    expect(embeds.length).toBe(1);
    expect(embeds[0].to_rid).toBe(imgResource.rid);
  });

  test('HTML img with remote URL: not embed, not broken', async () => {
    await fs.ensureDir(path.join(tempDir, 'resources', 'notes'));
    const mdContent = '# Test\n\n<img src="https://example.com/img.png" alt="remote">';
    await fs.writeFile(path.join(tempDir, 'resources', 'notes', 'test.md'), mdContent);
    const mdResource = await repo.importFile(path.join(tempDir, 'resources', 'notes', 'test.md'));

    const result = await repo.syncMarkdownRelations(mdResource.rid);
    expect(result.broken).toBe(0);
    expect(result.embeds).toBe(0);
  });
});
