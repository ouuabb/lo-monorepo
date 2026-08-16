/**
 * import → resource.create operation 测试（P2 收敛）
 *
 * 覆盖：单文件 import 产生 operation、undo 软删且文件保留、local 查重不产生
 * operation、external 同文件多资源、importDirectory 逐文件 operation、
 * recordOp 保持、syncMarkdownRelations 保持。
 */
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Repository = require('../../src/repo/repository.cjs');

async function countOps(repo) {
  const rows = await repo.db.all(
    "SELECT operation_id, type FROM operations WHERE type = 'resource.create'",
  );
  return rows;
}

describe('import 写入口 → resource.create operation（P2）', () => {
  let dir;
  let repo;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-imp-op-'));
    repo = await Repository.create(dir);
  });

  afterEach(async () => {
    if (repo) await repo.close().catch(() => {});
    await fs.remove(dir);
  });

  test('单文件 import → 产生 resource.create operation；undo → 软删且文件保留', async () => {
    const filePath = path.join(dir, 'resources', 'imp.md');
    await fs.writeFile(filePath, '# 导入');

    const resource = await repo.importFile(filePath);
    const ops = await countOps(repo);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('resource.create');

    // undo → 软删（getByRid 过滤 deleted，直接查行），磁盘文件保留
    await repo.undoContainerOperation(ops[0].operation_id);
    const row = await repo.db.get('SELECT * FROM resources WHERE rid = ?', [
      resource.rid,
    ]);
    expect(row.deleted).toBe(1);
    expect(await fs.pathExists(filePath)).toBe(true);
  });

  test('local 查重：同文件再次 import 返回 existing，不产生新 operation', async () => {
    const filePath = path.join(dir, 'resources', 'dup.md');
    await fs.writeFile(filePath, '# D');

    const first = await repo.importFile(filePath);
    const second = await repo.importFile(filePath);
    expect(second.rid).toBe(first.rid);
    expect(await countOps(repo)).toHaveLength(1);
  });

  test('external 同文件可多 Resource 导入，各产生独立 operation', async () => {
    const extPath = path.join(dir, '..', `${path.basename(dir)}-ext.md`);
    await fs.writeFile(extPath, '# E');

    const a = await repo.importFile(extPath);
    const b = await repo.importFile(extPath);
    expect(a.rid).not.toBe(b.rid);
    expect(a.location_kind).toBe('external');
    expect(b.location_kind).toBe('external');
    const ops = await countOps(repo);
    expect(ops).toHaveLength(2);
  });

  test('importDirectory 多文件 → 每文件独立 operation（部分失败语义保持）', async () => {
    const dir2 = path.join(dir, 'bulk');
    await fs.ensureDir(dir2);
    await fs.writeFile(path.join(dir2, 'a.md'), '# A');
    await fs.writeFile(path.join(dir2, 'b.md'), '# B');

    const results = await repo.importDirectory(dir2);
    expect(results).toHaveLength(2);
    const ops = await countOps(repo);
    expect(ops).toHaveLength(2);
  });

  test('recordOp 保持：sync_ops 含 RESOURCE_CREATED 记录', async () => {
    const filePath = path.join(dir, 'resources', 'sync.md');
    await fs.writeFile(filePath, '# S');
    await repo.importFile(filePath);

    const rows = await repo.db.all(
      "SELECT * FROM sync_ops WHERE op_type = 'resource_created'",
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('syncMarkdownRelations 保持：note 导入后自动调用关系同步', async () => {
    const spy = jest.spyOn(repo, 'syncMarkdownRelations');
    const filePath = path.join(dir, 'resources', 'link.md');
    await fs.writeFile(filePath, '# L\n\n[[res_aaa_0011223344556677]]');
    await repo.importFile(filePath);
    // 调用保持（wikilink 解析结果由 embedRelations.test 覆盖）
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^res_/));
    spy.mockRestore();
  });
});
