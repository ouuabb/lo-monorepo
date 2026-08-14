const testUtils = global.testUtils;
const Repository = require('../../src/repo/repository.cjs');
const relation = require('../../src/commands/relation.cjs');

describe('relation command', () => {
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

  async function seedResources() {
    const a = await repo.createResource('note', '# A', { filename: 'a.md', metadata: { title: 'A' } });
    const b = await repo.createResource('note', '# B', { filename: 'b.md', metadata: { title: 'B' } });
    return { a, b };
  }

  describe('add', () => {
    test('creates a reference relation with default type', async () => {
      const { a, b } = await seedResources();
      const spy = jest.spyOn(console, 'log');
      await relation.add({ from: a.rid, to: b.rid });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('关系已创建'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();

      const fresh = new Repository(ctx.dir);
      await fresh.open();
      const rels = await fresh.listRelations({});
      expect(rels).toHaveLength(1);
      expect(rels[0].type).toBe('reference');
      await fresh.close();
    });

    test('creates a relation with a custom type and label', async () => {
      const { a, b } = await seedResources();
      const spy = jest.spyOn(console, 'log');
      await relation.add({ from: a.rid, to: b.rid, type: 'custom', label: 'depends on' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('--[custom]-->'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();

      const fresh = new Repository(ctx.dir);
      await fresh.open();
      const rels = await fresh.listRelations({ type: 'custom' });
      expect(rels[0].metadata.label).toBe('depends on');
      await fresh.close();
    });

    test('resolves resources by name', async () => {
      const { a, b } = await seedResources();
      await relation.add({ from: a.name, to: b.name });
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('errors when source resource does not exist', async () => {
      const { b } = await seedResources();
      const spy = jest.spyOn(console, 'log');
      await relation.add({ from: 'res_nope', to: b.rid });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('源资源不存在'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });

    test('errors when target resource does not exist', async () => {
      const { a } = await seedResources();
      const spy = jest.spyOn(console, 'log');
      await relation.add({ from: a.rid, to: 'res_nope' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('目标资源不存在'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });

    test('reports failures thrown by the repository', async () => {
      const { a, b } = await seedResources();
      await repo.createRelation(a.rid, b.rid, 'reference');
      const spy = jest.spyOn(console, 'log');
      await relation.add({ from: a.rid, to: b.rid });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('创建关系失败'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });

  describe('remove', () => {
    test('removes an existing relation', async () => {
      const { a, b } = await seedResources();
      const rel = await repo.createRelation(a.rid, b.rid, 'reference');
      const spy = jest.spyOn(console, 'log');
      await relation.remove({ id: rel.id });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('关系已删除'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();

      const fresh = new Repository(ctx.dir);
      await fresh.open();
      const rels = await fresh.listRelations({});
      expect(rels).toHaveLength(0);
      await fresh.close();
    });

    test('errors when no valid id is given', async () => {
      const spy = jest.spyOn(console, 'log');
      await relation.remove({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('请指定有效的关系 id'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });

    test('reports failures for a missing relation', async () => {
      const spy = jest.spyOn(console, 'log');
      await relation.remove({ id: '999999' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('删除关系失败'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });

  describe('list', () => {
    test('lists all relations', async () => {
      const { a, b } = await seedResources();
      await repo.createRelation(a.rid, b.rid, 'reference');
      const spy = jest.spyOn(console, 'log');
      await relation.list({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('All Relations'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('filters relations by type', async () => {
      const { a, b } = await seedResources();
      await repo.createRelation(a.rid, b.rid, 'reference');
      await repo.createRelation(b.rid, a.rid, 'custom');
      const spy = jest.spyOn(console, 'log');
      await relation.list({ type: 'custom' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('All Relations'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('--[custom]-->'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('shows outgoing and incoming relations for a resource', async () => {
      const { a, b } = await seedResources();
      await repo.createRelation(a.rid, b.rid, 'reference');
      await repo.createRelation(b.rid, a.rid, 'custom');
      const spy = jest.spyOn(console, 'log');
      await relation.list({ resource: a.rid });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Outgoing:'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Incoming:'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('2 relations'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('shows empty state for a resource with no relations', async () => {
      const { a } = await seedResources();
      const spy = jest.spyOn(console, 'log');
      await relation.list({ resource: a.rid });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('0 relations'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('(无关系)'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('errors when the resource does not exist', async () => {
      const spy = jest.spyOn(console, 'log');
      await relation.list({ resource: 'res_nope' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('资源不存在'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });

  describe('show', () => {
    test('shows relation details', async () => {
      const { a, b } = await seedResources();
      const rel = await repo.createRelation(a.rid, b.rid, 'custom', { label: 'x' });
      const spy = jest.spyOn(console, 'log');
      await relation.show({ id: rel.id });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining(`Relation #${rel.id}`));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining(a.rid));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('custom'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('"label":"x"'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('errors when no valid id is given', async () => {
      const spy = jest.spyOn(console, 'log');
      await relation.show({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('请指定有效的关系 id'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });

    test('errors when the relation does not exist', async () => {
      const spy = jest.spyOn(console, 'log');
      await relation.show({ id: 123456 });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('关系不存在'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });
});
