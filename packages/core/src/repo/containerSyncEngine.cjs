const fs = require('fs-extra');
const path = require('path');
const HashUtils = require('../utils/hash.cjs');
const ResourceType = require('../plugin/typeRegistry.cjs');
const ContainerMatcher = require('./containerMatcher.cjs');

/**
 * ContainerSyncEngine - 统一 Container 内容同步引擎
 *
 * 职责:
 *   - scan:   扫描 Content Source 目录，写入 container_members
 *   - diff:   只读对比文件系统 vs 数据库快照
 *   - sync:   diff + 应用变更到数据库
 *
 * 与 ContainerService 的关系:
 *   - ContainerService 负责 CRUD（promote/demote/ignore/members）
 *   - SyncEngine 负责同步（scan/diff/sync）
 *   - SyncEngine 使用 ContainerMatcher 处理忽略规则
 *
 * 所有方法自动从 resource_sources 解析 sourceDir，调用方无需传入。
 */
class ContainerSyncEngine {
  /**
   * @param {import('./database.cjs')} db
   * @param {import('./containerService.cjs')} containerService
   * @param {import('./sourceService.cjs')} sourceService
   * @param {{ getCryptoKey?: () => Buffer|null }} options
   */
  constructor(db, containerService, sourceService, options = {}) {
    this.db = db;
    this.containerService = containerService;
    this.sourceService = sourceService;
    this.matcher = new ContainerMatcher();
    this._getCryptoKey = options.getCryptoKey || null;
  }

  get _cryptoKey() {
    return this._getCryptoKey ? this._getCryptoKey() : null;
  }

  /**
   * 为容器构建完整的忽略规则集
   */
  async _buildRuleSet(containerRid, sourceId = null) {
    const schema = await this.containerService.getContainerSchema(containerRid);
    const schemaPatterns = schema.ignored_patterns || [];

    // 获取带有 force_ignore 的成员（按 source 过滤，避免多 source 交叉污染）
    let overrides;
    if (sourceId != null) {
      overrides = await this.db.all(
        `SELECT path, force_ignore FROM container_members WHERE container_rid = ? AND source_id = ? AND force_ignore IS NOT NULL AND force_ignore != 0`,
        [containerRid, sourceId]
      );
    } else {
      overrides = await this.db.all(
        `SELECT path, force_ignore FROM container_members WHERE container_rid = ? AND force_ignore IS NOT NULL AND force_ignore != 0`,
        [containerRid]
      );
    }

    return this.matcher.buildRuleSet(schemaPatterns, overrides);
  }

  /**
   * 获取容器的所有活跃 Content Source
   */
  async _getEnabledSources(containerRid) {
    const sources = await this.sourceService.getSources(containerRid);
    return sources.filter(s => s.enabled !== 0);
  }

  // ───────── scan ─────────

  /**
   * 扫描所有启用的 Content Source，将文件添加为成员。
   *
   * @param {string} containerRid
   * @returns {Promise<{ results: Array<{source:string, added:number, skipped:number, errors:Array}>, totalAdded:number }>}
   */
  async scan(containerRid) {
    const sources = await this._getEnabledSources(containerRid);
    const results = [];
    let totalAdded = 0;

    for (const src of sources) {
      if (src.source_type !== 'local_folder') continue;
      if (!await fs.pathExists(src.location)) {
        results.push({ source: src.location, added: 0, skipped: 0, errors: [{ file: '', error: '目录不存在' }] });
        continue;
      }

      const result = await this.containerService._scanSource(containerRid, src.location, { sourceId: src.id });
      results.push({ source: src.location, ...result });
      totalAdded += result.added;

      // 更新 last_scan_at
      await this._touchScanTime(src.id);
    }

    return { results, totalAdded };
  }

  // ───────── diff ─────────

  /**
   * 对比所有 Content Source 与数据库快照的差异（只读）。
   *
   * @param {string} containerRid
   * @returns {Promise<Array<{source:string, added:Array, modified:Array, deleted:Array, unchanged:number}>>}
   */
  async diff(containerRid) {
    const sources = await this._getEnabledSources(containerRid);
    const results = [];

    for (const src of sources) {
      if (src.source_type !== 'local_folder') continue;
      if (!await fs.pathExists(src.location)) {
        results.push({ source: src.location, source_id: src.id, added: [], modified: [], deleted: [], unchanged: 0, _error: '目录不存在' });
        continue;
      }

      const diff = await this._diffSource(containerRid, src.location, src.id);
      results.push({ source: src.location, source_id: src.id, ...diff });
    }

    return results;
  }

