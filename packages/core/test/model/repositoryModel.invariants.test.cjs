/**
 * Repository Model 不变量测试（016 §12）
 *
 * Phase 0 建立骨架（it.todo），随 Phase 实现填充为真实断言。
 */
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Repository = require('../../src/repo/repository.cjs');

describe('Repository Model Invariants (016 §12)', () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-inv-'));
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  it('I1 · create 产生新 Identity；move（重新打开新路径）后不变；reinitialize 产生新 Identity', async () => {
    const repo = await Repository.create(dir);
    const id = repo.repositoryId;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    await repo.close();
    const moved = path.join(dir, '..', `${path.basename(dir)}-moved`);
    await fs.move(dir, moved);
    const reopened = new Repository(moved);
    await reopened.open({ skipAuth: true });
    expect(reopened.repositoryId).toBe(id); // I1/I2：移动后 Identity 不变
    expect(reopened.getRepositoryContext().currentPath).toBe(moved); // I2：Location 重解析

    const { newId } = await reopened.reinitialize();
    expect(newId).not.toBe(id); // reinitialize → 新 Identity

    const reread = new Repository(moved);
    await reread.open({ skipAuth: true });
    expect(reread.repositoryId).toBe(newId);
    await reread.close();
  });

  it('I1 · open 拒绝缺失/非法 metadata（不自动补生成）', async () => {
    await fs.ensureDir(path.join(dir, '.repo'));
    const repo = new Repository(dir);
    await expect(repo.open({ skipAuth: true })).rejects.toThrow(/metadata/);
  });

  it('I3 · Resource Identity=rid 在移动/恢复后不变', async () => {
    const repo = await Repository.create(dir);
    const created = await repo.createResource(null, '# X', { filename: 'a.md' });
    const rid = created.rid;
    await repo.close();

    const moved = path.join(dir, '..', `${path.basename(dir)}-r3`);
    await fs.move(dir, moved);
    const reopened = new Repository(moved);
    await reopened.open({ skipAuth: true });
    const resource = await reopened.resourceService.getByRid(rid);
    expect(resource.rid).toBe(rid);
    await reopened.close();
  });

  it.todo('I4 · Resource Location 三分类（local/external/virtual）+ Container 能力层；'
    + 'kind 决定解析，禁止形式推断（Phase 2/3）');

  it.todo('I5 · 仓库内资源 location 相对 Repository.currentPath（Phase 2）');

  it.todo('I6 · Resource Source 与 Location 解耦（source 不承载定位）（Phase 4）');

  it.todo('I7 · 复制后 Identity 不变；副本独立化必须经 reinitialize（Phase 1/4）');

  it.todo('I8 · Backup/Restore 后 Identity 不变（Phase 4）');

  it('I9 · Core 唯一解析规则；Resolver 明确返回 resolved/unresolved/virtual 三态'
    + '（不保证任何时刻存在有效路径）（Phase 3）', async () => {
    const repo = await Repository.create(dir);
    // local 文件存在 → resolved
    const note = await repo.createResource('note', '# A', { filename: 'i9.md' });
    const ok = await repo.resourceService.resolveResourceLocation(note.rid);
    expect(ok.resolved).toBe(true);
    expect(ok.absolutePath).toBe(path.join(dir, 'resources', 'i9.md'));
    // 文件缺失 → unresolved（不保证存在有效路径）
    await fs.remove(path.join(dir, 'resources', 'i9.md'));
    const missing = await repo.resourceService.resolveResourceLocation(note.rid);
    expect(missing.resolved).toBe(false);
    expect(missing.reason).toBe('file-missing');
    // virtual → virtual 态
    const virt = await repo.resourceService.create({
      type: 'vocabulary',
      location_kind: 'virtual',
      location: '',
      name: 'i9-v',
    });
    const v = await repo.resourceService.resolveResourceLocation(virt.rid);
    expect(v).toEqual({ kind: 'virtual', resolved: true, absolutePath: null });
    await repo.close();
  });

  it.todo('I10 · Agent/SDK 不自行解析路径（唯一解析在 Core）（Phase 5）');
});
