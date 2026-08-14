/**
 * schema 命令测试（新架构）
 *
 * 覆盖：
 *   - create（内联 field + JSON 文件 + relation target 强校验）
 *   - list / show / rm
 *   - update（结构变更自动升版）
 *   - attach / detach / validate
 */

const path = require('path');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo, Repository } = require('./commandTestHelper.cjs');
const schemaCmd = require('../../src/commands/schema.cjs');

describe('schema command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('create 内联 field → 创建成功并可查询', async () => {
    await schemaCmd.create({
      _: ['lo'],
      id: 'followup',
      name: 'FollowUp',
      field: ['{"name":"status","type":"enum","values":["waiting","done"]}'],
    });

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const schema = await repo.schemaRegistry.getSchema('followup');
    await repo.close();

    expect(schema.name).toBe('FollowUp');
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0].name).toBe('status');
  });

  test('create 从 JSON 文件读取定义', async () => {
    const file = path.join(ctx.tempDir, 'schema.json');
    await fs.writeJson(file, {
      fields: [{ name: 'status', type: 'enum', values: ['a', 'b'] }],
      metadata: { description: '测试' },
    });

    await schemaCmd.create({ _: ['lo'], id: 'demo', file });

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const schema = await repo.schemaRegistry.getSchema('demo');
    await repo.close();

    expect(schema.fields[0].name).toBe('status');
    expect(schema.metadata.description).toBe('测试');
  });

  test('create --behavior 保存语义声明', async () => {
    await schemaCmd.create({
      _: ['lo'],
      id: 'followup',
      name: 'FollowUp',
      field: [
        '{"name":"status","type":"enum","values":["waiting","done"]}',
        '{"name":"deadline","type":"date"}',
      ],
      behavior: ['{"stateField":"status"}', '{"sortableFields":["deadline"]}'],
    });

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const schema = await repo.schemaRegistry.getSchema('followup');
    await repo.close();

    expect(schema.behaviors).toEqual({ stateField: 'status', sortableFields: ['deadline'] });
  });

  test('create 的 behavior 引用不存在字段 → 报错', async () => {
    await expect(
      schemaCmd.create({
        _: ['lo'],
        id: 'followup',
        name: 'FollowUp',
        behavior: ['{"stateField":"nope"}'],
      })
    ).rejects.toThrow('behaviors.stateField 引用的字段 "nope" 不存在');
  });

  test('create 的 behavior JSON 非法 → 报错', async () => {
    await expect(
      schemaCmd.create({
        _: ['lo'],
        id: 'followup',
        name: 'FollowUp',
        behavior: ['not-json'],
      })
    ).rejects.toThrow('无法解析 behavior 定义');
  });

  test('update --behavior 变更语义声明并升版', async () => {
    await schemaCmd.create({
      _: ['lo'],
      id: 'followup',
      name: 'FollowUp',
      field: ['{"name":"status","type":"enum","values":["waiting","done"]}'],
    });

    await schemaCmd.update({ _: ['lo'], id: 'followup', behavior: ['{"stateField":"status"}'] });

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const schema = await repo.schemaRegistry.getSchema('followup');
    await repo.close();

    expect(schema.behaviors.stateField).toBe('status');
    expect(schema.version).toBe(2);
  });

  test('create 的 relation target 不存在 → 报错且不落库', async () => {
    await expect(
      schemaCmd.create({
        _: ['lo'],
        id: 'followup',
        name: 'FollowUp',
        field: ['{"name":"customer","type":"relation","target":"Ghost"}'],
      })
    ).rejects.toThrow('relation target "Ghost" 不存在');

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const schema = await repo.schemaRegistry.getSchema('followup');
    await repo.close();
    expect(schema).toBeNull();
  });

  test('list 输出 schema 列表（不抛错）', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.schemaRegistry.createSchema({ id: 's1', name: 'S1' });
    await repo.close();

    await expect(schemaCmd.list({ _: ['lo'] })).resolves.toBeUndefined();
  });

  test('list 空仓库输出"暂无 Schema"（不抛错）', async () => {
    await expect(schemaCmd.list({ _: ['lo'] })).resolves.toBeUndefined();
  });

  test('create 字段 JSON 非法 → 报错', async () => {
    await expect(
      schemaCmd.create({ _: ['lo'], id: 'x', name: 'X', field: ['not-json'] })
    ).rejects.toThrow('无法解析字段定义');
  });

  test('create 字段 JSON 缺 name → 报错', async () => {
    await expect(
      schemaCmd.create({ _: ['lo'], id: 'x', name: 'X', field: ['{"type":"enum"}'] })
    ).rejects.toThrow('字段定义缺少 name');
  });

  test('create 缺少 --name 且无 --file → 报错', async () => {
    await expect(
      schemaCmd.create({ _: ['lo'], id: 'x' })
    ).rejects.toThrow('create 需要 --name 或 --file');
  });

  test('create --file 文件不存在 → 报错', async () => {
    await expect(
      schemaCmd.create({ _: ['lo'], id: 'x', file: path.join(ctx.tempDir, 'nope.json') })
    ).rejects.toThrow('文件不存在');
  });

  test('list 支持按 status 过滤', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.schemaRegistry.createSchema({ id: 's1', name: 'S1', status: 'active' });
    await repo.schemaRegistry.createSchema({ id: 's2', name: 'S2', status: 'deprecated' });
    await repo.close();

    await expect(schemaCmd.list({ _: ['lo'], status: 'active' })).resolves.toBeUndefined();
  });

  test('show 输出详情（不抛错）', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.schemaRegistry.createSchema({ id: 'person', name: 'Person' });
    await repo.schemaRegistry.createSchema({
      id: 'followup',
      name: 'FollowUp',
      fields: [{ name: 'status', type: 'enum', values: ['waiting', 'done'] }],
      relations: [{ name: 'owner', type: 'reference', target: 'Person' }],
    });
    await repo.close();

    await expect(schemaCmd.show({ _: ['lo'], id: 'followup' })).resolves.toBeUndefined();
  });

  test('show 不存在的 schema → 报错', async () => {
    await expect(schemaCmd.show({ _: ['lo'], id: 'nope' })).rejects.toThrow('不存在');
  });

  test('update 支持改 name 与 status', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.schemaRegistry.createSchema({ id: 's1', name: 'S1' });
    await repo.close();

    await schemaCmd.update({ _: ['lo'], id: 's1', name: 'S1New', status: 'deprecated' });

    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    const schema = await repo2.schemaRegistry.getSchema('s1');
    await repo2.close();
    expect(schema.name).toBe('S1New');
    expect(schema.status).toBe('deprecated');
    expect(schema.version).toBe(1);
  });

  test('update 不存在的 schema → 报错', async () => {
    await expect(
      schemaCmd.update({ _: ['lo'], id: 'nope', name: 'X' })
    ).rejects.toThrow('不存在');
  });

  test('rm 不存在的 schema → 报错', async () => {
    await expect(schemaCmd.rm({ _: ['lo'], id: 'nope' })).rejects.toThrow('不存在');
  });

  test('attach 不存在的资源 → 报错', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.schemaRegistry.createSchema({ id: 's1', name: 'S1' });
    await repo.close();

    await expect(
      schemaCmd.attach({ _: ['lo'], rid: 'res_missing', schema: 's1' })
    ).rejects.toThrow('资源 "res_missing" 不存在');
  });

  test('attach 不存在的 schema → 报错', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resource = await repo.resourceService.create({ type: 'record', name: 'r1' });
    await repo.close();

    await expect(
      schemaCmd.attach({ _: ['lo'], rid: resource.rid, schema: 'nope' })
    ).rejects.toThrow('Schema "nope" 不存在');
  });

  test('detach 未绑定资源 → 报错', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resource = await repo.resourceService.create({ type: 'record', name: 'r1' });
    await repo.close();

    await expect(schemaCmd.detach({ _: ['lo'], rid: resource.rid })).rejects.toThrow('未绑定');
  });

  test('update 结构变更自动升版', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.schemaRegistry.createSchema({ id: 'followup', name: 'FollowUp' });
    await repo.close();

    await schemaCmd.update({
      _: ['lo'],
      id: 'followup',
      field: ['{"name":"status","type":"enum","values":["waiting","done"]}'],
    });

    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    const schema = await repo2.schemaRegistry.getSchema('followup');
    await repo2.close();

    expect(schema.version).toBe(2);
    expect(schema.fields).toHaveLength(1);
  });

  test('rm 删除 schema', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.schemaRegistry.createSchema({ id: 's1', name: 'S1' });
    await repo.close();

    await schemaCmd.rm({ _: ['lo'], id: 's1' });

    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    const schema = await repo2.schemaRegistry.getSchema('s1');
    await repo2.close();
    expect(schema).toBeNull();
  });

  test('attach / detach / validate 完整流程', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.schemaRegistry.createSchema({
      id: 'followup',
      name: 'FollowUp',
      fields: [{ name: 'stage', type: 'enum', values: ['waiting', 'done'] }],
    });
    const resource = await repo.resourceService.create({
      type: 'record',
      name: 'r1',
    });
    await repo.close();

    // attach
    await schemaCmd.attach({ _: ['lo'], rid: resource.rid, schema: 'followup' });
    // validate 通过
    await schemaCmd.validate({ _: ['lo'], rid: resource.rid });
    // detach
    await schemaCmd.detach({ _: ['lo'], rid: resource.rid });

    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    const attached = await repo2.schemaRegistry.getResourceSchema(resource.rid);
    await repo2.close();
    expect(attached).toBeNull();
  });

  test('validate 违反约束 → process.exit(1)', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.schemaRegistry.createSchema({
      id: 'followup',
      name: 'FollowUp',
      fields: [{ name: 'stage', type: 'enum', values: ['waiting', 'done'] }],
    });
    const resource = await repo.resourceService.create({
      type: 'record',
      name: 'r1',
      schema: 'followup',
      metadata: { stage: 'waiting' },
    });
    // 直接写库注入非法值（绕过校验路径，模拟历史脏数据）
    await repo.db.run('UPDATE resources SET metadata = ? WHERE rid = ?', [JSON.stringify({ stage: 'bad' }), resource.rid]);
    await repo.close();

    await schemaCmd.validate({ _: ['lo'], rid: resource.rid });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('validate 未绑定 schema 的资源 → 不抛错', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const resource = await repo.resourceService.create({ type: 'record', name: 'r1' });
    await repo.close();

    await expect(schemaCmd.validate({ _: ['lo'], rid: resource.rid })).resolves.toBeUndefined();
  });
});
