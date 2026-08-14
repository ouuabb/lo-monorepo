const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Repository = require('../../src/repo/repository.cjs');

/**
 * 资源 / Schema / View / Workflow 操作（Operation 唯一入口）：
 * 变更记录在 system 操作历史，可 undo（资源软删 / 恢复原有快照）。
 */
describe('System Operations (resource & definition)', () => {
  let repo, testDir;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-sysops-'));
    repo = await Repository.create(testDir);
  });

  afterEach(async () => {
    if (repo) await repo.close();
    if (testDir && await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  async function seedNote(filename = 'a.md') {
    return repo.createResource('note', '# Hello', { filename });
  }

  // ─── resource.create ───
  describe('resource.create', () => {
    test('记录 Operation，undo 后资源被软删除', async () => {
      const r = await seedNote();
      const sysHistory = await repo.operationEngine.getSystemHistory();
      const createOp = sysHistory.find((h) => h.type === 'resource.create' && h.after && h.after.rid === r.rid);

      expect(createOp).toBeTruthy();
      expect(createOp.status).toBe('success');

      await repo.undoContainerOperation(createOp.operation_id);
      const after = await repo.resourceService.getByRid(r.rid);
      expect(after).toBeNull(); // 软删除后 getByRid 不可见
    });
  });

  // ─── resource.update ───
  describe('resource.update', () => {
    test('undo 恢复更新前的 metadata', async () => {
      const r = await seedNote();
      const originalMeta = r.metadata;

      const updated = await repo.updateResource(r.rid, {
        metadata: { ...originalMeta, title: 'Renamed' },
      });
      expect(updated.metadata.title).toBe('Renamed');

      const sys = await repo.operationEngine.getSystemHistory();
      const updateOp = sys.find(
        (h) => h.type === 'resource.update' && h.after && h.after.rid === r.rid,
      );
      expect(updateOp).toBeTruthy();

      await repo.undoContainerOperation(updateOp.operation_id);
      const restored = await repo.resourceService.getByRid(r.rid);
      expect(restored.metadata.title).toBe(originalMeta.title);
    });
  });

  // ─── resource.delete ───
  describe('resource.delete', () => {
    test('undo 恢复被软删除的资源', async () => {
      const r = await seedNote();
      const del = await repo.deleteResource(r.rid, true);
      expect(del.deleted).toBe(true);

      const sys = await repo.operationEngine.getSystemHistory();
      const delOp = sys.find(
        (h) => h.type === 'resource.delete' && h.after && h.after.rid === r.rid,
      );
      expect(delOp).toBeTruthy();

      await repo.undoContainerOperation(delOp.operation_id);
      const restored = await repo.resourceService.getByRid(r.rid);
      expect(restored).toBeTruthy();
      expect(restored.deleted).toBe(0);
      expect(restored.name).toBe(r.name);
    });

    test('拒绝删除系统资源（软删与硬删）', async () => {
      await expect(repo.deleteResource('__system__', true)).rejects.toThrow(
        '系统资源不可删除',
      );
      await expect(repo.deleteResource('__system__', false)).rejects.toThrow(
        '系统资源不可删除',
      );
      const sys = await repo.resourceService.getByRid('__system__');
      expect(sys).toBeTruthy();
      expect(sys.deleted).toBe(0);
    });
  });

  // ─── schema operations ───
  describe('schema.create / update / delete', () => {
    test('schema.create 记录 Operation，undo 删除该 Schema', async () => {
      const created = await repo.createSchema({
        id: 'sch_t1',
        name: 'T1',
        fields: [{ name: 'title', type: 'text' }],
      });
      expect(created.name).toBe('T1');

      const sys = await repo.operationEngine.getSystemHistory();
      const op = sys.find(
        (h) => h.type === 'schema.create' && h.after && h.after.id === created.id,
      );
      expect(op).toBeTruthy();

      await repo.undoContainerOperation(op.operation_id);
      const gone = await repo.schemaRegistry.getSchema(created.id);
      expect(gone).toBeNull();
    });

    test('schema.update undo 恢复旧定义', async () => {
      const created = await repo.createSchema({
        id: 'sch_t2',
        name: 'T2',
        fields: [{ name: 'a', type: 'text' }],
        version: 1,
      });
      const updated = await repo.updateSchema(created.id, {
        name: 'T2b',
        fields: [{ name: 'b', type: 'number' }],
      });
      expect(updated.name).toBe('T2b');
      expect(updated.version).toBe(2);

      const sys = await repo.operationEngine.getSystemHistory();
      const op = sys.find(
        (h) => h.type === 'schema.update' && h.after && h.after.id === created.id,
      );
      expect(op).toBeTruthy();

      await repo.undoContainerOperation(op.operation_id);
      const restored = await repo.schemaRegistry.getSchema(created.id);
      expect(restored.name).toBe('T2');
      expect(restored.fields.map((f) => f.name)).toEqual(['a']);
    });
  });

  // ─── workflow.transition 记录 ───
  describe('workflow.transition', () => {
    test('通过 OperationEngine 执行并可在系统历史中追溯', async () => {
      const Workflow = require('../../src/workflow/workflow.cjs');
      const wfEngine = repo._getWorkflowEngine();
      const wf = new Workflow({
        id: 'wf_log',
        name: 'Log WF',
        states: [{ id: 'todo' }, { id: 'done' }],
        transitions: [
          { id: 'finish', from: 'todo', to: 'done' },
          { id: 'reopen', from: 'done', to: 'todo' },
        ],
      });
      await wfEngine.registry.create(wf);

      const r = await seedNote();
      const inst = await wfEngine.attach(r.rid, 'wf_log');
      expect(inst.currentState).toBe('todo');

      const next = await wfEngine.transition({
        instanceId: inst.id,
        targetState: 'done',
        actor: 'test',
      });
      expect(next.currentState).toBe('done');

      // 系统历史存在 workflow.transition
      const sys = await repo.operationEngine.getSystemHistory();
      const op = sys.find(
        (h) => h.type === 'workflow.transition' && h.after && h.after.id === inst.id,
      );
      expect(op).toBeTruthy();
      expect(op.after.currentState).toBe('done');

      // undo → 实例回滚到 todo
      await repo.undoContainerOperation(op.operation_id);
      const rolledBack = await wfEngine.store.getInstance(inst.id);
      expect(rolledBack.currentState).toBe('todo');
    });
  });
});