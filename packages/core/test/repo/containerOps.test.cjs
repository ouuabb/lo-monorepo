const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Repository = require('../../src/repo/repository.cjs');

/**
 * Container 操作引擎（完整档）：scan / sync / promote / demote 全链路经 OperationEngine，
 * 变更可撤销（undo）、可追溯（history）、可回滚（transaction）。
 */
describe('Container Operation Engine', () => {
  let repo, testDir, sourceDir, containerRid;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-ops-'));
    sourceDir = path.join(testDir, 'src');
    await fs.ensureDir(sourceDir);
    repo = await Repository.create(testDir);
  });

  afterEach(async () => {
    if (repo) await repo.close();
    if (testDir && await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  async function createContainer() {
    const container = await repo.createResourceWithContainer('project', sourceDir, {
      scanMembers: false,
      name: 'ops-cnt'
    });
    containerRid = container.rid;
    return container;
  }

  // ─── scan ───
  describe('scan', () => {
    test('记录 member.add 操作与事务，且可撤销（软删除）', async () => {
      await fs.writeFile(path.join(sourceDir, 'a.md'), 'hello a');
      await fs.writeFile(path.join(sourceDir, 'b.md'), 'hello b');
      await createContainer();

      const scanResults = await repo.scanContainerMembers(containerRid);
      expect(scanResults.reduce((s, r) => s + r.added, 0)).toBe(2);

      // 操作已记录
      const history = await repo.getContainerHistory(containerRid);
      const addOps = history.filter(h => h.type === 'member.add');
      expect(addOps.length).toBe(2);
      expect(addOps.every(h => h.status === 'success')).toBe(true);

      // 事务已记录
      const txs = await repo.getContainerTransactions(containerRid);
      expect(txs.length).toBe(1);
      expect(txs[0].type).toBe('container.scan');
      expect(txs[0].status).toBe('committed');

      // undo → 该成员被软删除
      const target = addOps[0];
      await repo.undoContainerOperation(target.operation_id);
      const member = await repo.containerService.getMember(containerRid, target.member_path);
      expect(member.status).toBe('deleted');

      // 其他成员不受影响
      const others = (await repo.containerService.getMembers(containerRid))
        .filter(m => m.path !== target.member_path);
      expect(others.every(m => m.status === 'indexed')).toBe(true);
    });

    test('undo-of-undo（redo）恢复已删除成员', async () => {
      await fs.writeFile(path.join(sourceDir, 'a.md'), 'hello a');
      await createContainer();
      await repo.scanContainerMembers(containerRid);

      const history = await repo.getContainerHistory(containerRid);
      const addOp = history.find(h => h.type === 'member.add');
      expect(addOp).toBeTruthy();

      const undoRes = await repo.undoContainerOperation(addOp.operation_id);
      let member = await repo.containerService.getMember(containerRid, 'a.md');
      expect(member.status).toBe('deleted');

      // 撤销 undo → 重新执行原 member.add
      await repo.undoContainerOperation(undoRes.undoOperationId);
      member = await repo.containerService.getMember(containerRid, 'a.md');
      expect(member.status).toBe('indexed');
    });
  });

  // ─── sync ───
  describe('sync', () => {
    test('记录增/改/删操作，且各自可撤销', async () => {
      await fs.writeFile(path.join(sourceDir, 'a.md'), 'v1');
      await fs.writeFile(path.join(sourceDir, 'b.md'), 'old b');
      await createContainer();
      await repo.scanContainerMembers(containerRid);

      // 修改 a.md、新增 c.md、删除 b.md
      await fs.writeFile(path.join(sourceDir, 'a.md'), 'v2');
      await fs.writeFile(path.join(sourceDir, 'c.md'), 'new c');
      await fs.remove(path.join(sourceDir, 'b.md'));

      const [result] = await repo.syncContainerMembers(containerRid);
      expect(result.added).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.removed).toBe(1);
      expect(result.errors).toEqual([]);

      const history = await repo.getContainerHistory(containerRid);
      expect(history.some(h => h.type === 'member.add' && h.member_path === 'c.md')).toBe(true);
      const updateOp = history.find(h => h.type === 'member.update' && h.member_path === 'a.md');
      const deleteOp = history.find(h => h.type === 'member.delete' && h.member_path === 'b.md');
      expect(updateOp).toBeTruthy();
      expect(deleteOp).toBeTruthy();

      const txs = await repo.getContainerTransactions(containerRid);
      expect(txs.some(t => t.type === 'container.sync')).toBe(true);

      // undo update → a.md 恢复为 v1 的 hash
      const aMember = await repo.containerService.getMember(containerRid, 'a.md');
      expect(aMember.hash).not.toBe(updateOp.after.old_hash);
      await repo.undoContainerOperation(updateOp.operation_id);
      const aAfter = await repo.containerService.getMember(containerRid, 'a.md');
      expect(aAfter.hash).toBe(updateOp.after.old_hash);
      expect(aAfter.size).toBe(updateOp.after.old_size);

      // undo delete → b.md 恢复为 indexed
      await repo.undoContainerOperation(deleteOp.operation_id);
      const bAfter = await repo.containerService.getMember(containerRid, 'b.md');
      expect(bAfter.status).toBe('indexed');
    });
  });

  // ─── promote / demote ───
  describe('promote / demote', () => {
    test('promote 记录操作，undo 降级回 File Member（Resource 保留）', async () => {
      await fs.writeFile(path.join(sourceDir, 'note.md'), '# title');
      await createContainer();
      await repo.scanContainerMembers(containerRid);

      const resource = await repo.promoteMember(containerRid, 'note.md');
      expect(resource.rid).toBeTruthy();

      const member = await repo.containerService.getMember(containerRid, 'note.md');
      expect(member.status).toBe('promoted');
      expect(member.resource_rid).toBe(resource.rid);

      const history = await repo.getContainerHistory(containerRid);
      const promoteOp = history.find(h => h.type === 'member.promote');
      expect(promoteOp).toBeTruthy();

      // undo promote → 降级为 indexed，resource_rid 清空；Resource 本身保留
      await repo.undoContainerOperation(promoteOp.operation_id);
      const after = await repo.containerService.getMember(containerRid, 'note.md');
      expect(after.status).toBe('indexed');
      expect(after.resource_rid).toBeNull();
      expect(await repo.getResource(resource.rid)).toBeTruthy();
    });

    test('demote 记录操作，undo 恢复提升状态', async () => {
      await fs.writeFile(path.join(sourceDir, 'note.md'), '# title');
      await createContainer();
      await repo.scanContainerMembers(containerRid);
      const resource = await repo.promoteMember(containerRid, 'note.md');

      const demoteRes = await repo.demoteMember(containerRid, 'note.md');
      expect(demoteRes.demoted).toBe(true);
      expect(demoteRes.previousResourceRid).toBe(resource.rid);

      let member = await repo.containerService.getMember(containerRid, 'note.md');
      expect(member.status).toBe('indexed');

      const history = await repo.getContainerHistory(containerRid);
      const demoteOp = history.find(h => h.type === 'member.demote');
      expect(demoteOp).toBeTruthy();

      // undo demote → 恢复 promoted + resource_rid
      await repo.undoContainerOperation(demoteOp.operation_id);
      member = await repo.containerService.getMember(containerRid, 'note.md');
      expect(member.status).toBe('promoted');
      expect(member.resource_rid).toBe(resource.rid);
    });
  });

  // ─── 一致性（verify 依据）───
  describe('consistency', () => {
    test('promote+scan+sync 后 history 不再为空', async () => {
      await fs.writeFile(path.join(sourceDir, 'note.md'), '# title');
      await createContainer();
      await repo.scanContainerMembers(containerRid);
      await repo.promoteMember(containerRid, 'note.md');

      const history = await repo.getContainerHistory(containerRid);
      const txs = await repo.getContainerTransactions(containerRid);
      expect(history.length).toBeGreaterThan(0);
      expect(txs.length).toBeGreaterThan(0);

      const types = new Set(history.map(h => h.type));
      expect(types.has('member.add')).toBe(true);
      expect(types.has('member.promote')).toBe(true);
    });
  });
});
