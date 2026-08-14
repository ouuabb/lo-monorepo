/**
 * TransactionEngine - SQLite 事务包装引擎
 *
 * 职责:
 *   1. 包装 SQLite BEGIN/COMMIT/ROLLBACK 保证 DB 原子性
 *   2. 管理 container_transactions 业务事务记录
 *   3. 失败时自动 undo 已执行的操作
 *
 * 两层事务:
 *   - SQLite Transaction: 保证 DB 状态原子性（异常恢复）
 *   - Container Transaction: 保证业务操作可撤销（undo）
 *
 * Phase 4.4
 */

const crypto = require("crypto");

class TransactionEngine {
  /**
   * @param {import('./database.cjs')} db
   * @param {import('./operationEngine.cjs')} operationEngine
   */
  constructor(db, operationEngine) {
    this.db = db;
    this.operationEngine = operationEngine;
  }

  _genTxId() {
    return `tx_${crypto.randomBytes(4).toString("hex")}`;
  }

  /**
   * 开始事务
   *
   * @param {{ containerRid: string, type: string, description?: string }} params
   * @returns {Promise<{ transactionId: string }>}
   */
  async begin({ containerRid, type, description = null }) {
    const transactionId = this._genTxId();
    const now = Date.now();

    await this.db.run(
      `INSERT INTO container_transactions (transaction_id, container_rid, type, description, status, created)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [transactionId, containerRid, type, description, now],
    );

    // 开始 SQLite 事务
    await this._beginSqlite();

    return { transactionId };
  }

  /**
   * 在事务中执行操作
   *
   * @param {string} transactionId
   * @param {string} type - 操作类型
   * @param {object} params - handler 参数
   * @param {{ actor?: string }} options
   * @returns {Promise<{ operationId: string, result: object }>}
   */
  async execute(transactionId, type, params, options = {}) {
    // 验证事务存在且处于 active 状态
    const tx = await this.db.get(
      "SELECT status FROM container_transactions WHERE transaction_id = ?",
      [transactionId],
    );
    if (!tx) throw new Error(`事务不存在: ${transactionId}`);
    if (tx.status !== "active")
      throw new Error(`事务状态不是 active: ${tx.status}`);

    return this.operationEngine.execute(type, params, {
      ...options,
      transactionId,
    });
  }

  /**
   * 提交事务
   *
   * @param {string} transactionId
   * @returns {Promise<{ committed: boolean }>}
   */
  async commit(transactionId) {
    // 验证事务状态
    const txBefore = await this.db.get(
      "SELECT status FROM container_transactions WHERE transaction_id = ?",
      [transactionId],
    );
    if (!txBefore) throw new Error(`事务不存在: ${transactionId}`);
    if (txBefore.status !== "active") {
      await this._rollbackSqlite();
      throw new Error(`事务状态不是 active: ${txBefore.status}`);
    }

    try {
      await this._commitSqlite();
      await this.db.run(
        `UPDATE container_transactions SET status = 'committed', completed = ? WHERE transaction_id = ?`,
        [Date.now(), transactionId],
      );
      return { committed: true };
    } catch (err) {
      await this._rollbackSqlite();
      await this.db.run(
        `UPDATE container_transactions SET status = 'failed', error = ?, completed = ? WHERE transaction_id = ?`,
        [err.message, Date.now(), transactionId],
      );
      throw err;
    }
  }

  /**
   * 回滚事务（DB + 业务 undo）
   *
   * @param {string} transactionId
   * @returns {Promise<{ rolledBack: boolean, undos: number }>}
   */
  async rollback(transactionId) {
    const tx = await this.db.get(
      "SELECT status FROM container_transactions WHERE transaction_id = ?",
      [transactionId],
    );
    if (!tx) throw new Error(`事务不存在: ${transactionId}`);

    let undoCount = 0;

    // 对于已提交的事务，需要业务 undo（逆序撤销所有操作）
    if (tx.status === "committed") {
      const ops =
        await this.operationEngine.getOperationsByTransaction(transactionId);
      for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i];
        if (op.status === "success" || op.status === "rolled_back") {
          try {
            await this.operationEngine.undo(op.operation_id);
            undoCount++;
          } catch (e) {
            // 继续 undo 剩余操作
            console.error(
              `[tx rollback] undo ${op.operation_id} 失败:`,
              e.message,
            );
          }
        }
      }
    }

    // SQLite ROLLBACK：active tx 时恢复未提交的 DB 变更；committed tx 时是 no-op
    await this._rollbackSqlite();

    // 标记事务状态
    await this.db.run(
      `UPDATE container_transactions SET status = 'rolled_back', completed = ?, error = ? WHERE transaction_id = ?`,
      [Date.now(), `Rolled back with ${undoCount} undos`, transactionId],
    );

    return { rolledBack: true, undos: undoCount };
  }

  /**
   * 获取容器的事务列表
   */
  async getTransactions(containerRid, options = {}) {
    const { limit = 50 } = options;
    return this.db.all(
      `SELECT * FROM container_transactions WHERE container_rid = ? ORDER BY created DESC LIMIT ?`,
      [containerRid, limit],
    );
  }

  /**
   * 获取单个事务详情（含操作列表）
   */
  async getTransaction(transactionId) {
    const tx = await this.db.get(
      "SELECT * FROM container_transactions WHERE transaction_id = ?",
      [transactionId],
    );
    if (!tx) return null;

    const operations =
      await this.operationEngine.getOperationsByTransaction(transactionId);
    return { ...tx, operations };
  }

  // ── SQLite 事务原语 ──

  async _beginSqlite() {
    await this.db.run("BEGIN TRANSACTION");
  }

  async _commitSqlite() {
    await this.db.run("COMMIT");
  }

  async _rollbackSqlite() {
    try {
      await this.db.run("ROLLBACK");
    } catch (e) {
      // ROLLBACK 失败通常是因为没有活跃事务，忽略
    }
  }
}

module.exports = TransactionEngine;
