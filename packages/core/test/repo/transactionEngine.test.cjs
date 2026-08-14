const path = require('path');
const Database = require('../../src/repo/database.cjs');
const TransactionEngine = require('../../src/repo/transactionEngine.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('TransactionEngine', () => {
  let tempDir, db, opEngine, txEngine;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    opEngine = {
      execute: jest.fn(async (type, params, options) => ({ operationId: 'op_1', result: { type, params, options } })),
      getOperationsByTransaction: jest.fn(async () => []),
      undo: jest.fn(async (operationId) => ({ undone: true, operationId }))
    };
    txEngine = new TransactionEngine(db, opEngine);
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, path, hash, metadata, encrypted, created, updated, deleted)
       VALUES ('other', 'other', 0, 'container', '/other', '', '{}', 0, ?, ?, 0)`,
      [Date.now(), Date.now()]
    );
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  describe('begin', () => {
    test('should insert an active transaction and return its id', async () => {
      const { transactionId } = await txEngine.begin({ containerRid: '__system__', type: 'container.scan', description: 'scan' });
      expect(transactionId).toMatch(/^tx_[0-9a-f]{8}$/);
      const row = await db.get('SELECT * FROM container_transactions WHERE transaction_id = ?', [transactionId]);
      expect(row).not.toBeNull();
      expect(row.status).toBe('active');
      expect(row.container_rid).toBe('__system__');
      expect(row.type).toBe('container.scan');
      expect(row.description).toBe('scan');
      await txEngine.rollback(transactionId);
    });

    test('should allow null description', async () => {
      const { transactionId } = await txEngine.begin({ containerRid: '__system__', type: 'x' });
      const row = await db.get('SELECT description FROM container_transactions WHERE transaction_id = ?', [transactionId]);
      expect(row.description).toBeNull();
      await txEngine.rollback(transactionId);
    });
  });

  describe('execute', () => {
    test('should delegate to operationEngine with transactionId', async () => {
      const { transactionId } = await txEngine.begin({ containerRid: '__system__', type: 't' });
      const result = await txEngine.execute(transactionId, 'member.add', { path: 'a.md' }, { actor: 'bob' });
      expect(result.result.type).toBe('member.add');
      expect(opEngine.execute).toHaveBeenCalledWith('member.add', { path: 'a.md' }, { actor: 'bob', transactionId });
      await txEngine.rollback(transactionId);
    });

    test('should throw when transaction does not exist', async () => {
      await expect(txEngine.execute('tx_nope', 'member.add', {})).rejects.toThrow('事务不存在');
    });

    test('should throw when transaction is not active', async () => {
      const { transactionId } = await txEngine.begin({ containerRid: '__system__', type: 't' });
      await db.run("UPDATE container_transactions SET status = 'committed' WHERE transaction_id = ?", [transactionId]);
      await expect(txEngine.execute(transactionId, 'member.add', {})).rejects.toThrow('事务状态不是 active');
    });
  });

  describe('commit', () => {
    test('should mark transaction committed', async () => {
      const { transactionId } = await txEngine.begin({ containerRid: '__system__', type: 't' });
      const result = await txEngine.commit(transactionId);
      expect(result).toEqual({ committed: true });
      const row = await db.get('SELECT status, completed FROM container_transactions WHERE transaction_id = ?', [transactionId]);
      expect(row.status).toBe('committed');
      expect(row.completed).not.toBeNull();
    });

    test('should throw when transaction does not exist', async () => {
      await expect(txEngine.commit('tx_nope')).rejects.toThrow('事务不存在');
    });

    test('should rollback and throw when transaction is not active', async () => {
      const { transactionId } = await txEngine.begin({ containerRid: '__system__', type: 't' });
      await db.run("UPDATE container_transactions SET status = 'rolled_back' WHERE transaction_id = ?", [transactionId]);
      await expect(txEngine.commit(transactionId)).rejects.toThrow('事务状态不是 active');
    });

    test('should mark transaction failed and rethrow when commit fails', async () => {
      const { transactionId } = await txEngine.begin({ containerRid: '__system__', type: 't' });
      jest.spyOn(txEngine, '_commitSqlite').mockRejectedValue(new Error('commit boom'));
      await expect(txEngine.commit(transactionId)).rejects.toThrow('commit boom');
      const row = await db.get('SELECT status, error FROM container_transactions WHERE transaction_id = ?', [transactionId]);
      expect(row.status).toBe('failed');
      expect(row.error).toBe('commit boom');
    });
  });

  describe('rollback', () => {
    test('should rollback an active transaction with no undos', async () => {
      const { transactionId } = await txEngine.begin({ containerRid: '__system__', type: 't' });
      const result = await txEngine.rollback(transactionId);
      expect(result).toEqual({ rolledBack: true, undos: 0 });
      expect(opEngine.getOperationsByTransaction).not.toHaveBeenCalled();
      const row = await db.get('SELECT status FROM container_transactions WHERE transaction_id = ?', [transactionId]);
      expect(row.status).toBe('rolled_back');
    });

    test('should undo operations of a committed transaction', async () => {
      opEngine.getOperationsByTransaction.mockResolvedValue([
        { operation_id: 'op_a', status: 'success' },
        { operation_id: 'op_b', status: 'success' }
      ]);
      opEngine.undo.mockResolvedValueOnce({ undone: true }).mockRejectedValueOnce(new Error('undo fail'));
      const { transactionId } = await txEngine.begin({ containerRid: '__system__', type: 't' });
      await txEngine.commit(transactionId);

      const result = await txEngine.rollback(transactionId);
      expect(opEngine.getOperationsByTransaction).toHaveBeenCalledWith(transactionId);
      expect(opEngine.undo).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ rolledBack: true, undos: 1 });
      const row = await db.get('SELECT status, error FROM container_transactions WHERE transaction_id = ?', [transactionId]);
      expect(row.status).toBe('rolled_back');
      expect(row.error).toContain('1 undos');
    });

    test('should throw when transaction does not exist', async () => {
      await expect(txEngine.rollback('tx_nope')).rejects.toThrow('事务不存在');
    });
  });

  describe('query helpers', () => {
    test('getTransactions should list transactions for a container', async () => {
      const a = await txEngine.begin({ containerRid: '__system__', type: 'a' });
      await txEngine.rollback(a.transactionId);
      const b = await txEngine.begin({ containerRid: '__system__', type: 'b' });
      await txEngine.rollback(b.transactionId);
      const c = await txEngine.begin({ containerRid: 'other', type: 'c' });
      await txEngine.rollback(c.transactionId);
      const rows = await txEngine.getTransactions('__system__');
      expect(rows.map(r => r.transaction_id)).toEqual([b.transactionId, a.transactionId]);
      const limited = await txEngine.getTransactions('__system__', { limit: 1 });
      expect(limited).toHaveLength(1);
    });

    test('getTransaction should return null for missing transaction', async () => {
      expect(await txEngine.getTransaction('tx_nope')).toBeNull();
    });

    test('getTransaction should attach operations', async () => {
      opEngine.getOperationsByTransaction.mockResolvedValue([{ operation_id: 'op_a' }]);
      const { transactionId } = await txEngine.begin({ containerRid: '__system__', type: 't' });
      const detail = await txEngine.getTransaction(transactionId);
      expect(detail.transaction_id).toBe(transactionId);
      expect(detail.operations).toEqual([{ operation_id: 'op_a' }]);
      await txEngine.rollback(transactionId);
    });
  });

  describe('_genTxId', () => {
    test('should generate unique hex ids', () => {
      const a = txEngine._genTxId();
      const b = txEngine._genTxId();
      expect(a).toMatch(/^tx_[0-9a-f]{8}$/);
      expect(a).not.toBe(b);
    });
  });
});
