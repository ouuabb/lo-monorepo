const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs-extra");
const Logger = require("../utils/logger.cjs");
const { assertMetadata } = require("../utils/validateMetadata.cjs");

/**
 * 同步操作日志引擎
 *
 * 记录仓库中每一次资源变更操作为可序列化的操作日志条目，
 * 支持跨设备同步时按时间戳重放。
 */

// 操作类型常量
const OP_TYPES = {
  RESOURCE_CREATED: "resource_created",
  RESOURCE_UPDATED: "resource_updated",
  RESOURCE_DELETED: "resource_deleted",
  RESOURCE_MOVED: "resource_moved",
  RESOURCE_TAGGED: "resource_tagged",
  MEMBER_PROMOTED: "member_promoted",
  CONTAINER_SCANNED: "container_scanned",
};

class SyncOpsEngine {
  /**
   * @param {import('./database.cjs')} db
   * @param {string} repoPath
   */
  constructor(db, repoPath) {
    this.db = db;
    this.repoPath = repoPath;
    this._deviceId = null;
  }

  /**
   * 获取当前设备 ID（持久化在 sync_config 中）
   */
  async getDeviceId() {
    if (this._deviceId) return this._deviceId;

    const row = await this.db.get(
      "SELECT value FROM sync_config WHERE key = ?",
      ["sync.device_id"],
    );

    if (row && row.value) {
      this._deviceId = row.value;
      return this._deviceId;
    }

    // 生成新的设备 ID
    this._deviceId = uuidv4();
    await this.db.run(
      "INSERT OR REPLACE INTO sync_config (key, value) VALUES (?, ?)",
      ["sync.device_id", this._deviceId],
    );
    return this._deviceId;
  }

