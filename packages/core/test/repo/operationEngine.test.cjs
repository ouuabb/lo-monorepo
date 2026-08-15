const path = require('path');
const Database = require('../../src/repo/database.cjs');
const OperationRegistry = require('../../src/repo/operationRegistry.cjs');
const OperationEngine = require('../../src/repo/operationEngine.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

const SYSTEM = '__system__';

describe('OperationEngine', () => {
  let tempDir, db, registry, engine;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    registry = new OperationRegistry();
    engine = new OperationEngine(db, registry, {});
    for (const rid of ['c1', 'other']) {
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

  function registerHandler(type, { execute, undo } = {}) {
    const handler = {
      execute: execute || jest.fn(async (ctx, params) => ({ ok: true, path: params.path })),
      undo: undo || jest.fn(async (ctx, params) => ({ undone: true }))
    };
    registry.register(type, handler);
    return handler;
  }

  describe('execute', () => {
    test('should run handler, persist op as success and return operationId', async () => {
      const handler = registerHandler('test.op');
      const result = await engine.execute('test.op', { containerRid: SYSTEM, path: 'a.md' });
      expect(result.operationId).toMatch(/^op_[0-9a-f]{10}$/);
      expect(result.result).toEqual({ ok: true, path: 'a.md' });
      expect(handler.execute).toHaveBeenCalledTimes(1);

      const op = await db.get('SELECT * FROM container_operations WHERE operation_id = ?', [result.operationId]);
      expect(op.status).toBe('success');
      expect(op.container_rid).toBe(SYSTEM);
      expect(op.member_path).toBe('a.md');
      expect(JSON.parse(op.before)).toEqual({ containerRid: SYSTEM, path: 'a.md' });
      expect(JSON.parse(op.after)).toEqual({ ok: true, path: 'a.md' });
    });

    test('should default containerRid to system and accept memberPath', async () => {
      registerHandler('test.op');
      const { operationId } = await engine.execute('test.op', { memberPath: 'x.md' });
      const op = await db.get('SELECT * FROM container_operations WHERE operation_id = ?', [operationId]);
      expect(op.container_rid).toBe(SYSTEM);
      expect(op.member_path).toBe('x.md');
    });

    test('should record transactionId and actor', async () => {
      registerHandler('test.op');
      const { operationId } = await engine.execute('test.op', {}, { transactionId: 'tx_1', actor: 'alice' });
      const op = await db.get('SELECT * FROM container_operations WHERE operation_id = ?', [operationId]);
      expect(op.transaction_id).toBe('tx_1');
      expect(op.actor).toBe('alice');
    });

    test('should mark op as failed and rethrow when handler throws', async () => {
      registerHandler('test.op', { execute: jest.fn(async () => { throw new Error('boom'); }) });
      await expect(engine.execute('test.op', {})).rejects.toThrow('boom');
      const rows = await db.all('SELECT * FROM container_operations');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('failed');
      expect(rows[0].error).toBe('boom');
    });

    test('should inject db and registered services into handler context', async () => {
      const svc = { name: 'relationService', doThing: jest.fn() };
      engine.setService('relationService', svc);
      let seenCtx;
      registerHandler('test.op', {
        execute: jest.fn(async (ctx) => { seenCtx = ctx; return { seen: true }; })
      });
      await engine.execute('test.op', {});
      expect(seenCtx.db).toBe(db);
      expect(seenCtx.relationService).toBe(svc);
      expect(seenCtx.containerService).toBeDefined();
    });
  });

  describe('undo', () => {
    test('should throw for missing operation', async () => {
      await expect(engine.undo('op_missing')).rejects.toThrow('操作不存在');
    });

    test('should throw when operation is not success', async () => {
      registerHandler('test.op', { execute: jest.fn(async () => { throw new Error('x'); }) });
      await expect(engine.execute('test.op', {})).rejects.toThrow();
      const rows = await db.all('SELECT operation_id FROM container_operations');
      await expect(engine.undo(rows[0].operation_id)).rejects.toThrow('只能撤销成功的操作');
    });

    test('should throw when operation was already undone', async () => {
      registerHandler('test.op');
      const { operationId } = await engine.execute('test.op', {});
      const { operationId: undoId } = await engine.execute('test.op', {}, { parentOperationId: operationId });
      await db.run('UPDATE container_operations SET status = ? WHERE operation_id = ?', ['success', undoId]);
      await expect(engine.undo(operationId)).rejects.toThrow('操作已被撤销');
    });

    test('should create undo op, call handler.undo and mark original rolled_back', async () => {
      const handler = registerHandler('test.op', {
        execute: jest.fn(async (ctx, params) => ({ newPath: 'b.md' })),
        undo: jest.fn(async (ctx, params) => ({ restored: true }))
      });
      const { operationId } = await engine.execute('test.op', { containerRid: SYSTEM, memberPath: 'a.md' });

      const result = await engine.undo(operationId);
      expect(result.undoOperationId).toMatch(/^op_/);
      expect(handler.undo).toHaveBeenCalledTimes(1);

      const [undoParams] = handler.undo.mock.calls[0].slice(1);
      expect(undoParams.memberPath).toBe('a.md');
      expect(undoParams.operationResult).toEqual({ newPath: 'b.md' });
      expect(undoParams.operation.operation_id).toBe(operationId);

      const original = await db.get('SELECT status FROM container_operations WHERE operation_id = ?', [operationId]);
      expect(original.status).toBe('rolled_back');
      const undoOp = await db.get('SELECT * FROM container_operations WHERE operation_id = ?', [result.undoOperationId]);
      expect(undoOp.type).toBe('undo.test.op');
      expect(undoOp.parent_operation_id).toBe(operationId);
      expect(undoOp.status).toBe('success');
    });

    test('should mark undo op failed and rethrow when undo handler throws', async () => {
      registerHandler('test.op', {
        undo: jest.fn(async () => { throw new Error('undo boom'); })
      });
      const { operationId } = await engine.execute('test.op', {});
      await expect(engine.undo(operationId)).rejects.toThrow('undo boom');
      const rows = await db.all('SELECT type, status FROM container_operations ORDER BY created');
      expect(rows[1].type).toBe('undo.test.op');
      expect(rows[1].status).toBe('failed');
    });

    test('undo of an undo should re-execute the original operation', async () => {
      const handler = registerHandler('test.op', {
        execute: jest.fn(async (ctx, params) => ({ ok: true })),
        undo: jest.fn(async (ctx, params) => ({ undone: true }))
      });
      const { operationId } = await engine.execute('test.op', { containerRid: SYSTEM, memberPath: 'a.md' });
      const { undoOperationId } = await engine.undo(operationId);
      const redo = await engine.undo(undoOperationId);

      expect(redo.result).toEqual({ ok: true });
      expect(handler.execute).toHaveBeenCalledTimes(2);
      const [redoParams] = handler.execute.mock.calls[1].slice(1);
      expect(redoParams.memberPath).toBe('a.md');

      const original = await db.get('SELECT status FROM container_operations WHERE operation_id = ?', [operationId]);
      expect(original.status).toBe('rolled_back');
      const undoOp = await db.get('SELECT status FROM container_operations WHERE operation_id = ?', [undoOperationId]);
      expect(undoOp.status).toBe('rolled_back');
    });

    test('redo should throw when parent operation is missing', async () => {
      registerHandler('test.op', { execute: jest.fn(), undo: jest.fn() });
      const { operationId } = await engine.execute('test.op', {});
      const { undoOperationId } = await engine.undo(operationId);
      await db.run('DELETE FROM container_operations WHERE operation_id = ?', [operationId]);
      await expect(engine.undo(undoOperationId)).rejects.toThrow('找不到被撤销的原始操作');
    });
  });

  describe('history queries', () => {
    test('getHistory should return parsed ops for container', async () => {
      registerHandler('test.op');
      const a = await engine.execute('test.op', { containerRid: 'c1', memberPath: 'a.md' });
      const b = await engine.execute('test.op', { containerRid: 'c1', memberPath: 'b.md' });
      await engine.execute('test.op', { containerRid: 'other', memberPath: 'x.md' });

      const history = await engine.getHistory('c1');
      expect(history.map(h => h.operation_id)).toEqual([b.operationId, a.operationId]);
      expect(history[0].before).toEqual({ containerRid: 'c1', memberPath: 'b.md' });
    });

    test('getHistory should filter by type and limit', async () => {
      registerHandler('test.op');
      registerHandler('other.op');
      await engine.execute('test.op', { containerRid: 'c1' });
      await engine.execute('other.op', { containerRid: 'c1' });
      await engine.execute('test.op', { containerRid: 'c1' });
      const typed = await engine.getHistory('c1', { type: 'test.op' });
      expect(typed).toHaveLength(2);
      const limited = await engine.getHistory('c1', { limit: 1 });
      expect(limited).toHaveLength(1);
    });

    test('getSystemHistory should query the system container', async () => {
      registerHandler('test.op');
      await engine.execute('test.op', {});
      const history = await engine.getSystemHistory();
      expect(history).toHaveLength(1);
      expect(history[0].container_rid).toBe(SYSTEM);
    });

    test('getOperation should return parsed op or null', async () => {
      registerHandler('test.op');
      const { operationId } = await engine.execute('test.op', {});
      const op = await engine.getOperation(operationId);
      expect(op.operation_id).toBe(operationId);
      expect(op.before).toEqual({});
      expect(await engine.getOperation('op_nope')).toBeNull();
    });

    test('getOperationsByTransaction should return ops for tx in created order', async () => {
      registerHandler('test.op');
      const a = await engine.execute('test.op', {}, { transactionId: 'tx_x' });
      const b = await engine.execute('test.op', {}, { transactionId: 'tx_x' });
      await engine.execute('test.op', {}, { transactionId: 'tx_other' });
      const ops = await engine.getOperationsByTransaction('tx_x');
      expect(ops.map(o => o.operation_id)).toEqual([a.operationId, b.operationId]);
    });

    test('getMemberHistory should match member_path and before/after paths', async () => {
      registerHandler('test.op');
      const direct = await engine.execute('test.op', { memberPath: 'm.md' });
      const byBefore = await engine.execute('test.op', { containerRid: SYSTEM, path: 'old.md' });
      await db.run('UPDATE container_operations SET before = ? WHERE operation_id = ?', [JSON.stringify({ path: 'old.md' }), byBefore.operationId]);
      const byAfter = await engine.execute('test.op', { containerRid: SYSTEM, memberPath: 'z.md' });
      await db.run('UPDATE container_operations SET after = ? WHERE operation_id = ?', [JSON.stringify({ newPath: 'z.md' }), byAfter.operationId]);

      const forM = await engine.getMemberHistory(SYSTEM, 'm.md');
      expect(forM.map(o => o.operation_id)).toEqual([direct.operationId]);
      const forOld = await engine.getMemberHistory(SYSTEM, 'old.md');
      expect(forOld.map(o => o.operation_id)).toEqual([byBefore.operationId]);
      const forNew = await engine.getMemberHistory(SYSTEM, 'z.md');
      expect(forNew.map(o => o.operation_id)).toEqual([byAfter.operationId]);
      const none = await engine.getMemberHistory(SYSTEM, 'nope.md');
      expect(none).toEqual([]);
    });
  });
});
