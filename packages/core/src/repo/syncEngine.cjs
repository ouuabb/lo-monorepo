/**
 * SyncEngine — 同步引擎
 *
 * Phase 5.10: 管理本地与远程仓库之间的资源同步。
 *
 * 策略:
 *   pull  — 从远程拉取 metadata
 *   push  — 推送本地变化到远程索引
 *   merge — 双向合并（生成 Conflict）
 *
 * 所有修改通过 Suggestion Pipeline 流转，不直接写入核心数据。
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const RemoteResource = require('../domain/remoteResource.cjs');
const GlobalRID = require('../domain/globalResourceId.cjs');
const Conflict = require('../domain/conflict.cjs');

class SyncEngine {
  /**
   * @param {import('./database.cjs')} db
   * @param {string} repoPath
   */
  constructor(db, repoPath) {
    this.db = db;
    this.repoPath = repoPath;
  }

  /**
   * 打开外部仓库的只读连接
   */
  _openReadOnly(dbPath) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) reject(err);
        else resolve(db);
      });
    });
  }

  _all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  _close(db) {
    return new Promise((resolve) => {
      db.close(() => resolve());
    });
  }

  /**
   * Pull: 从远程仓库拉取资源 metadata
   * @param {string} sourcePath - 远程仓库路径
   * @param {string} namespace - 远程仓库 namespace
   * @returns {Promise<{ imported: Array, conflicts: Array, status: object }>}
   */
  async pull(sourcePath, namespace) {
    const dbPath = path.join(sourcePath, '.repo', 'database.sqlite');
    let extDB;
    const result = { imported: [], conflicts: [], status: {} };

    try {
      extDB = await this._openReadOnly(dbPath);

      // 拉取资源
      const resources = await this._all(extDB,
        'SELECT rid, name, type, hash, created, updated FROM resources WHERE deleted = 0'
      );

      for (const r of resources) {
        const globalId = GlobalRID.create(namespace, r.rid);

        // 检查是否已存在
        const existing = await this.db.get(
          'SELECT * FROM remote_resources WHERE global_id = ?',
          [globalId]
        );

        const remoteRes = new RemoteResource({
          globalId,
          namespace,
          title: r.name || r.rid,
          type: r.type || 'note',
          hash: r.hash || '',
          source: sourcePath,
          lastSync: Date.now()
        });

        if (existing) {
          // 检查冲突
          const existingData = RemoteResource.fromRow(existing);
          if (existingData && existingData.hash !== r.hash) {
            const conflict = new Conflict({
              resource: globalId,
              type: 'content_conflict',
              local: existingData.toJSON(),
              remote: remoteRes.toJSON()
            });

            // 保存冲突
            await this.db.run(
              `INSERT INTO conflicts (id, resource, type, status, payload, created)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [conflict.id, globalId, 'content_conflict', 'pending',
                JSON.stringify(conflict.toJSON()), Date.now()]
            );

            result.conflicts.push(conflict);
          } else {
            // 更新 lastSync
            await this.db.run(
              'UPDATE remote_resources SET hash = ?, updated = ? WHERE global_id = ?',
              [r.hash || '', Date.now(), globalId]
            );
          }
        } else {
          // 导入新远程资源
          await this.db.run(
            `INSERT OR REPLACE INTO remote_resources (global_id, namespace, metadata, hash, updated)
             VALUES (?, ?, ?, ?, ?)`,
            [globalId, namespace, JSON.stringify({ title: r.name, type: r.type, source: sourcePath }),
              r.hash || '', Date.now()]
          );
          result.imported.push(remoteRes.toJSON());
        }
      }

      // 拉取关系
      const relations = await this._all(extDB,
        `SELECT r.from_rid, r.to_rid, r.type
         FROM relations r
         WHERE r.deleted = 0`
      );

      for (const r of relations) {
        const fromGlobal = GlobalRID.create(namespace, r.from_rid);
        const toGlobal = GlobalRID.create(namespace, r.to_rid);

        // 检查远程资源是否存在
        const hasFrom = await this.db.get(
          'SELECT global_id FROM remote_resources WHERE global_id = ?',
          [fromGlobal]
        );
        const hasTo = await this.db.get(
          'SELECT global_id FROM remote_resources WHERE global_id = ?',
          [toGlobal]
        );

        if (!hasFrom || !hasTo) continue; // 跳过孤立关系
      }

      // 记录同步
      await this._recordSync(namespace, 'pull', 'success', result.imported.length);

    } finally {
      if (extDB) await this._close(extDB);
    }

    result.status = {
      imported: result.imported.length,
      conflicts: result.conflicts.length,
      namespace
    };

    return result;
  }

  /**
   * Push: 导出本地资源索引到远程仓库的 remote_resources 表
   * （作为"被其他仓库 pull"的源）
   * @param {string} targetPath - 目标仓库路径
   * @param {string} namespace - 本地 namespace
   */
  async push(targetPath, namespace) {
    const dbPath = path.join(targetPath, '.repo', 'database.sqlite');
    let targetDB;

    try {
      targetDB = new sqlite3.Database(dbPath);

      // 确保远程表存在
      await new Promise((resolve, reject) => {
        targetDB.run(`
          CREATE TABLE IF NOT EXISTS remote_resources (
            global_id TEXT PRIMARY KEY,
            namespace TEXT,
            metadata TEXT DEFAULT '{}',
            hash TEXT,
            updated INTEGER
          )
        `, (err) => { if (err) reject(err); else resolve(); });
      });

      // 获取本地资源
      const resources = await this.db.all(
        'SELECT rid, name, type, hash, updated FROM resources WHERE deleted = 0'
      );

      let pushed = 0;
      for (const r of resources) {
        const globalId = GlobalRID.create(namespace, r.rid);

        await new Promise((resolve, reject) => {
          targetDB.run(
            `INSERT OR REPLACE INTO remote_resources (global_id, namespace, metadata, hash, updated)
             VALUES (?, ?, ?, ?, ?)`,
            [globalId, namespace,
              JSON.stringify({ title: r.name, type: r.type }),
              r.hash || '', Date.now()],
            (err) => { if (err) reject(err); else resolve(); }
          );
        });

        pushed++;
      }

      await this._recordSync(namespace, 'push', 'success', pushed);

      return { pushed, namespace };
    } finally {
      if (targetDB) {
        await new Promise((resolve) => targetDB.close(() => resolve()));
      }
    }
  }

  /**
   * 同步状态查询
   */
  async status() {
    const [localCount, remoteCount, relCount, conflictCount] = await Promise.all([
      this.db.get('SELECT COUNT(*) as c FROM resources WHERE deleted = 0'),
      this.db.get('SELECT COUNT(*) as c FROM remote_resources'),
      this.db.get('SELECT COUNT(*) as c FROM relations WHERE deleted = 0'),
      this.db.get("SELECT COUNT(*) as c FROM conflicts WHERE status = 'pending'")
    ]);

    const lastSync = await this.db.get(
      'SELECT * FROM sync_records ORDER BY created DESC LIMIT 1'
    );

    return {
      resources: localCount ? localCount.c : 0,
      remoteResources: remoteCount ? remoteCount.c : 0,
      relations: relCount ? relCount.c : 0,
      conflicts: conflictCount ? conflictCount.c : 0,
      lastSync: lastSync ? {
        type: lastSync.type,
        status: lastSync.status,
        created: lastSync.created
      } : null
    };
  }

  /**
   * 列出冲突
   */
  async listConflicts(options = {}) {
    const { status, limit = 50 } = options;

    let sql = 'SELECT * FROM conflicts';
    const params = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created DESC LIMIT ?';
    params.push(limit);

    const rows = await this.db.all(sql, params);
    return rows.map(r => {
      let payload = {};
      try { payload = JSON.parse(r.payload || '{}'); } catch {}
      return new Conflict({
        id: r.id,
        resource: r.resource,
        type: r.type,
        status: r.status,
        payload,
        created: r.created
      });
    });
  }

  /**
   * 解决冲突
   */
  async resolveConflict(conflictId, strategy) {
    const row = await this.db.get('SELECT * FROM conflicts WHERE id = ?', [conflictId]);
    if (!row) throw new Error(`Conflict not found: ${conflictId}`);

    let payload = {};
    try { payload = JSON.parse(row.payload || '{}'); } catch {}

    const conflict = new Conflict({
      id: row.id,
      resource: row.resource,
      type: row.type,
      local: payload.local,
      remote: payload.remote,
      payload
    });

    const result = conflict.resolve(strategy);

    await this.db.run(
      'UPDATE conflicts SET status = ?, payload = ? WHERE id = ?',
      ['resolved', JSON.stringify(conflict.toJSON()), conflictId]
    );

    return { conflict: conflict.toJSON(), result };
  }

  /**
   * 获取同步历史
   */
  async syncHistory(limit = 20) {
    const rows = await this.db.all(
      'SELECT * FROM sync_records ORDER BY created DESC LIMIT ?',
      [limit]
    );
    return rows.map(r => ({
      id: r.id,
      repository: r.repository,
      type: r.type,
      status: r.status,
      changes: r.changes,
      details: (() => { try { return JSON.parse(r.details || '{}'); } catch { return {}; } })(),
      created: r.created
    }));
  }

  /** @private */
  async _recordSync(repository, type, status, changeCount) {
    await this.db.run(
      'INSERT INTO sync_records (repository, type, status, changes, details, created) VALUES (?, ?, ?, ?, ?, ?)',
      [repository, type, status, changeCount, '{}', Date.now()]
    );
  }
}

module.exports = SyncEngine;
