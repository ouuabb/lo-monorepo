const path = require('path');
const fs = require('fs-extra');
const testUtils = global.testUtils;
const Repository = require('../../src/repo/repository.cjs');
const index = require('../../src/commands/index.cjs');

describe('index command', () => {
  let ctx, repo;

  beforeEach(async () => {
    ctx = { originalCwd: process.cwd() };
    ctx.dir = await testUtils.createTempRepo();
    process.chdir(ctx.dir);
    process.exit.mockClear();
    repo = new Repository(ctx.dir);
    await repo.open();
  });

  afterEach(async () => {
    if (repo) await repo.close();
    process.chdir(ctx.originalCwd);
    await testUtils.cleanupTempDir(ctx.dir);
  });

  test('generates README.md for an empty repository', async () => {
    const spy = jest.spyOn(console, 'log');
    await index({});
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('索引已生成'));

    const content = await fs.readFile(path.join(ctx.dir, 'README.md'), 'utf-8');
    expect(content).toContain('# 资源仓库索引');
    expect(content).toContain('## 最近资源');
    expect(content).toContain('## 按类型分类');
    expect(content).toContain('## 统计');
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('lists resources in the generated index', async () => {
    await repo.createResource('note', '# Alpha', { filename: 'alpha.md', metadata: { title: 'Alpha Note' } });
    await repo.createResource('note', '# Beta', { filename: 'beta.md', metadata: { title: 'Beta Note' } });

    const spy = jest.spyOn(console, 'log');
    await index({});
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('索引已生成'));

    const content = await fs.readFile(path.join(ctx.dir, 'README.md'), 'utf-8');
    expect(content).toContain('- [alpha]');
    expect(content).toContain('- [beta]');
    expect(content).toContain('### note (2个)');
    expect(content).toContain('总资源数: 3');
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('falls back to name for resources without metadata', async () => {
    await repo.createResource('note', '# Untitled', { filename: 'plain.md' });

    const spy = jest.spyOn(console, 'log');
    await index({});
    const content = await fs.readFile(path.join(ctx.dir, 'README.md'), 'utf-8');
    expect(content).toContain('- [plain]');
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('errors when not in a repository', async () => {
    process.chdir(ctx.originalCwd);
    const spy = jest.spyOn(console, 'log');
    await index({});
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('生成索引失败'));
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });
});
