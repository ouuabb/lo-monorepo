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

  it('I4 · Resource Location 三分类（local/external/virtual）+ Container 能力层；'
    + 'kind 决定解析，禁止形式推断', async () => {
    const repo = await Repository.create(dir);
    const local = await repo.createResource('note', '# L', { filename: 'i4.md' });
    expect(local.location_kind).toBe('local');
    expect(local.location).toBe(path.join('resources', 'i4.md'));

    const extPath = path.join(dir, 'ext.md');
    await fs.writeFile(extPath, '# E');
    const ext = await repo.resourceService.create({
      type: 'note',
      location_kind: 'external',
      location: extPath,
      name: 'i4-ext',
    });
    expect(ext.location_kind).toBe('external');

    const virt = await repo.resourceService.create({
      type: 'vocabulary',
      location_kind: 'virtual',
      location: '',
      name: 'i4-v',
    });
    expect(virt.location_kind).toBe('virtual');

    const conDir = path.join(dir, 'con');
    await fs.ensureDir(conDir);
    const con = await repo.createResourceWithContainer('album', conDir, { name: 'i4-con' });
    expect(con.capabilities).toContain('container'); // 能力层，非位置 kind
    await repo.close();
  });

  it('I5 · 仓库内资源 location 相对 Repository.currentPath', async () => {
    const repo = await Repository.create(dir);
    const res = await repo.createResource('note', '# R', { filename: 'i5.md' });
    expect(res.location_kind).toBe('local');
    expect(res.location).toBe(path.join('resources', 'i5.md')); // 相对路径
    expect(path.isAbsolute(res.location)).toBe(false);
    await repo.close();
  });

  it('I6 · Resource Source 与 Location 解耦（source 不承载定位）（Phase 4）', async () => {
    const repo = await Repository.create(dir);
    const res = await repo.createResource('note', '# S', { filename: 'src.md' });
    const originalLoc = res.location;

    // 绑定多个内容来源（source 层：目录 / URL）
    await repo.sourceService.addSource(res.rid, 'directory', path.join(dir, 'some-source'));
    await repo.sourceService.addSource(res.rid, 'url', 'https://example.com/x');

    // 存在不同 Source 不改变 Resource Location 语义（local 相对保持）
    const again = await repo.resourceService.getByRid(res.rid);
    expect(again.location_kind).toBe('local');
    expect(again.location).toBe(originalLoc);

    // Container source + memberPath 独立于 Resource Location（两层模型）
    const srcDir = path.join(dir, 'container-src');
    await fs.ensureDir(srcDir);
    await fs.writeFile(path.join(srcDir, 'photo.png'), 'x');
    const container = await repo.createResourceWithContainer('album', srcDir, {
      name: 'album1',
    });
    const c = await repo.resourceService.getByRid(container.rid);
    expect(c.capabilities).toContain('container');
    await repo.containerService.addMember(container.rid, {
      path: 'photo.png',
      absolutePath: path.join(srcDir, 'photo.png'),
      name: 'photo.png',
    });
    const memberRow = await repo.containerService.getMember(container.rid, 'photo.png');
    expect(memberRow.path).toBe('photo.png'); // memberPath 相对内容源目录
    await repo.close();
  });

  it('I7 · 复制后 Identity 不变；副本独立化必须经 reinitialize（Phase 4）', async () => {
    const repoA = await Repository.create(dir);
    const idA = repoA.repositoryId;
    const res = await repoA.createResource('note', '# A', { filename: 'copy.md' });
    const rid = res.rid;
    const loc = res.location;
    const conDir = path.join(dir, 'con-src');
    await fs.ensureDir(conDir);
    await fs.writeFile(path.join(conDir, 'm.md'), 'm');
    const con = await repoA.createResourceWithContainer('album', conDir, { name: 'albumC' });
    await repoA.close();

    // OS copy → Repository B：Identity 保持与 A 相同（同源副本）
    const dirB = path.join(dir, '..', `${path.basename(dir)}-copy`);
    await fs.copy(dir, dirB);
    const repoB = new Repository(dirB);
    await repoB.open({ skipAuth: true });
    expect(repoB.repositoryId).toBe(idA);

    // reinitialize：B 获得新 Identity，lineage.origin = A 原 Identity
    const { oldId, newId } = await repoB.reinitialize();
    expect(newId).not.toBe(idA);
    expect(oldId).toBe(idA);

    // Resource rid / Location / Container / DB 数据保持不变
    const resB = await repoB.resourceService.getByRid(rid);
    expect(resB.rid).toBe(rid);
    expect(resB.location_kind).toBe('local');
    expect(resB.location).toBe(loc);
    const conB = await repoB.resourceService.getByRid(con.rid);
    expect(conB.capabilities).toContain('container');
    await repoB.close();
  });

  it('I8 · Backup/Restore 后 Identity 不变（Phase 4）', async () => {
    const repo = await Repository.create(dir);
    const id = repo.repositoryId;
    const res = await repo.createResource('note', '# B', { filename: 'bk.md' });
    const rid = res.rid;
    const loc = res.location;
    await repo.close();

    // backup：复制整仓（backup.cjs 语义：排除 .repo/keys）
    const backupDir = path.join(dir, '..', `${path.basename(dir)}-backup`);
    await fs.copy(dir, backupDir, {
      filter: (src) => !src.includes(`${path.sep}.repo${path.sep}keys`),
    });

    // restore 到新位置
    const restored = path.join(dir, '..', `${path.basename(dir)}-restored`);
    await fs.copy(backupDir, restored);
    const repoR = new Repository(restored);
    await repoR.open({ skipAuth: true });

    // Identity 不变；Resource rid 不变；local location 仍相对
    expect(repoR.repositoryId).toBe(id);
    const resR = await repoR.resourceService.getByRid(rid);
    expect(resR.rid).toBe(rid);
    expect(resR.location_kind).toBe('local');
    expect(resR.location).toBe(loc);
    await repoR.close();
  });

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

  it('I10 · Agent/SDK 不自行解析路径（唯一解析在 Core）', async () => {
    // 运行时验证跨包完成（本文件为 Core 仓库内测试，无法实例化 Agent/SDK）：
    //   - SDK：client.test.cjs repository.info/resolveLocation（URL 透传 Core，断言无本地拼接）
    //   - Agent：lo-core.test/ipc.test/preload.test（RepositoryContext 通道 + 三入口消费 info()）
    //   - HTTP 协议：protocolHttp.test.cjs（真实 serve：GET /api/repository + /api/resources/:rid/location）
    const repo = await Repository.create(dir);
    const res = await repo.createResource('note', '# A', { filename: 'i10.md' });
    // Core 仍为唯一解析持有者
    const loc = await repo.resourceService.resolveResourceLocation(res.rid);
    expect(loc.resolved).toBe(true);
    expect(loc.absolutePath).toBe(path.join(dir, 'resources', 'i10.md'));
    await repo.close();
  });
});
