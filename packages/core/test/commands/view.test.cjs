/**
 * view 命令测试
 *
 * 覆盖：
 *   - create（内联 condition / field + JSON 文件）
 *   - list / show / run
 *   - update（query / mode / status）
 *   - rm
 *   - export / import
 */

const path = require('path');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo, Repository } = require('./commandTestHelper.cjs');
const viewCmd = require('../../src/commands/view.cjs');

describe('view command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('create 内联 condition + field → 创建成功并可查询', async () => {
    await viewCmd.create({
      _: ['lo'],
      id: 'reading',
      name: '阅读中',
      mode: 'table',
      condition: ['{"field":"type","operator":"=","value":"note"}'],
      field: ['{"name":"name","label":"名称"}', '{"name":"tags","label":"标签"}'],
    });

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const view = await repo.viewRegistry.getView('reading');
    await repo.close();

    expect(view.name).toBe('阅读中');
    expect(view.presentation.type).toBe('table');
    expect(view.query.conditions).toHaveLength(1);
    expect(view.fields).toHaveLength(2);
  });

  test('create 从 JSON 文件读取定义', async () => {
    const file = path.join(ctx.tempDir, 'view.json');
    await fs.writeJson(file, {
      query: { conditions: [{ field: 'type', operator: '=', value: 'book' }] },
      fields: [{ name: 'name', label: '名称' }],
      mode: 'kanban',
      presentation: { group_by: 'type' },
    });

    await viewCmd.create({ _: ['lo'], id: 'books', file });

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const view = await repo.viewRegistry.getView('books');
    await repo.close();

    expect(view.presentation.type).toBe('kanban');
    expect(view.presentation.config.group_by).toBe('type');
    expect(view.query.conditions[0].value).toBe('book');
  });

  test('create 引用不存在的 schema → 报错', async () => {
    await expect(
      viewCmd.create({
        _: ['lo'],
        id: 'bad',
        condition: ['{"field":"schema","operator":"=","value":"Ghost"}'],
      })
    ).rejects.toThrow('Schema "Ghost" 不存在');
  });

  test('list 列出 View 支持 status 过滤', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.viewRegistry.createView({ id: 'v1', name: 'V1', mode: 'table' });
    await repo.viewRegistry.createView({ id: 'v2', name: 'V2', mode: 'table', status: 'deprecated' });
    await repo.close();

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await viewCmd.list({ _: ['lo'], status: 'active' });
    const calls = spy.mock.calls.map((c) => c.join(' '));
    expect(calls.join('\n')).toContain('v1');
    expect(calls.join('\n')).not.toContain('v2');
    spy.mockRestore();
  });

  test('show 显示详情（按 id 或 name）', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.viewRegistry.createView({ id: 'v1', name: '我的视图', mode: 'card' });
    await repo.close();

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await viewCmd.show({ _: ['lo'], id: 'v1' });
    let output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('v1');
    expect(output).toContain('我的视图');

    spy.mockClear();
    await viewCmd.show({ _: ['lo'], id: '我的视图' });
    output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('card');
    spy.mockRestore();
  });

  test('run 执行 View 输出资源集合', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.resourceService.create({ name: '测试资源', type: 'note' });
    await repo.viewRegistry.createView({
      id: 'v1', name: 'V1', mode: 'list',
      query: { conditions: [{ field: 'type', operator: '=', value: 'note' }] },
      fields: [{ name: 'name', label: '名称' }],
    });
    await repo.close();

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await viewCmd.run({ _: ['lo'], id: 'v1', format: 'table' });
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('测试资源');
    spy.mockRestore();
  });

  test('run --format json 输出结构化结果', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.viewRegistry.createView({
      id: 'v1', name: 'V1', mode: 'list',
      query: { conditions: [] },
      fields: [{ name: 'name' }],
    });
    await repo.close();

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await viewCmd.run({ _: ['lo'], id: 'v1', format: 'json' });
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.presentation.type).toBe('list');
    expect(parsed.columns[0].name).toBe('name');
    spy.mockRestore();
  });

  test('run 引用不存在的 view → 报错', async () => {
    await expect(viewCmd.run({ _: ['lo'], id: 'nope', format: 'table' })).rejects.toThrow('不存在');
  });

  test('update 修改 query / mode / status', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.viewRegistry.createView({
      id: 'v1', name: 'V1', mode: 'table',
      query: { conditions: [{ field: 'type', operator: '=', value: 'note' }] },
    });
    await repo.close();

    await viewCmd.update({
      _: ['lo'], id: 'v1', mode: 'kanban',
      condition: ['{"field":"type","operator":"=","value":"book"}'],
      status: 'deprecated',
    });

    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    const view = await repo2.viewRegistry.getView('v1');
    await repo2.close();

    expect(view.presentation.type).toBe('kanban');
    expect(view.status).toBe('deprecated');
    expect(view.query.conditions[0].value).toBe('book');
  });

  test('rm 删除 View', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.viewRegistry.createView({ id: 'v1', name: 'V1', mode: 'table' });
    await repo.close();

    await viewCmd.remove({ _: ['lo'], id: 'v1' });

    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    expect(await repo2.viewRegistry.getView('v1')).toBeNull();
    await repo2.close();
  });

  test('export 写入文件，import 重新创建', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.viewRegistry.createView({
      id: 'v1', name: 'V1', mode: 'card',
      query: { conditions: [{ field: 'type', operator: '=', value: 'note' }] },
      fields: [{ name: 'name', label: '名称' }],
    });
    await repo.close();

    const exportFile = path.join(ctx.tempDir, 'v1.export.json');
    await viewCmd.export({ _: ['lo'], id: 'v1', file: exportFile });

    // 模拟导入到同仓库副本：先删原视图避免 name 冲突
    await viewCmd.remove({ _: ['lo'], id: 'v1' });
    await viewCmd.import({ _: ['lo'], file: exportFile, id: 'v1-imported' });

    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    const imported = await repo2.viewRegistry.getView('v1-imported');
    await repo2.close();

    expect(imported.presentation.type).toBe('card');
    expect(imported.query.conditions).toHaveLength(1);
    expect(imported.fields).toHaveLength(1);
  });

  test('create 缺少 id → 报错', async () => {
    await expect(viewCmd.create({ _: ['lo'], name: 'NoId' })).rejects.toThrow('create 需要 id 参数');
  });

  test('create field 非合法 JSON → 报错', async () => {
    await expect(
      viewCmd.create({ _: ['lo'], id: 'v1', field: ['{bad json'] })
    ).rejects.toThrow('无法解析 field 定义');
  });

  test('create field 非 JSON 对象 → 报错', async () => {
    await expect(
      viewCmd.create({ _: ['lo'], id: 'v1', field: ['123'] })
    ).rejects.toThrow('field 定义需为 JSON 对象');
  });

  test('create condition 缺 field/operator → 报错', async () => {
    await expect(
      viewCmd.create({ _: ['lo'], id: 'v1', condition: ['{"value":"x"}'] })
    ).rejects.toThrow('查询条件需包含 field 与 operator');
  });

  test('create 接受单个字符串 condition', async () => {
    await viewCmd.create({
      _: ['lo'],
      id: 'single',
      condition: '{"field":"type","operator":"=","value":"note"}',
    });

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const view = await repo.viewRegistry.getView('single');
    await repo.close();

    expect(view.query.conditions).toHaveLength(1);
    expect(view.query.conditions[0].value).toBe('note');
  });

  test('update 修改 name / query / field', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.viewRegistry.createView({ id: 'v1', name: 'V1', mode: 'table' });
    await repo.close();

    await viewCmd.update({
      _: ['lo'],
      id: 'v1',
      name: 'Renamed',
      query: '{"conditions":[{"field":"type","operator":"=","value":"note"}]}',
      field: ['{"name":"name","label":"名称"}'],
    });

    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    const view = await repo2.viewRegistry.getView('v1');
    await repo2.close();

    expect(view.name).toBe('Renamed');
    expect(view.query.conditions).toHaveLength(1);
    expect(view.fields).toHaveLength(1);
    expect(view.fields[0].label).toBe('名称');
  });

  test('update 引用不存在的 view → 报错', async () => {
    await expect(viewCmd.update({ _: ['lo'], id: 'nope' })).rejects.toThrow('不存在');
  });

  test('rm 引用不存在的 view → 报错', async () => {
    await expect(viewCmd.remove({ _: ['lo'], id: 'nope' })).rejects.toThrow('不存在');
  });

  test('show 引用不存在的 view → 报错', async () => {
    await expect(viewCmd.show({ _: ['lo'], id: 'nope' })).rejects.toThrow('不存在');
  });

  test('list 空仓库输出暂无 View', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await viewCmd.list({ _: ['lo'] });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('暂无 View');
    spy.mockRestore();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('run 分组 view 按组输出', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.resourceService.create({ name: 'grp-a', type: 'note' });
    await repo.resourceService.create({ name: 'grp-b', type: 'image' });
    await repo.viewRegistry.createView({
      id: 'gv', name: 'G', mode: 'kanban',
      presentation: { type: 'kanban', config: { group_by: 'type' } },
      query: { conditions: [] },
      fields: [{ name: 'name', label: '名称' }],
    });
    await repo.close();

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await viewCmd.run({ _: ['lo'], id: 'gv', format: 'table' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('note');
    expect(output).toContain('image');
    expect(output).toContain('条资源');
    spy.mockRestore();
  });

  test('run 无匹配行输出（空）', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.resourceService.create({ name: 'only-note', type: 'note' });
    await repo.viewRegistry.createView({
      id: 'nv', name: 'N', mode: 'list',
      query: { conditions: [{ field: 'type', operator: '=', value: 'image' }] },
      fields: [{ name: 'name' }],
    });
    await repo.close();

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await viewCmd.run({ _: ['lo'], id: 'nv', format: 'table' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('（空）');
    spy.mockRestore();
  });

  test('run relative 格式按分钟/小时/天输出', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const res = await repo.resourceService.create({ name: 'rel', type: 'note' });
    await repo.viewRegistry.createView({
      id: 'rv', name: 'R', mode: 'list',
      query: { conditions: [] },
      fields: [{ name: 'created', label: '创建', format: 'relative' }],
    });
    await repo.close();

    const spy = jest.spyOn(console, 'table').mockImplementation(() => {});
    await viewCmd.run({ _: ['lo'], id: 'rv', format: 'table' });
    let output = spy.mock.calls.map(c => JSON.stringify(c[0])).join('\n');
    expect(output).toContain('分钟前');

    const repo2 = new Repository(ctx.tempDir);
    await repo2.open();
    await repo2.db.run('UPDATE resources SET created = ? WHERE rid = ?', [Date.now() - 5 * 3600e3, res.rid]);
    await repo2.close();

    spy.mockClear();
    await viewCmd.run({ _: ['lo'], id: 'rv', format: 'table' });
    output = spy.mock.calls.map(c => JSON.stringify(c[0])).join('\n');
    expect(output).toContain('小时前');

    const repo3 = new Repository(ctx.tempDir);
    await repo3.open();
    await repo3.db.run('UPDATE resources SET created = ? WHERE rid = ?', [Date.now() - 3 * 86400e3, res.rid]);
    await repo3.close();

    spy.mockClear();
    await viewCmd.run({ _: ['lo'], id: 'rv', format: 'table' });
    output = spy.mock.calls.map(c => JSON.stringify(c[0])).join('\n');
    expect(output).toContain('天前');
    spy.mockRestore();
  });

  test('export 无 file 时输出 JSON 到 stdout', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.viewRegistry.createView({ id: 'v1', name: 'V1', mode: 'card' });
    await repo.close();

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await viewCmd.export({ _: ['lo'], id: 'v1' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.name).toBe('V1');
    expect(parsed.presentation.type).toBe('card');
    spy.mockRestore();
  });

  test('import 缺少 file → 报错', async () => {
    await expect(viewCmd.import({ _: ['lo'] })).rejects.toThrow('import 需要 --file');
  });

  test('import 引用不存在的文件 → 报错', async () => {
    await expect(viewCmd.import({ _: ['lo'], file: 'nope.json' })).rejects.toThrow('文件不存在');
  });

  test('import 空定义文件 → 报错', async () => {
    const file = path.join(ctx.tempDir, 'empty.json');
    await fs.writeFile(file, 'null');
    await expect(viewCmd.import({ _: ['lo'], file })).rejects.toThrow('View 定义为空');
  });

  test('create 支持 query JSON 字符串参数', async () => {
    await viewCmd.create({
      _: ['lo'],
      id: 'qv',
      query: '{"conditions":[{"field":"type","operator":"=","value":"note"}]}',
    });

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const view = await repo.viewRegistry.getView('qv');
    await repo.close();

    expect(view.query.conditions).toHaveLength(1);
    expect(view.query.conditions[0].value).toBe('note');
  });

  test('create 引用不存在的定义文件 → 报错', async () => {
    await expect(
      viewCmd.create({ _: ['lo'], id: 'v1', file: 'nope.json' })
    ).rejects.toThrow('文件不存在');
  });

  test('create 从含 metadata 的 JSON 文件读取定义', async () => {
    const file = path.join(ctx.tempDir, 'meta.json');
    await fs.writeJson(file, {
      fields: [{ name: 'name' }],
      metadata: { desc: '视图元数据' },
    });

    await viewCmd.create({ _: ['lo'], id: 'meta-v', file });

    const repo = new Repository(ctx.tempDir);
    await repo.open();
    const view = await repo.viewRegistry.getView('meta-v');
    await repo.close();
    expect(view.fields).toHaveLength(1);
  });

  test('export 引用不存在的 view → 报错', async () => {
    await expect(viewCmd.export({ _: ['lo'], id: 'nope' })).rejects.toThrow('不存在');
  });

  test('create field 带 format 渲染到 printView', async () => {
    await viewCmd.create({
      _: ['lo'],
      id: 'fmtv',
      field: ['{"name":"created","label":"创建","format":"date"}'],
    });
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('run 渲染 tags 数组与 date 格式', async () => {
    const repo = new Repository(ctx.tempDir);
    await repo.open();
    await repo.resourceService.create({
      name: 'arr', type: 'note',
      metadata: { title: 'Arr', tags: ['x', 'y'] },
    });
    await repo.viewRegistry.createView({
      id: 'fv', name: 'F', mode: 'list',
      query: { conditions: [] },
      fields: [
        { name: 'tags', label: '标签' },
        { name: 'created', label: '创建', format: 'date' },
      ],
    });
    await repo.close();

    const spy = jest.spyOn(console, 'table').mockImplementation(() => {});
    await viewCmd.run({ _: ['lo'], id: 'fv', format: 'table' });
    const output = spy.mock.calls.map(c => JSON.stringify(c[0])).join('\n');
    expect(output).toContain('x');
    expect(output).toContain('y');
    expect(output).toMatch(/\d{4}-\d{2}-\d{2}/);
    spy.mockRestore();
  });
});