  /**
   * 单 Source diff（使用 ContainerMatcher）
   */
  async _diffSource(containerRid, sourceDir, sourceId = null) {
    if (!await fs.pathExists(sourceDir)) {
      throw new Error(`源目录不存在: ${sourceDir}`);
    }

    const ruleSet = await this._buildRuleSet(containerRid, sourceId);

    // 扫描文件系统
    const fsFiles = [];
    await this._scanDir(sourceDir, sourceDir, ruleSet, fsFiles);

    const fsMap = new Map();
    for (const f of fsFiles) {
      fsMap.set(f.relPath, f);
    }

    // 获取数据库中的活跃成员（按 source_id 过滤）
    const dbMembers = await this.containerService.getMembers(containerRid);
    const dbMap = new Map();
    for (const m of dbMembers) {
      if (m.status === 'deleted') continue;
      // 多 source 场景：只比较属于当前 source 的成员
      if (sourceId != null && m.source_id != null && m.source_id !== sourceId) continue;
      dbMap.set(m.path, m);
    }

    const added = [];
    const modified = [];
    const deleted = [];
    let unchanged = 0;

    for (const [relPath, fsFile] of fsMap) {
      const dbMember = dbMap.get(relPath);
      if (dbMember && dbMember.force_ignore) continue;
      if (!dbMember) {
        added.push({
          path: relPath,
          name: fsFile.name,
          size: fsFile.size,
          hash: fsFile.hash,
          modified_time: fsFile.mtime
        });
      } else {
        if ((dbMember.hash || '') !== fsFile.hash) {
          modified.push({
            path: relPath,
            name: fsFile.name,
            size: fsFile.size,
            hash: fsFile.hash,
            modified_time: fsFile.mtime,
            old_hash: dbMember.hash || '',
            old_modified_time: dbMember.modified_time,
            resource_rid: dbMember.resource_rid
          });
        } else {
          unchanged++;
        }
      }
    }

    for (const [relPath, dbMember] of dbMap) {
      if (!fsMap.has(relPath)) {
        deleted.push({
          path: relPath,
          name: dbMember.name,
          old_hash: dbMember.hash || '',
          resource_rid: dbMember.resource_rid,
          id: dbMember.id
        });
      }
    }

    return { added, modified, deleted, unchanged };
  }

  /**
   * 递归扫描目录（使用 ContainerMatcher 规则集）
   */
  async _scanDir(baseDir, currentDir, ruleSet, result) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const absPath = path.join(currentDir, entry.name);
        const relPath = path.relative(baseDir, absPath).replace(/\\/g, '/');

        if (this.matcher.shouldIgnore(relPath, ruleSet)) continue;

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.')) {
            await this._scanDir(baseDir, absPath, ruleSet, result);
          }
        } else if (entry.isFile()) {
          if (ResourceType.isSupported(absPath)) {
            const stats = await fs.stat(absPath);
            const fileHash = await HashUtils.fromFile(absPath, this._cryptoKey);
            result.push({
              absPath,
              relPath,
              name: entry.name,
              size: stats.size,
              hash: fileHash,
              mtime: stats.mtime.getTime()
            });
          }
        }
      }
    } catch (e) {
      // 目录读取失败，静默跳过
    }
  }

  // ───────── sync ─────────

  /**
   * 同步：diff + 应用变更
   *
   * @param {string} containerRid
   * @returns {Promise<Array<{source:string, added:number, updated:number, removed:number, errors:Array}>>}
   */
  async sync(containerRid) {
    const sources = await this._getEnabledSources(containerRid);
    const results = [];

    for (const src of sources) {
      if (src.source_type !== 'local_folder') continue;

      const syncResult = await this.containerService._syncMembers(containerRid, src.location, { sourceId: src.id });
      results.push({ source: src.location, ...syncResult });

      await this._touchScanTime(src.id);
    }

    return results;
  }

  /**
   * 获取容器的变更状态（格式化输出用）
   * 等同于 diff 的便捷包装
   */
  async status(containerRid) {
    return this.diff(containerRid);
  }

  // ───────── 内部工具 ─────────

  async _touchScanTime(sourceId) {
    const now = Date.now();
    await this.db.run(
      `UPDATE resource_sources SET last_scan_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, sourceId]
    );
  }

  /**
   * 标记 Container 为 dirty（文件系统变更，等待 sync）
   * 由 FileWatcher 在检测到 Container Source 内文件变化时调用。
   *
   * @param {string} containerRid
   */
  async markDirty(containerRid) {
    const now = Date.now();
    await this.db.run(
      `UPDATE resource_sources SET updated_at = ? WHERE resource_rid = ?`,
      [now, containerRid]
    );
  }

  /**
   * 检查 Container 是否有脏数据（上次扫描后有文件变更）
   * @param {string} containerRid
   * @returns {Promise<boolean>}
   */
  async isDirty(containerRid) {
    const sources = await this._getEnabledSources(containerRid);
    if (sources.length === 0) return false;

    for (const src of sources) {
      if (src.source_type !== 'local_folder') continue;
      const diff = await this._diffSource(containerRid, src.location, src.id);
      if (diff.added.length > 0 || diff.modified.length > 0 || diff.deleted.length > 0) {
        return true;
      }
    }
    return false;
  }
}

module.exports = ContainerSyncEngine;
