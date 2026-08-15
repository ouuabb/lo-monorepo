const testUtils = global.testUtils;
const Repository = require('../../src/repo/repository.cjs');
const unlink = require('../../src/commands/unlink.cjs');

describe('unlink command', () => {
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

  async function seedPair() {
    const a = await repo.createResource('note', '# A', {
      filename: 'a.md',
      metadata: { title: 'Resource A' }
    });
    const b = await repo.createResource('note', '# B', {
      filename: 'b.md',
      metadata: { title: 'Resource B' }
    });
    await repo.createRelation(a.rid, b.rid, 'reference');
    return { a, b };
  }

  test('unlinks two related resources', async () => {
    const { a, b } = await seedPair();
    const spy = jest.spyOn(console, 'log');
    await unlink({ from: a.rid, to: b.rid });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('已解除链接'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('a'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('b'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();

    const fresh = new Repository(ctx.dir);
    await fresh.open();
    const rels = await fresh.listRelations({});
    expect(rels).toHaveLength(0);
    await fresh.close();
  });

  test('resolves resources by name', async () => {
    const { a, b } = await seedPair();
    await unlink({ from: a.name, to: b.name });
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('supports a custom link type', async () => {
    const { a, b } = await seedPair();
    await repo.createRelation(b.rid, a.rid, 'custom');
    const spy = jest.spyOn(console, 'log');
    await unlink({ from: a.rid, to: b.rid, type: 'custom' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('链接类型: custom'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('errors when source resource does not exist', async () => {
    const { b } = await seedPair();
    const spy = jest.spyOn(console, 'log');
    await unlink({ from: 'res_missing', to: b.rid });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('源资源不存在'));
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });

  test('errors when target resource does not exist', async () => {
    const { a } = await seedPair();
    const spy = jest.spyOn(console, 'log');
    await unlink({ from: a.rid, to: 'res_missing' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('目标资源不存在'));
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });

  test('unlinks a wikilink in a single direction', async () => {
    const { a, b } = await seedPair();
    await repo.createRelation(a.rid, b.rid, 'wikilink');
    const spy = jest.spyOn(console, 'log');
    await unlink({ from: a.rid, to: b.rid, type: 'wikilink' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('已解除链接'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });
});