  /**
   * 记录一条操作日志
   * @param {string} opType - 操作类型（见 OP_TYPES）
   * @param {string} rid - 资源 RID
   * @param {object} data - 操作数据
   * @returns {Promise<string>} op_id
   */
  async recordOp(opType, rid, data) {
    const deviceId = await this.getDeviceId();
    const opId = uuidv4();
    const timestamp = Date.now();

    await this.db.run(
      `INSERT INTO sync_ops (op_id, op_type, rid, data, timestamp, device_id, applied)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [opId, opType, rid, JSON.stringify(data), timestamp, deviceId],
    );

    return opId;
  }

  /**
   * 获取所有设备的所有操作日志（用于与远程清单对比计算差集）
   * @returns {Promise<Array>}
   */
  async getAllOps() {
    return this.db.all(`SELECT * FROM sync_ops ORDER BY timestamp ASC`);
  }

  /**
   * 获取自指定锚点以来所有未同步的操作
   * @param {object} anchor - 远程锚点 { last_op_timestamp, last_op_id }
   * @returns {Promise<Array>} 操作日志条目列表
   */
  async getUnsyncedOps(anchor = null) {
    const deviceId = await this.getDeviceId();

    if (!anchor || !anchor.last_op_timestamp) {
      // 首次同步：返回本设备所有操作
      return this.db.all(
        `SELECT * FROM sync_ops WHERE device_id = ? ORDER BY timestamp ASC`,
        [deviceId],
      );
    }

    // 增量同步：返回锚点之后的操作
    return this.db.all(
      `SELECT * FROM sync_ops
       WHERE device_id = ?
         AND (timestamp > ? OR (timestamp = ? AND id > (
           SELECT COALESCE((SELECT id FROM sync_ops WHERE op_id = ?), 0)
         )))
       ORDER BY timestamp ASC`,
      [
        deviceId,
        anchor.last_op_timestamp,
        anchor.last_op_timestamp,
        anchor.last_op_id || "",
      ],
    );
  }

  /**
   * 获取所有设备在指定时间戳之后的操作（用于接收方拉取增量）
   * @param {number} sinceTimestamp
   * @returns {Promise<Array>}
   */
  async getOpsSince(sinceTimestamp) {
    return this.db.all(
      `SELECT * FROM sync_ops WHERE timestamp > ? ORDER BY timestamp ASC`,
      [sinceTimestamp],
    );
  }

  /**
   * 应用一个操作批次
   *
   * 对每个操作逐条 apply，遇到冲突时：
   *   - 同一资源两边都有编辑 → 保留时间戳较新的版本，旧版另存为 .conflict
   *   - delete vs edit → 保留 edit 版本
   *
   * @param {Array} ops - 操作日志条目数组
   * @param {import('./repository.cjs')} repository
   * @param {{ dryRun?: boolean }} options
   * @returns {Promise<{ applied: number, conflicts: Array, errors: Array }>}
   */
  async applyOps(ops, repository, options = {}) {
    const { dryRun = false } = options;
    const results = { applied: 0, conflicts: [], errors: [] };

    for (const op of ops) {
      try {
        const conflict = await this._applyOp(op, repository, dryRun);
        if (conflict) {
          results.conflicts.push(conflict);
        } else {
          results.applied++;
        }
      } catch (err) {
        results.errors.push({
          op_id: op.op_id,
          op_type: op.op_type,
          error: err.message,
        });
      }
    }

    return results;
  }

  /**
   * 应用单条操作
   * @returns {Promise<object|null>} 冲突信息，无冲突返回 null
   */
  async _applyOp(op, repository, dryRun) {
    const data = typeof op.data === "string" ? JSON.parse(op.data) : op.data;
    const opId = op.op_id;
    const opType = op.op_type;
    const rid = op.rid;
    const opTimestamp = op.timestamp;

    // 检查是否已应用（幂等性）
    const existing = await this.db.get(
      "SELECT id FROM sync_ops WHERE op_id = ?",
      [opId],
    );
    if (existing) {
      return null; // 已应用，跳过
    }

    if (dryRun) return null;

    switch (opType) {
      case OP_TYPES.RESOURCE_CREATED: {
        // 资源文件应该已经随批次一起传输到了正确位置
        const hasFile =
          data.path && typeof data.path === "string" && data.path.length > 0;
        const absPath = hasFile ? path.join(this.repoPath, data.path) : "";

        // 有文件：检查文件是否存在；无文件（虚拟资源）：直接创建
        if (!hasFile || (await fs.pathExists(absPath))) {
          const validatedMeta = assertMetadata(
            data.metadata || {},
            "syncOps.applyOp:RESOURCE_CREATED",
            { lenient: true, resourceType: data.type },
          );
          await this.db.run(
            `INSERT OR IGNORE INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
              rid,
              data.name ||
                (hasFile
                  ? path
                      .basename(data.path, path.extname(data.path))
                      .replace(/^\d{4}-\d{2}-\d{2}-/, "")
                  : data.name || rid),
              data.layer || 0,
              data.type,
              hasFile ? "local" : "virtual",
              hasFile ? data.path : "",
              data.hash,
              JSON.stringify(validatedMeta),
              data.encrypted ? 1 : 0,
              data.created || opTimestamp,
              data.updated || opTimestamp,
            ],
          );
        }
        break;
      }

      case OP_TYPES.RESOURCE_UPDATED: {
        // 更新资源：检查冲突
        const local = await this.db.get(
          "SELECT * FROM resources WHERE rid = ? AND deleted = 0",
          [rid],
        );

        if (
          local &&
          local.hash !== data.old_hash &&
          local.updated > opTimestamp
        ) {
          // 冲突：本地在远程修改之后也改了
          if (local.hash === data.new_hash) {
            // 内容相同，无需处理
            break;
          }

          // 本地保持不变，远程版本自动入栈
          const resourceName = local.name || data.name || "";
          const remotePath = data.new_path || data.path;

          // 找下一个可用栈层（从 layer=1 开始）
          const stack = await this.db.all(
            "SELECT layer FROM resources WHERE name = ? AND deleted = 0 ORDER BY layer ASC",
            [resourceName],
          );
          const usedLayers = new Set(stack.map((r) => r.layer));
          let targetLayer = 1;
          while (usedLayers.has(targetLayer) && targetLayer < 20) {
            targetLayer++;
          }

          if (targetLayer >= 20) {
            // 栈满，回退到 .conflict 文件方式
            const conflictPath = remotePath.replace(
              /(\.loec)?$/,
              ".conflict$&",
            );
            const localMeta =
              typeof local.metadata === "string"
                ? JSON.parse(local.metadata)
                : local.metadata || {};
            const conflictMeta = assertMetadata(
              { ...localMeta, conflict: true, original_rid: rid },
              "syncOps.applyOp:conflict_backup",
              { lenient: true, resourceType: local.type },
            );
            await this.db.run(
              `INSERT OR REPLACE INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [
                `${rid}_conflict_${Date.now()}`,
                resourceName,
                0,
                local.type,
                "local",
                conflictPath,
                local.hash,
                JSON.stringify(conflictMeta),
                local.encrypted ? 1 : 0,
                local.created,
                local.updated,
              ],
            );
            return {
              rid,
              path: data.path,
              type: "edit_edit",
              remote_version: data.new_hash,
              local_version: local.hash,
              resolved: "remote_wins_with_backup",
              conflictPath,
            };
          }

          // 远程版本入栈，使用确定性 RID 避免身份分叉
          const stackRid = `${rid}_stack_${targetLayer}`;
          const remoteMeta = data.metadata
            ? typeof data.metadata === "string"
              ? JSON.parse(data.metadata)
              : data.metadata
            : {};
          const stackedMeta = assertMetadata(
            {
              ...remoteMeta,
              stacked: true,
              conflict_source: "remote",
              original_rid: rid,
            },
            "syncOps.applyOp:stack_conflict",
            { lenient: true, resourceType: local.type || data.type },
          );

          await this.db.run(
            `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
              stackRid,
              resourceName,
              targetLayer,
              local.type || data.type || "note",
              "local",
              remotePath,
              data.new_hash || data.hash,
              JSON.stringify(stackedMeta),
              local.encrypted ? 1 : 0,
              opTimestamp,
              opTimestamp,
            ],
          );

          Logger.warn(
            `冲突已入栈: "${resourceName}" → layer ${targetLayer} (本地版本保留为活跃层)`,
          );

          return {
            rid,
            path: data.path,
            type: "edit_edit",
            remote_version: data.new_hash,
            local_version: local.hash,
            resolved: "local_preserved_remote_stacked",
            stackLayer: targetLayer,
            stackRid,
          };
        }

        // 无冲突：直接更新
        const validatedMeta = assertMetadata(
          data.metadata || {},
          "syncOps.applyOp:RESOURCE_UPDATED",
          { lenient: true, resourceType: data.type },
        );
        await this.db.run(
          `UPDATE resources SET hash = ?, metadata = ?, updated = ? WHERE rid = ? AND deleted = 0`,
          [data.new_hash, JSON.stringify(validatedMeta), opTimestamp, rid],
        );
        break;
      }

      case OP_TYPES.RESOURCE_DELETED: {
        // 删除资源：检查本地是否有未同步的编辑
        const local = await this.db.get(
          "SELECT * FROM resources WHERE rid = ? AND deleted = 0",
          [rid],
        );

        if (local && local.updated > opTimestamp) {
          // 本地有新编辑 → 保留
          return {
            rid,
            path: data.path,
            type: "delete_edit",
            local_version: local.hash,
            remote_action: "deleted",
            resolved: "local_edit_preserved",
          };
        }

        // 正常删除
        await this.db.run(
          `UPDATE resources SET deleted = 1, updated = ? WHERE rid = ?`,
          [opTimestamp, rid],
        );

        // 删除磁盘文件
        const filePath = path.join(this.repoPath, data.path);
        try {
          await fs.remove(filePath);
        } catch (e) {
          Logger.error("syncOps: 删除资源文件失败", e);
        }
        break;
      }

      case OP_TYPES.RESOURCE_MOVED: {
        // data.new_path 为仓库内相对路径（recordOp 时相对化）
        await this.db.run(
          `UPDATE resources SET location_kind = 'local', location = ?, updated = ? WHERE rid = ? AND deleted = 0`,
          [data.new_path, opTimestamp, rid],
        );
        break;
      }

      case OP_TYPES.RESOURCE_TAGGED: {
        // 标签变更：更新 metadata
        const local = await this.db.get(
          "SELECT metadata FROM resources WHERE rid = ? AND deleted = 0",
          [rid],
        );
        if (local) {
          const meta =
            typeof local.metadata === "string"
              ? JSON.parse(local.metadata)
              : local.metadata;
          meta.tags = data.tags;
          const validatedMeta = assertMetadata(
            meta,
            "syncOps.applyOp:RESOURCE_TAGGED",
            { lenient: true, resourceType: local.type },
          );
          await this.db.run(
            `UPDATE resources SET metadata = ?, updated = ? WHERE rid = ?`,
            [JSON.stringify(validatedMeta), opTimestamp, rid],
          );
        }
        break;
      }

      default:
        break;
    }

    // 标记操作已应用
    await this.db.run(
      `INSERT OR IGNORE INTO sync_ops (op_id, op_type, rid, data, timestamp, device_id, applied)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [opId, opType, rid, JSON.stringify(data), opTimestamp, op.device_id],
    );

    return null;
  }

  /**
   * 获取远程同步锚点
   * @param {string} remoteId - 远程标识
   * @returns {Promise<object|null>}
   */
  async getAnchor(remoteId) {
    const row = await this.db.get(
      "SELECT value FROM sync_config WHERE key = ?",
      [`sync.anchor.${remoteId}`],
    );
    return row ? JSON.parse(row.value) : null;
  }

  /**
   * 设置远程同步锚点
   * @param {string} remoteId
   * @param {object} anchor { last_op_id, last_op_timestamp }
   */
  async setAnchor(remoteId, anchor) {
    await this.db.run(
      "INSERT OR REPLACE INTO sync_config (key, value) VALUES (?, ?)",
      [`sync.anchor.${remoteId}`, JSON.stringify(anchor)],
    );
  }

  /**
   * 获取最近的同步操作时间戳（作为全局同步锚点）
   */
  async getLastSyncedTimestamp() {
    const row = await this.db.get(
      "SELECT MAX(timestamp) as ts FROM sync_ops WHERE applied = 1",
    );
    return row ? row.ts || 0 : 0;
  }
}

SyncOpsEngine.OP_TYPES = OP_TYPES;

module.exports = SyncOpsEngine;
