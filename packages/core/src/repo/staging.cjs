const fs = require('fs-extra');
const path = require('path');
const ResourceType = require('../plugin/typeRegistry.cjs');

class StagingArea {
  constructor(repoPath) {
    this.repoPath = repoPath;
    this._db = null;
  }

  // 由 Repository 在打开时注入 db 引用
  setDb(db) {
    this._db = db;
  }

  _dbCheck() {
    if (!this._db) throw new Error('StagingArea: db 未注入，请确保 Repository 已调用 setDb()');
  }

  async add(filePath, repository) {
    this._dbCheck();
    const relPath = this._relative(filePath);

    let type = 'add';
    if (repository) {
      const existing = await repository.resourceService.getByPath(filePath);
      if (existing) type = 'modify';
    }

    // 删除同路径的旧记录
    await this._db.run('DELETE FROM staging_changes WHERE path = ?', [relPath]);
    await this._db.run(
      'INSERT INTO staging_changes (type, path, created_at) VALUES (?, ?, ?)',
      [type, relPath, Date.now()]
    );
    return relPath;
  }

  async addAll(repository) {
    this._dbCheck();
    const existingPaths = new Set();

    // 收集已有暂存路径
    const staged = await this.getStatus();
    for (const s of [...staged.added, ...staged.modified]) existingPaths.add(s);

    const excludeDirs = ['.repo', 'node_modules', '.git'];
    const files = await fs.readdir(this.repoPath, { recursive: true });
    for (const file of files) {
      if (excludeDirs.some(d => file.startsWith(d + path.sep) || file === d)) continue;
      const absPath = path.join(this.repoPath, file);
      if (!ResourceType.isSupported(absPath)) continue;
      let stats;
      try { stats = await fs.stat(absPath); } catch { continue; }
      if (stats.isFile()) {
        const relPath = this._relative(absPath);
        if (!existingPaths.has(relPath)) {
          await this.add(absPath, repository);
          existingPaths.add(relPath);
        }
      }
    }

    // 检测已删除的文件
    const allResources = await repository.resourceService.getAll();
    for (const resource of allResources) {
      // 复用 Core 既有 Location 解析能力（Resource Location 唯一解析规则）
      const absPath =
        repository.resourceService.resolveLocation({
          kind: resource.location_kind,
          value: resource.location,
        }) || '';
      if (!absPath.startsWith(this.repoPath + path.sep) && absPath !== this.repoPath) continue;
      if (!await fs.pathExists(absPath)) {
        const relPath = this._relative(absPath);
        if (!existingPaths.has(relPath)) {
          await this.remove(absPath);
          existingPaths.add(relPath);
        }
      }
    }

    const updated = await this.getStatus();
    return updated.added.length + updated.modified.length + updated.deleted.length;
  }

  async remove(filePath) {
    this._dbCheck();
    const relPath = this._relative(filePath);

    // 移除 add/modify 类记录
    await this._db.run(
      "DELETE FROM staging_changes WHERE path = ? AND type IN ('add','modify')",
      [relPath]
    );

    // 添加 delete 记录（去重）
    const existing = await this._db.get(
      "SELECT id FROM staging_changes WHERE path = ? AND type = 'delete'",
      [relPath]
    );
    if (!existing) {
      await this._db.run(
        'INSERT INTO staging_changes (type, path, created_at) VALUES (?, ?, ?)',
        ['delete', relPath, Date.now()]
      );
    }
    return relPath;
  }

  async rename(oldPath, newPath) {
    this._dbCheck();
    const oldRel = this._relative(oldPath);
    const newRel = this._relative(newPath);

    await this._db.run(
      "DELETE FROM staging_changes WHERE path = ? AND type IN ('add','modify','delete')",
      [oldRel]
    );
    await this._db.run(
      "DELETE FROM staging_changes WHERE path = ? AND type = 'rename' AND old_path IS NOT NULL",
      [oldRel]
    );

    await this._db.run(
      'INSERT INTO staging_changes (type, path, old_path, created_at) VALUES (?, ?, ?, ?)',
      ['rename', newRel, oldRel, Date.now()]
    );
    return { old: oldRel, new: newRel };
  }

  async reset(filePath = null) {
    this._dbCheck();
    if (filePath) {
      const relPath = this._relative(filePath);
      await this._db.run(
        "DELETE FROM staging_changes WHERE path = ? AND type IN ('add','modify','delete')",
        [relPath]
      );
      await this._db.run(
        "DELETE FROM staging_changes WHERE path = ? AND type = 'metadata'",
        [relPath]
      );
    } else {
      await this._db.run('DELETE FROM staging_changes');
      return null;
    }
    return this._relative(filePath);
  }

  async getStatus() {
    this._dbCheck();
    const rows = await this._db.all('SELECT * FROM staging_changes ORDER BY id');

    const result = {
      added: [],
      modified: [],
      deleted: [],
      renamed: [],
      metadata: []
    };

    for (const row of rows) {
      switch (row.type) {
        case 'add': result.added.push(row.path); break;
        case 'modify': result.modified.push(row.path); break;
        case 'delete': result.deleted.push(row.path); break;
        case 'rename': result.renamed.push({ old: row.old_path, new: row.path }); break;
        case 'metadata':
          result.metadata.push({ rid: row.rid, ...(row.meta_json ? JSON.parse(row.meta_json) : {}) });
          break;
      }
    }

    return result;
  }

