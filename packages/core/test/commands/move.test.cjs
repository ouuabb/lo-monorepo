const path = require('path');
const testUtils = global.testUtils;
const Repository = require('../../src/repo/repository.cjs');
const move = require('../../src/commands/move.cjs');

describe('move command', () => {
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

  async function seedNote(filename = 'a.md') {
    return repo.createResource('note', '# Hello', { filename });
  }

  test('moves a resource to a relative destination', async () => {
    const r = await seedNote();
    const spy = jest.spyOn(console, 'log');
    await move({ rid: r.rid, dest: 'moved.md' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('资源已移动'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();

    const fresh = new Repository(ctx.dir);
    await fresh.open();
    const moved = await fresh.resolveResource('moved.md');
    expect(moved).toBeDefined();
    await fresh.close();
  });

  test('moves a resource to an absolute destination', async () => {
    const r = await seedNote();
    const abs = path.join(ctx.dir, 'absolute-target.md');
    await move({ rid: r.rid, dest: abs });
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('moves a resource to a destination with a content title', async () => {
    const r = await repo.createResource('note', '# No title', { filename: 'untitled.md', metadata: {} });
    const spy = jest.spyOn(console, 'log');
    await move({ rid: r.rid, dest: 'no-title.md' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('资源已移动'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('errors when resource does not exist', async () => {
    const spy = jest.spyOn(console, 'log');
    await move({ rid: 'res_missing', dest: 'x.md' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('资源不存在'));
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });

  test('errors when destination is missing', async () => {
    const r = await seedNote();
    const spy = jest.spyOn(console, 'log');
    await move({ rid: r.rid });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('移动资源失败'));
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });

  test('errors when rid is missing', async () => {
    const spy = jest.spyOn(console, 'log');
    await move({ dest: 'x.md' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('资源不存在'));
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });

  test('creates nested destination directories', async () => {
    const r = await seedNote();
    const badDest = path.join(ctx.dir, 'sub', 'nested', 'target.md');
    const spy = jest.spyOn(console, 'log');
    await move({ rid: r.rid, dest: badDest });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('资源已移动'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });
});
