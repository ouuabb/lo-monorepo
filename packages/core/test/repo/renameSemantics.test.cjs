/**
 * P3 · Repository 命名语义不变量（018 §5/§6/§8）
 *
 * 覆盖：活跃 (name, layer) 唯一（partial unique）、删除不改 name、undo 原样恢复、
 * rename（normalize/冲突/undo/identity 不变）、软删后同名重建 layer0、
 * getStack/promote/remove 语义回归。
 */
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Repository = require('../../src/repo/repository.cjs');

describe('Repository 命名语义（018 P3）', () => {
  let dir;
  let repo;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-rename-'));
    repo = await Repository.create(dir);
  });

  afterEach(async () => {
    if (repo) await repo.close().catch(() => {});
    await fs.remove(dir);
  });

  test('删除不改 name；软删后同名 layer0 可重建（partial unique）', async () => {
    const a = await repo.createResource('note', '# A', {
      filename: 'x.md',
      name: 'hello-world',
    });
    await repo.deleteResource(a.rid, true); // soft

    // name 原样保留
    const row = await repo.db.get('SELECT name, deleted FROM resources WHERE rid = ?', [a.rid]);
    expect(row.name).toBe('hello-world');
    expect(row.deleted).toBe(1);

    // 同名 layer0 重建成功
    const b = await repo.createResource('note', '# B', {
      filename: 'y.md',
      name: 'hello-world',
    });
    expect(b.layer).toBe(0);
    expect(b.name).toBe('hello-world');
  });

  test('undo（resource.delete）只恢复 deleted=0，name/layer 原样', async () => {
    const a = await repo.createResource('note', '# A', { filename: 'u.md', name: 'Keep-Name' });
    const { operationId } = await repo.executeOperation('resource.delete', { rid: a.rid });

    await repo.undoContainerOperation(operationId);
    const row = await repo.db.get('SELECT name, layer, deleted FROM resources WHERE rid = ?', [a.rid]);
    expect(row.deleted).toBe(0);
    expect(row.name).toBe('keep-name');
    expect(row.layer).toBe(0);
  });

  test('rename：normalize 统一、冲突 RENAME_CONFLICT、undo 恢复、identity 不变', async () => {
    const a = await repo.createResource('note', '# A', { filename: 'r1.md', name: 'old-name' });
    await repo.createResource('note', '# B', { filename: 'r2.md', name: 'taken' });

    // normalize：输入 "Hello World" → hello-world
    const renamed = await repo.renameResource(a.rid, 'Hello World');
    expect(renamed.name).toBe('hello-world');
    expect(renamed.rid).toBe(a.rid);
    expect(renamed.location_kind).toBe('local');
    expect(renamed.layer).toBe(0);
    expect(renamed.metadata).toEqual(a.metadata || {});

    // 冲突：目标名已被活跃 layer0 占用
    await expect(repo.renameResource(a.rid, 'Taken')).rejects.toMatchObject({
      code: 'RENAME_CONFLICT',
    });

    // rename 经 operation，可撤销 → 恢复旧名（取最近 success 的 resource.update）
    const hist = await repo.db.all(
      "SELECT operation_id FROM operations WHERE type = 'resource.update' AND status = 'success' ORDER BY created DESC",
    );
    await repo.undoContainerOperation(hist[0].operation_id);
    const after = await repo.resourceService.getByRid(a.rid);
    expect(after.name).toBe('old-name');
  });

  test('rename 不改 content/hash', async () => {
    const a = await repo.createResource('note', '# 内容', { filename: 'c.md', name: 'before' });
    const hashBefore = a.hash;
    await repo.renameResource(a.rid, 'after');
    const after = await repo.resourceService.getByRid(a.rid);
    expect(after.hash).toBe(hashBefore);
    expect(await fs.readFile(path.join(dir, 'resources', 'c.md'), 'utf8')).toBe('# 内容');
  });

  test('getStack / promote / remove 在 partial unique 下语义保持', async () => {
    await repo.createResource('note', '# 1', { filename: 's1.md', name: 'same' });
    const b = await repo.createResource('note', '# 2', { filename: 's2.md', name: 'same' });
    expect(b.layer).toBe(1);
    const stack = await repo.resourceService.getStack('same');
    expect(stack.map((r) => r.layer)).toEqual([0, 1]);

    // promote layer1 → layer0（原 layer0 入栈）
    const promoted = await repo.resourceService.promote(b.rid);
    expect(promoted.layer).toBe(0);
    const stack2 = await repo.resourceService.getStack('same');
    expect(stack2.map((r) => r.layer).sort()).toEqual([0, 1]);

    // stack remove：移除 layer>0 层副本（硬删，不触 name/活跃层）
    const layer1 = stack2.find((r) => r.layer === 1);
    await repo.resourceService.removeFromStack(layer1.rid);
    const stack3 = await repo.resourceService.getStack('same');
    expect(stack3.map((r) => r.layer)).toEqual([0]);
    const active = await repo.resourceService.getByName('same');
    expect(active.rid).toBe(b.rid);
  });

  test('layer>0 资源 rename 到已被占用的 layer0 名称 → RENAME_CONFLICT', async () => {
    const a = await repo.createResource('note', '# 1', { filename: 'l1.md', name: 'target' });
    const b = await repo.createResource('note', '# 2', { filename: 'l2.md', name: 'target' });
    expect(b.layer).toBe(1);
    // 目标名称 target 的活跃 layer0 已被 a 占用 → layer>0 的 b 也不能 rename 过去
    await expect(repo.renameResource(b.rid, 'Target')).rejects.toMatchObject({
      code: 'RENAME_CONFLICT',
    });
    expect((await repo.resourceService.getByRid(a.rid)).name).toBe('target');
  });

  test('rename 不改 rid 与 relations（relations 绑定 rid）', async () => {
    const a = await repo.createResource('note', '# A', { filename: 'rel-a.md', name: 'before-a' });
    const b = await repo.createResource('note', '# B', { filename: 'rel-b.md', name: 'before-b' });
    await repo.createRelation(a.rid, b.rid, 'reference');

    await repo.renameResource(a.rid, 'after-a');
    const rels = await repo.relationService.getRelations(a.rid);
    expect(rels.outgoing.some((r) => r.to_rid === b.rid && r.type === 'reference')).toBe(true);
    const afterA = await repo.resourceService.getByRid(a.rid);
    expect(afterA.rid).toBe(a.rid);
    expect(afterA.name).toBe('after-a');
  });
});
