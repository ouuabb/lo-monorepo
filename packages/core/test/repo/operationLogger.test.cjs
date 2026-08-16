const path = require('path');
const Database = require('../../src/repo/database.cjs');
const OperationLogger = require('../../src/repo/operationLogger.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('OperationLogger', () => {
  let tempDir, db, containerService, logger;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    containerService = {
      renameMember: jest.fn(async () => ({ ok: true })),
      restoreMember: jest.fn(async () => ({ ok: true })),
      removeMember: jest.fn(async () => ({ ok: true })),
      moveMember: jest.fn(async () => ({ ok: true }))
    };
    logger = new OperationLogger(db, containerService);
    for (const rid of ['c1', 'c2']) {
      await db.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
         VALUES (?, ?, 0, 'container', ?, ?, '', '{}', 0, ?, ?, 0)`,
        [rid, rid, 'local', `/${rid}`, Date.now(), Date.now()]
      );
    }
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  describe('recordOp', () => {
    test('should insert operation and return operationId', async () => {
      const { operationId } = await logger.recordOp({
        containerRid: '__system__',
        type: 'member_renamed',
        memberPath: 'a.md',
        sourceId: 7,
        before: { path: 'a.md' },
        after: { path: 'b.md' }
      });
      expect(operationId).toMatch(/^op_[0-9a-f]{8}$/);
      const row = await db.get('SELECT * FROM operations WHERE operation_id = ?', [operationId]);
      expect(row.type).toBe('member_renamed');
      expect(row.member_path).toBe('a.md');
      expect(row.source_id).toBe(7);
      expect(JSON.parse(row.before)).toEqual({ path: 'a.md' });
      expect(JSON.parse(row.after)).toEqual({ path: 'b.md' });
    });

    test('should allow null before/after snapshots', async () => {
      const { operationId } = await logger.recordOp({ containerRid: '__system__', type: 'member_removed' });
      const row = await db.get('SELECT before, after FROM operations WHERE operation_id = ?', [operationId]);
      expect(row.before).toBeNull();
      expect(row.after).toBeNull();
    });
  });

  describe('getHistory', () => {
    test('should return parsed history ordered by created DESC', async () => {
      const a = await logger.recordOp({ containerRid: 'c1', type: 'member_renamed', memberPath: 'a.md', before: { path: 'a.md' } });
      const b = await logger.recordOp({ containerRid: 'c1', type: 'member_removed', memberPath: 'b.md' });
      await logger.recordOp({ containerRid: 'c2', type: 'member_removed' });
      const history = await logger.getHistory('c1');
      expect(history.map(h => h.operation_id).sort()).toEqual([a.operationId, b.operationId].sort());
      const byId = history.find(h => h.operation_id === a.operationId);
      expect(byId.before).toEqual({ path: 'a.md' });
      const typed = await logger.getHistory('c1', { type: 'member_removed' });
      expect(typed.map(h => h.operation_id)).toEqual([b.operationId]);
      const limited = await logger.getHistory('c1', { limit: 1 });
      expect(limited).toHaveLength(1);
    });
  });

  describe('getMemberHistory', () => {
    test('should match member_path and before/after paths', async () => {
      const direct = await logger.recordOp({ containerRid: 'c1', type: 'member_renamed', memberPath: 'm.md' });
      const byBefore = await logger.recordOp({ containerRid: 'c1', type: 'member_renamed', before: { old_path: 'old.md' } });
      const byAfter = await logger.recordOp({ containerRid: 'c1', type: 'member_moved', after: { target_path: 't.md' } });
      const other = await logger.recordOp({ containerRid: 'c1', type: 'member_removed', memberPath: 'z.md' });

      expect((await logger.getMemberHistory('c1', 'm.md')).map(h => h.operation_id)).toEqual([direct.operationId]);
      expect((await logger.getMemberHistory('c1', 'old.md')).map(h => h.operation_id)).toEqual([byBefore.operationId]);
      expect((await logger.getMemberHistory('c1', 't.md')).map(h => h.operation_id)).toEqual([byAfter.operationId]);
      expect((await logger.getMemberHistory('c1', 'z.md')).map(h => h.operation_id)).toEqual([other.operationId]);
      expect(await logger.getMemberHistory('c1', 'nope.md')).toEqual([]);
    });
  });

  describe('getOperation', () => {
    test('should return parsed operation or null', async () => {
      const { operationId } = await logger.recordOp({ containerRid: 'c1', type: 'member_removed', before: { a: 1 } });
      const op = await logger.getOperation(operationId);
      expect(op.before).toEqual({ a: 1 });
      expect(await logger.getOperation('op_nope')).toBeNull();
    });
  });

  describe('undo', () => {
    test('should throw when containerService is not injected', async () => {
      const bare = new OperationLogger(db);
      const { operationId } = await logger.recordOp({ containerRid: 'c1', type: 'member_removed' });
      await expect(bare.undo(operationId)).rejects.toThrow('未注入 ContainerService');
    });

    test('should throw for missing operation', async () => {
      await expect(logger.undo('op_nope')).rejects.toThrow('操作不存在');
    });

    test('should throw when operation was already undone', async () => {
      const { operationId } = await logger.recordOp({ containerRid: 'c1', type: 'member_removed', created: 100 });
      await logger.recordOp({ containerRid: 'c1', type: 'undo_member_removed', before: { undone_operation: operationId } });
      await expect(logger.undo(operationId)).rejects.toThrow('操作已被撤销');
    });

    test('should undo a member_renamed via containerService.renameMember', async () => {
      const { operationId } = await logger.recordOp({
        containerRid: 'c1',
        type: 'member_renamed',
        memberPath: 'b.md',
        before: { path: 'a.md' },
        after: { path: 'b.md' }
      });
      const result = await logger.undo(operationId);
      expect(result).toEqual({ undone: true, undoOpId: operationId });
      expect(containerService.renameMember).toHaveBeenCalledWith('c1', 'b.md', 'a.md');
      const rows = await db.all("SELECT type FROM operations WHERE type = 'undo_member_renamed'");
      expect(rows).toHaveLength(1);
    });

    test('should undo a member_removed via containerService.restoreMember', async () => {
      const { operationId } = await logger.recordOp({ containerRid: 'c1', type: 'member_removed', memberPath: 'a.md' });
      await logger.undo(operationId);
      expect(containerService.restoreMember).toHaveBeenCalledWith('c1', 'a.md');
    });

    test('should undo a member_restored via containerService.removeMember', async () => {
      const { operationId } = await logger.recordOp({ containerRid: 'c1', type: 'member_restored', memberPath: 'a.md' });
      await logger.undo(operationId);
      expect(containerService.removeMember).toHaveBeenCalledWith('c1', 'a.md');
    });

    test('should undo a member_moved via containerService.moveMember to original container', async () => {
      const { operationId } = await logger.recordOp({
        containerRid: 'c1',
        type: 'member_moved',
        memberPath: 'a.md',
        before: { container: 'c0' }
      });
      await logger.undo(operationId);
      expect(containerService.moveMember).toHaveBeenCalledWith('c1', 'a.md', 'c0');
    });

    test('should undo a member_copied by removing the copy', async () => {
      const { operationId } = await logger.recordOp({
        containerRid: 'c1',
        type: 'member_copied',
        memberPath: 'copy.md',
        after: { container: 'c2' }
      });
      await logger.undo(operationId);
      expect(containerService.removeMember).toHaveBeenCalledWith('c2', 'copy.md');
    });

    test('should throw for unsupported operation type', async () => {
      const { operationId } = await logger.recordOp({ containerRid: 'c1', type: 'member_promoted', memberPath: 'a.md' });
      await expect(logger.undo(operationId)).rejects.toThrow('不支持撤销的操作类型');
    });
  });
});
