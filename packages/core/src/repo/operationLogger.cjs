/**
 * OperationLogger - Container 操作历史与 Undo 系统
 *
 * 职责:
 *   - 记录所有 Container Member 操作（rename/remove/restore/move/copy）
 *   - 查询操作历史
 *   - 撤销（Undo）操作
 *
 * 不负责修改 Container Member 状态（由 ContainerService 负责）。
 *
 * Phase 4.2
 */

const crypto = require("crypto");

class OperationLogger {
  /**
   * @param {import('./database.cjs')} db
   * @param {import('./containerService.cjs')} containerService - 用于 undo 时调用反向操作
   */
  constructor(db, containerService = null) {
    this.db = db;
    this.containerService = containerService;
  }

  _genOpId() {
    return `op_${crypto.randomBytes(4).toString("hex")}`;
  }

  /**
   * 记录一次操作
   *
   * @param {object} params
   * @param {string} params.containerRid
   * @param {string} params.type - member_renamed | member_removed | member_restored | member_moved | member_copied
   * @param {number} [params.memberId]
   * @param {string} [params.memberPath]
   * @param {number} [params.sourceId]
   * @param {object} [params.before] - 操作前状态快照
   * @param {object} [params.after] - 操作后状态快照
   * @returns {Promise<{ operationId: string }>}
   */
  async recordOp({
    containerRid,
    type,
    memberId = null,
    memberPath = null,
    sourceId = null,
    before = null,
    after = null,
  }) {
    const operationId = this._genOpId();
    const created = Date.now();

    await this.db.run(
      `INSERT INTO container_operations (operation_id, container_rid, type, member_id, member_path, source_id, before, after, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        operationId,
        containerRid,
        type,
        memberId,
        memberPath,
        sourceId,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        created,
      ],
    );

    return { operationId };
  }

  /**
   * 获取容器的操作历史（按时间倒序）
   *
   * @param {string} containerRid
   * @param {{ limit?: number, type?: string }} options
   * @returns {Promise<Array>}
   */
  async getHistory(containerRid, options = {}) {
    const { limit = 50, type = null } = options;

    let sql = "SELECT * FROM container_operations WHERE container_rid = ?";
    const params = [containerRid];

    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }

    sql += " ORDER BY created DESC LIMIT ?";
    params.push(limit);

    const rows = await this.db.all(sql, params);
    return rows.map((r) => ({
      ...r,
      before: r.before ? JSON.parse(r.before) : null,
      after: r.after ? JSON.parse(r.after) : null,
    }));
  }

  /**
   * 获取特定成员的操作历史
   *
   * @param {string} containerRid
   * @param {string} memberPath
   * @returns {Promise<Array>}
   */
  async getMemberHistory(containerRid, memberPath) {
    // 按路径匹配（考虑 rename 后的路径变化）
    const rows = await this.db.all(
      `SELECT * FROM container_operations
       WHERE container_rid = ?
       ORDER BY created DESC`,
      [containerRid],
    );

    // 过滤出涉及该路径的操作（包括 before.path 和 after.path）
    return rows
      .map((r) => {
        const before = r.before ? JSON.parse(r.before) : null;
        const after = r.after ? JSON.parse(r.after) : null;
        const matches =
          r.member_path === memberPath ||
          (before &&
            (before.path === memberPath || before.old_path === memberPath)) ||
          (after &&
            (after.path === memberPath ||
              after.new_path === memberPath ||
              after.target_path === memberPath));
        return matches ? { ...r, before, after } : null;
      })
      .filter(Boolean);
  }

  /**
   * 获取单个操作记录
   */
  async getOperation(operationId) {
    const row = await this.db.get(
      "SELECT * FROM container_operations WHERE operation_id = ?",
      [operationId],
    );
    if (!row) return null;
    return {
      ...row,
      before: row.before ? JSON.parse(row.before) : null,
      after: row.after ? JSON.parse(row.after) : null,
    };
  }

  /**
   * 撤销操作
   *
   * undo 不是删除历史，而是产生一个新的反向操作。
   *
   * @param {string} operationId
   * @returns {Promise<{ undone: boolean, undoOpId: string }>}
   */
  async undo(operationId) {
    if (!this.containerService) {
      throw new Error("OperationLogger 未注入 ContainerService，无法执行 undo");
    }

    const op = await this.getOperation(operationId);
    if (!op) {
      throw new Error(`操作不存在: ${operationId}`);
    }

    // 检查是否已经被撤销（查找类型为 undo_+type 的新操作）
    const existingUndo = await this.db.get(
      `SELECT id FROM container_operations WHERE type = ? AND created > ? AND container_rid = ?`,
      [`undo_${op.type}`, op.created, op.container_rid],
    );
    if (existingUndo) {
      throw new Error(`操作已被撤销: ${operationId}`);
    }

    const before = op.before || {};
    const after = op.after || {};
    let undoResult;

    switch (op.type) {
      case "member_renamed": {
        // rename: a→b, undo: b→a
        undoResult = await this.containerService.renameMember(
          op.container_rid,
          after.path || after.new_path || op.member_path,
          before.path || op.member_path,
        );
        break;
      }

      case "member_removed": {
        // remove: indexed→deleted, undo: restore
        undoResult = await this.containerService.restoreMember(
          op.container_rid,
          op.member_path,
        );
        break;
      }

      case "member_restored": {
        // restore: deleted→indexed, undo: remove
        undoResult = await this.containerService.removeMember(
          op.container_rid,
          op.member_path,
        );
        break;
      }

      case "member_moved": {
        // move: A→B, undo: B→A
        const originalContainer = before.container || before.container_rid;
        undoResult = await this.containerService.moveMember(
          op.container_rid,
          op.member_path,
          originalContainer,
        );
        break;
      }

      case "member_copied": {
        // copy: undo = soft-delete the copy
        undoResult = await this.containerService.removeMember(
          after.container || op.container_rid,
          op.member_path,
        );
        break;
      }

      default:
        throw new Error(`不支持撤销的操作类型: ${op.type}`);
    }

    // 记录 undo 操作本身
    await this.recordOp({
      containerRid: op.container_rid,
      type: `undo_${op.type}`,
      memberId: op.member_id,
      memberPath: op.member_path,
      sourceId: op.source_id,
      before: { undone_operation: operationId },
      after: { undo_type: op.type, ...undoResult },
    });

    return { undone: true, undoOpId: operationId };
  }
}

module.exports = OperationLogger;
