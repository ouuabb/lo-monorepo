const path = require('path');
const fs = require('fs-extra');
const testUtils = global.testUtils;
const Repository = require('../../src/repo/repository.cjs');
const createResource = require('../../src/commands/resource.cjs');

describe('resource command', () => {
  let ctx, repo;

  beforeEach(async () => {
    ctx = { originalCwd: process.cwd() };
    ctx.dir = await testUtils.createTempRepo();
    process.chdir(ctx.dir);
    process.exit.mockClear();
    repo = new Repository(ctx.dir);
    await repo.open();
    await fs.ensureDir(path.join(ctx.dir, 'myproject'));
    await fs.writeFile(path.join(ctx.dir, 'myproject', 'readme.md'), '# Project\n');
    await fs.ensureDir(path.join(ctx.dir, 'myproject', 'notes'));
    await fs.writeFile(path.join(ctx.dir, 'myproject', 'notes', 'x.md'), '# X\n');
  });

  afterEach(async () => {
    if (repo) await repo.close();
    process.chdir(ctx.originalCwd);
    await testUtils.cleanupTempDir(ctx.dir);
  });

  test('creates a container resource from a directory', async () => {
    const spy = jest.spyOn(console, 'log');
    await createResource({ type: 'project', path: 'myproject' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('资源已创建'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('RID:'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('container'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Members:'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('creates a non-container resource from a file', async () => {
    const spy = jest.spyOn(console, 'log');
    await createResource({ type: 'note', path: path.join(ctx.dir, 'myproject', 'readme.md') });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('资源已创建'));
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('Members:'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('supports the name option', async () => {
    const spy = jest.spyOn(console, 'log');
    await createResource({ type: 'project', path: 'myproject', name: 'custom-name' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('custom-name'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('honors the no-scan option', async () => {
    const spy = jest.spyOn(console, 'log');
    await createResource({ type: 'project', path: 'myproject', 'no-scan': true });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('资源已创建'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('reads type and path from argv positions', async () => {
    const spy = jest.spyOn(console, 'log');
    await createResource({ _: ['lo', 'create', 'resource', 'project', 'myproject'] });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('资源已创建'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('errors when type is missing', async () => {
    const spy = jest.spyOn(console, 'log');
    await createResource({ path: 'myproject' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('请指定资源类型'));
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });

  test('errors when path is missing', async () => {
    const spy = jest.spyOn(console, 'log');
    await createResource({ type: 'project' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('请指定内容来源路径'));
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });

  test('errors when the source path does not exist', async () => {
    const spy = jest.spyOn(console, 'log');
    await createResource({ type: 'project', path: 'does-not-exist' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('创建资源失败'));
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });
});
