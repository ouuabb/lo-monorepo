/**
 * FederationManager — 联邦仓库管理器
 *
 * Phase 5.10: 管理多个 Knowledge Repository 的注册、发现和联通。
 *
 * 核心职责:
 *   - registerRepository() — 注册外部仓库
 *   - removeRepository()   — 移除联邦成员
 *   - listRepositories()   — 列出所有联邦仓库
 *   - resolveResource()    — 在联邦中查找资源
 *
 * Repository 仍然独立，不合并数据库。
 */

const path = require('path');
const fs = require('fs-extra');

class FederationManager {
  /**
   * @param {import('./database.cjs')} db
   * @param {string} repoPath - 当前仓库路径
   */
  constructor(db, repoPath) {
    this.db = db;
    this.repoPath = repoPath;
  }

  /**
   * 注册一个联邦仓库
   * @param {{ name: string, namespace: string, path: string }} options
   */
  async register(options) {
    const { name, namespace, repoPath } = options;

    if (!name || !namespace || !repoPath) {
      throw new Error('register: name, namespace, and path are required');
    }

    // 验证路径存在且是 lo 仓库
    const dbPath = path.join(repoPath, '.repo', 'database.sqlite');
    if (!await fs.pathExists(dbPath)) {
      throw new Error(`Not a valid lo repository: ${repoPath} (no .repo/database.sqlite found)`);
    }

    // 检查是否已注册
    const existing = await this.db.get(
      'SELECT id FROM repositories WHERE namespace = ? OR path = ?',
      [namespace, repoPath]
    );
    if (existing) {
      throw new Error(`Repository already registered: namespace="${namespace}" or path="${repoPath}"`);
    }

    const id = `repo_${Date.now().toString(36)}`;
    await this.db.run(
      'INSERT INTO repositories (id, namespace, name, path, created) VALUES (?, ?, ?, ?, ?)',
      [id, namespace, name, repoPath, Date.now()]
    );

    return { id, name, namespace, path: repoPath };
  }

  /**
   * 移除联邦仓库
   */
  async remove(namespaceOrName) {
    const row = await this.db.get(
      'SELECT * FROM repositories WHERE namespace = ? OR name = ?',
      [namespaceOrName, namespaceOrName]
    );
    if (!row) {
      throw new Error(`Repository not found: ${namespaceOrName}`);
    }

    await this.db.run('DELETE FROM repositories WHERE id = ?', [row.id]);

    // 同时清理相关远程资源和同步记录
    await this.db.run('DELETE FROM remote_resources WHERE namespace = ?', [row.namespace]);
    await this.db.run('DELETE FROM sync_records WHERE repository = ?', [row.id]);

    return { removed: row.namespace };
  }

  /**
   * 列出所有联邦仓库
   */
  async list() {
    const rows = await this.db.all(
      'SELECT * FROM repositories ORDER BY created'
    );
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      namespace: r.namespace,
      path: r.path,
      created: r.created
    }));
  }

  /**
   * 在联邦中查找资源
   * @param {string} ridOrName - 资源 ID 或名称
   * @returns {Promise<Array<{ globalId: string, source: string, namespace: string, type: string }>>}
   */
  async resolveResource(ridOrName) {
    const results = [];

    // 1. 查找本地
    const local = await this.db.get(
      'SELECT rid, name, type FROM resources WHERE (rid = ? OR name = ?) AND deleted = 0',
      [ridOrName, ridOrName]
    );
    if (local) {
      results.push({
        globalId: ridOrName,
        source: 'local',
        namespace: 'local',
        rid: local.rid,
        name: local.name,
        type: local.type
      });
    }

    // 2. 查找远程资源
    const remote = await this.db.all(
      'SELECT * FROM remote_resources WHERE global_id = ? OR namespace = ?',
      [ridOrName, ridOrName]
    );
    for (const r of remote) {
      let meta = {};
      try { meta = JSON.parse(r.metadata || '{}'); } catch {}
      results.push({
        globalId: r.global_id,
        source: 'remote',
        namespace: r.namespace,
        type: meta.type || 'note',
        title: meta.title || r.global_id
      });
    }

    return results;
  }

  /**
   * 获取仓库的 namespace
   */
  async getNamespace(repoId) {
    const row = await this.db.get('SELECT namespace FROM repositories WHERE id = ?', [repoId]);
    return row ? row.namespace : null;
  }

  /**
   * 获取仓库数据库路径
   */
  getDBPath(repoPath) {
    return path.join(repoPath, '.repo', 'database.sqlite');
  }

  /**
   * 按 namespace 获取仓库信息
   */
  async getByNamespace(namespace) {
    const row = await this.db.get('SELECT * FROM repositories WHERE namespace = ?', [namespace]);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      namespace: row.namespace,
      path: row.path,
      created: row.created
    };
  }
}

module.exports = FederationManager;