  async stageMetadata(rid, changes) {
    this._dbCheck();
    await this._db.run(
      "DELETE FROM staging_changes WHERE rid = ? AND type = 'metadata'",
      [rid]
    );
    await this._db.run(
      "INSERT INTO staging_changes (type, path, rid, meta_json, created_at) VALUES (?, ?, ?, ?, ?)",
      ['metadata', `meta:${rid}`, rid, JSON.stringify(changes), Date.now()]
    );
  }

  async resetMetadata(rid) {
    this._dbCheck();
    await this._db.run(
      "DELETE FROM staging_changes WHERE rid = ? AND type = 'metadata'",
      [rid]
    );
  }

  async hasChanges() {
    this._dbCheck();
    const row = await this._db.get('SELECT COUNT(*) as c FROM staging_changes');
    return row.c > 0;
  }

  async commit(repository) {
    this._dbCheck();
    const staging = await this.getStatus();
    const results = { added: 0, updated: 0, deleted: 0, renamed: 0, metadata: 0 };
    const syncOps = repository.syncOps;
    const SyncOpsEngine = syncOps ? require('./syncOps.cjs') : null;

    for (const relPath of staging.added) {
      const absPath = path.join(this.repoPath, relPath);
      if (await fs.pathExists(absPath)) {
        const resource = await repository.resourceService.importFile(absPath);
        if (syncOps && resource) {
          const relResourcePath = (resource.location_kind === 'local' ? resource.location : '');
          await syncOps.recordOp(SyncOpsEngine.OP_TYPES.RESOURCE_CREATED, resource.rid, {
            name: resource.name, layer: resource.layer || 0, type: resource.type,
            path: relResourcePath, hash: resource.hash, metadata: resource.metadata,
            encrypted: resource.encrypted, created: resource.created, updated: resource.updated
          });
        }
        results.added++;
      }
    }

    for (const relPath of staging.modified) {
      const absPath = path.join(this.repoPath, relPath);
      if (await fs.pathExists(absPath)) {
        const existing = await repository.resourceService.getByPath(absPath);
        if (existing) {
          const oldHash = existing.hash;
          const refreshed = await repository.resourceService.refresh(existing.rid);
          if (syncOps) {
            const relResourcePath = (existing.location_kind === 'local' ? existing.location : '');
            await syncOps.recordOp(SyncOpsEngine.OP_TYPES.RESOURCE_UPDATED, existing.rid, {
              path: relResourcePath, old_hash: oldHash, new_hash: refreshed.hash, metadata: refreshed.metadata
            });
          }
          results.updated++;
        } else {
          const resource = await repository.resourceService.importFile(absPath);
          if (syncOps && resource) {
            const relResourcePath = (resource.location_kind === 'local' ? resource.location : '');
            await syncOps.recordOp(SyncOpsEngine.OP_TYPES.RESOURCE_CREATED, resource.rid, {
              name: resource.name, layer: resource.layer || 0, type: resource.type,
              path: relResourcePath, hash: resource.hash, metadata: resource.metadata,
              encrypted: resource.encrypted, created: resource.created, updated: resource.updated
            });
          }
          results.added++;
        }
      }
    }

    for (const relPath of staging.deleted) {
      const absPath = path.join(this.repoPath, relPath);
      const existing = await repository.resourceService.getByPath(absPath);
      if (existing) {
        await repository.resourceService.delete(existing.rid, true);
        if (syncOps) {
          await syncOps.recordOp(SyncOpsEngine.OP_TYPES.RESOURCE_DELETED, existing.rid, {
            path: (existing.location_kind === 'local' ? existing.location : ''), type: existing.type, hash: existing.hash
          });
        }
        results.deleted++;
      }
    }

    for (const rename of staging.renamed) {
      const oldPath = path.join(this.repoPath, rename.old);
      const newPath = path.join(this.repoPath, rename.new);
      const existing = await repository.resourceService.getByPath(oldPath);
      if (existing) {
        await repository.resourceService.update(existing.rid, { path: newPath });
        if (syncOps) {
          await syncOps.recordOp(SyncOpsEngine.OP_TYPES.RESOURCE_MOVED, existing.rid, {
            old_path: rename.old, new_path: rename.new
          });
        }
        results.renamed++;
      }
    }

    if (staging.metadata && staging.metadata.length > 0) {
      for (const meta of staging.metadata) {
        const resource = await repository.resourceService.getByRid(meta.rid);
        if (resource) {
          const merged = { ...resource.metadata, ...meta };
          delete merged.rid;
          await repository.resourceService.update(meta.rid, { metadata: merged });
          if (syncOps) {
            const refreshed = await repository.resourceService.getByRid(meta.rid);
            await syncOps.recordOp(SyncOpsEngine.OP_TYPES.RESOURCE_UPDATED, meta.rid, {
              path: (resource.location_kind === 'local' ? resource.location : ''),
              old_hash: resource.hash, new_hash: refreshed.hash, metadata: refreshed.metadata
            });
          }
          results.metadata++;
        }
      }
    }

    await this._db.run('DELETE FROM staging_changes');
    return results;
  }

  _relative(filePath) {
    if (path.isAbsolute(filePath)) {
      return path.relative(this.repoPath, filePath);
    }
    return filePath;
  }
}

module.exports = StagingArea;
