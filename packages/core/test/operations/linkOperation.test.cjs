/**
 * link/unlink → relation operation 测试（P3 收敛）
 *
 * 覆盖：CLI link 双向 → 2 条 relation.create operation、分别 undo 后双向恢复
 * 不存在；wikilink → 1 条；unlink → relation.remove operation + undo 恢复；
 * 重复 link 行为保持（关系已存在）。
 */
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Repository = require('../../src/repo/repository.cjs');

async function countOps(repo, type) {
  const rows = await repo.db.all(
    'SELECT operation_id, type, container_rid FROM container_operations WHERE type = ?',
    [type],
  );
  return rows;
}

describe('link/unlink → relation operation（P3）', () => {
  let dir;
  let repo;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-link-op-'));
    repo = await Repository.create(dir);
  });

  afterEach(async () => {
    if (repo) await repo.close().catch(() => {});
    await fs.remove(dir);
  });

  async function twoNotes() {
    const a = await repo.createResource('note', '# A', { filename: 'a.md' });
    const b = await repo.createResource('note', '# B', { filename: 'b.md' });
    return { a, b };
  }

  test('CLI link 双向 → 2 条 relation.create operation；分别 undo 后双向恢复不存在', async () => {
    const { a, b } = await twoNotes();
    await repo.linkResources(a.rid, b.rid);

    const ops = await countOps(repo, 'relation.create');
    expect(ops).toHaveLength(2);
    const before = await repo.relationService.getRelations(a.rid);
    expect(before.outgoing.some((r) => r.to_rid === b.rid)).toBe(true);
    expect(before.incoming.some((r) => r.from_rid === b.rid)).toBe(true);

    // 分别 undo：双向均恢复为不存在
    await repo.undoContainerOperation(ops[0].operation_id);
    await repo.undoContainerOperation(ops[1].operation_id);
    const after = await repo.relationService.getRelations(a.rid);
    expect(after.outgoing.filter((r) => r.to_rid === b.rid && r.type === 'reference').length).toBe(0);
    expect(after.incoming.filter((r) => r.from_rid === b.rid && r.type === 'reference').length).toBe(0);
  });

  test('wikilink → 1 条 relation.create operation', async () => {
    const { a, b } = await twoNotes();
    await repo.linkResources(a.rid, b.rid, 'wikilink');
    const ops = await countOps(repo, 'relation.create');
    expect(ops).toHaveLength(1);
  });

  test('unlink → relation.remove operation；undo 后关系恢复', async () => {
    const { a, b } = await twoNotes();
    await repo.linkResources(a.rid, b.rid);
    const creates = await countOps(repo, 'relation.create');
    expect(creates).toHaveLength(2);

    await repo.unlinkResources(a.rid, b.rid);
    const removes = await countOps(repo, 'relation.remove');
    expect(removes).toHaveLength(2);

    // undo 两个 remove → 关系恢复（restore）
    await repo.undoContainerOperation(removes[0].operation_id);
    await repo.undoContainerOperation(removes[1].operation_id);
    const rels = await repo.relationService.getRelations(a.rid);
    expect(rels.outgoing.some((r) => r.to_rid === b.rid && r.type === 'reference')).toBe(true);
  });

  test('重复 link 行为保持：双向第二方向已存在时报错', async () => {
    const { a, b } = await twoNotes();
    await repo.linkResources(a.rid, b.rid);
    await expect(repo.linkResources(a.rid, b.rid)).rejects.toThrow('关系已存在');
  });

  test('unlink 找不到关系 → 不抛错（保持 CLI 语义）', async () => {
    const { a, b } = await twoNotes();
    const res = await repo.unlinkResources(a.rid, b.rid);
    expect(res.removed).toBe(true);
    expect(await countOps(repo, 'relation.remove')).toHaveLength(0);
  });

  test('wikilink unlink → 1 条 relation.remove；undo 恢复', async () => {
    const { a, b } = await twoNotes();
    await repo.linkResources(a.rid, b.rid, 'wikilink');
    await repo.unlinkResources(a.rid, b.rid, 'wikilink');
    const removes = await countOps(repo, 'relation.remove');
    expect(removes).toHaveLength(1);

    await repo.undoContainerOperation(removes[0].operation_id);
    const rels = await repo.relationService.getRelations(a.rid);
    expect(rels.outgoing.some((r) => r.to_rid === b.rid && r.type === 'wikilink')).toBe(true);
  });
});
