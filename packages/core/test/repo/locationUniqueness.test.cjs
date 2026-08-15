/**
 * Resource Location 唯一性语义专项测试（016 §6 定稿：local-only uniqueness）
 *
 * 语义：只有 local（active + layer=0）具有仓库内唯一性；external 同一绝对路径
 * 可被多个 Resource 引用；virtual 不参与；deleted / stacked layer 不参与。
 * 覆盖真实入口：repository.createResource / importFile / resourceService.create /
 * move / syncOps applyOps。
 */
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Repository = require('../../src/repo/repository.cjs');
const { OP_TYPES } = require('../../src/repo/syncOps.cjs');

describe('Resource Location 唯一性（local-only，016 §6）', () => {
  let dir;
  let repo;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-loc-'));
    repo = await Repository.create(dir);
  });

  afterEach(async () => {
    if (repo) await repo.close().catch(() => {});
    await fs.remove(dir);
  });

  const relLocal = (name) => path.join('resources', name);

  test('local：真实入口 createResource 拒绝第二个同 location', async () => {
    await repo.createResource('note', '# A', { filename: 'dup.md' });
    await expect(
      repo.createResource('note', '# B', { filename: 'dup.md' }),
    ).rejects.toMatchObject({ code: 'RESOURCE_EXISTS' });
  });

  test('local：resourceService.create 冲突 → LOCATION_CONFLICT', async () => {
    await fs.writeFile(path.join(dir, 'resources', 'c.md'), '# C');
    await repo.resourceService.create({
      type: 'note',
      location_kind: 'local',
      location: relLocal('c.md'),
      name: 'c1',
    });
    await expect(
      repo.resourceService.create({
        type: 'note',
        location_kind: 'local',
        location: relLocal('c.md'),
        name: 'c2',
      }),
    ).rejects.toMatchObject({ code: 'LOCATION_CONFLICT' });
  });

  test('external：真实入口 importFile 同一绝对路径可创建多个 Resource', async () => {
    const extPath = path.join(dir, '..', `${path.basename(dir)}-ext.md`);
    await fs.writeFile(extPath, '# E');
    const a = await repo.importFile(extPath);
    const b = await repo.importFile(extPath);
    expect(a.rid).not.toBe(b.rid);
    expect(a.location_kind).toBe('external');
    expect(b.location_kind).toBe('external');
    expect(a.location).toBe(extPath);
    expect(b.location).toBe(extPath);
    // 两者均可解析到同一外部文件
    const la = await repo.resourceService.resolveResourceLocation(a.rid);
    const lb = await repo.resourceService.resolveResourceLocation(b.rid);
    expect(la).toEqual({ kind: 'external', resolved: true, absolutePath: extPath });
    expect(lb).toEqual({ kind: 'external', resolved: true, absolutePath: extPath });
  });

  test('virtual：可创建多个（location="" 不参与唯一性）', async () => {
    const a = await repo.resourceService.create({
      type: 'vocabulary',
      location_kind: 'virtual',
      location: '',
      name: 'v1',
    });
    const b = await repo.resourceService.create({
      type: 'vocabulary',
      location_kind: 'virtual',
      location: '',
      name: 'v2',
    });
    expect(a.rid).not.toBe(b.rid);
  });

  test('deleted local：软删后同路径可重建（唯一索引放行；文件覆盖需显式 overwrite）', async () => {
    const a = await repo.createResource('note', '# A', { filename: 're.md' });
    await repo.deleteResource(a.rid, false);
    // DB 层面软删记录不参与唯一性 → 重建成功（文件仍在磁盘，需显式 overwrite）
    const b = await repo.createResource('note', '# B', {
      filename: 're.md',
      overwrite: true,
    });
    expect(b.rid).not.toBe(a.rid);
    expect(b.location).toBe(relLocal('re.md'));
  });

  test('layer>0（name-stack）：同 location 可存在多版本（不参与唯一性）', async () => {
    const a = await repo.createResource('note', '# A', { filename: 'stack.md' });
    const b = await repo.resourceService.create({
      type: 'note',
      location_kind: 'local',
      location: relLocal('stack.md'),
      name: a.name,
    });
    expect(b.layer).toBeGreaterThan(0);
    expect(b.location).toBe(a.location);
  });

  test('move 到已占用 local location → LOCATION_CONFLICT', async () => {
    await repo.createResource('note', '# A', { filename: 'm1.md' });
    const b = await repo.createResource('note', '# B', { filename: 'm2.md' });
    // 目标文件缺失但 location 仍被 A 占用 → fs.move 成功，UPDATE 触发唯一索引冲突
    await fs.remove(path.join(dir, 'resources', 'm1.md'));
    await expect(
      repo.resourceService.move(b.rid, path.join(dir, 'resources', 'm1.md')),
    ).rejects.toMatchObject({ code: 'LOCATION_CONFLICT' });
  });

  test('syncOps RESOURCE_MOVED 到已占用 local location → LOCATION_CONFLICT 错误', async () => {
    await repo.createResource('note', '# A', { filename: 's1.md' });
    const b = await repo.createResource('note', '# B', { filename: 's2.md' });
    const ops = [
      {
        op_id: 'op_move_conflict',
        op_type: OP_TYPES.RESOURCE_MOVED,
        rid: b.rid,
        data: JSON.stringify({ new_path: relLocal('s1.md') }),
        timestamp: Date.now(),
      },
    ];
    const res = await repo.syncOps.applyOps(ops, repo);
    expect(res.errors.length).toBe(1);
    expect(res.errors[0].error).toContain('LOCATION_CONFLICT');
    expect(res.errors[0].error).toContain('s1.md');
  });
});
