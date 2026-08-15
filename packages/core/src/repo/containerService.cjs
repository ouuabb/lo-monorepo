const fs = require("fs-extra");
const path = require("path");
const HashUtils = require("../utils/hash.cjs");
const ResourceType = require("../plugin/typeRegistry.cjs");
const MemberStateMachine = require("../domain/memberStateMachine.cjs");

/**
 * ContainerService - 管理具有 Container Capability 的 Resource 的成员
 *
 * 负责:
 *   - 从 Content Source 扫描并添加成员
 *   - 管理 container_members 表
 *   - Promote: 将普通 File Member 提升为独立 Resource
 *
 * ──────────── 冻结数据模型 (Phase 3.8) ────────────
 *
 * container_members:
 *
 *   字段                语义
 *   ─────────────────────────────────────────
 *   id                  PK
 *   container_rid       所属容器 Resource RID
 *   source_id           来源 source FK (ON DELETE SET NULL)
 *   path                在 source 内的相对路径 (非全局唯一)
 *   name                文件名
 *   size                文件大小 (bytes)
 *   hash                内容哈希
 *   resource_rid        若已 promote，指向对应的独立 Resource
 *   status              生命周期状态: indexed | promoted | deleted
 *   force_ignore        同步策略: 0=参与同步, 1=跳过新增/修改但追踪删除
 *   source_deleted_at   来源 source 被删除的时间 (NULL=未删除)
 *   created / updated   时间戳
 *
 * 关键约束:
 *   - UNIQUE(container_rid, source_id, path)   — 同一 source 内路径唯一
 *   - FK source_id → resource_sources(id) ON DELETE SET NULL
 *
 * 语义边界:
 *   - path       = source 内定位，不是全局路径（多 source 允许同名文件）
 *   - resource_rid = 是否已升级为 Resource（不是文件身份）
 *   - status       = 只描述生命周期，不描述同步策略
 *   - force_ignore = 只描述同步策略，不改变生命周期状态
 *   - source_deleted_at = 标记 source 已删除，用于历史追踪
 *
 * 同步链路:
 *   CLI → Repository → SyncEngine.sync() → ContainerService._syncMembers()[内部]
 *                                           → ContainerService._scanSource()[内部]
 *                                           → ContainerService._diffMembers()[内部]
 *
 *   外部绝不应直接调用 _scanSource / _diffMembers / _syncMembers。
 */
class ContainerService {
  /**
   * @param {import('./database.cjs')} db
   * @param {import('./resourceService.cjs')} resourceService
   * @param {{ getCryptoKey?: () => Buffer|null }} options
   */
  constructor(db, resourceService, options = {}) {
    this.db = db;
    this.resourceService = resourceService;
    this._getCryptoKey = options.getCryptoKey || null;
    /** @type {import('./transactionEngine.cjs')|null} 由 Repository 注入，用于 scan/sync 的操作日志 */
    this.transactionEngine = null;
  }

  get _cryptoKey() {
    return this._getCryptoKey ? this._getCryptoKey() : null;
  }

  /**
   * 注入 TransactionEngine（Repository 初始化时调用）
   * @param {import('./transactionEngine.cjs')} transactionEngine
   */
  setTransactionEngine(transactionEngine) {
    this.transactionEngine = transactionEngine;
  }

  /**
   * 检查 Resource 是否具有 Container Capability
   * @param {string} rid
   * @returns {Promise<boolean>}
   */
  async hasContainerCapability(rid) {
    const resource = await this.resourceService.getByRid(rid);
    if (!resource) return false;
    const caps = resource.capabilities || [];
    return caps.includes("container");
  }

  /**
   * 获取容器的 Container Schema（允许的成员类型等）
   * @param {string} containerRid
   * @returns {Promise<object>}
   */
  async getContainerSchema(containerRid) {
    const resource = await this.resourceService.getByRid(containerRid);
    if (!resource) return {};
    return resource.container_schema || {};
  }

  /**
   * @internal 仅供 ContainerSyncEngine 调用。扫描 Container Source 目录，将新文件加入 container_members。
   *
   * Operation 唯一入口：所有变更逐项经 OperationEngine（member.add / member.update），
   * 记录操作日志，可撤销、可追溯。未注入 TransactionEngine 时直接抛错，绝不绕过 Operation 直写。
   */
  async _scanSource(containerRid, sourceDir, options = {}) {
    const { recursive = true, filter = null, sourceId } = options;

    if (!(await this.hasContainerCapability(containerRid))) {
      throw new Error(`Resource ${containerRid} 不具有 Container Capability`);
    }

    const schema = await this.getContainerSchema(containerRid);
    const allowedTypes =
      schema.allowed_types && schema.allowed_types.length > 0
        ? schema.allowed_types
        : null;

    if (!(await fs.pathExists(sourceDir))) {
      throw new Error(`源目录不存在: ${sourceDir}`);
    }

    if (!this.transactionEngine) {
      throw new Error(
        "OperationEngine 未注入（TransactionEngine 缺失），scan 禁止绕过 Operation 直写",
      );
    }

    // 扫描文件
    const files = [];
    const ignorePatterns = await this.getIgnorePatterns(containerRid);
    await this._scanDir(sourceDir, sourceDir, recursive, files, ignorePatterns);

    const result = { added: 0, skipped: 0, errors: [] };

    const tx = await this.transactionEngine.begin({
      containerRid,
      type: "container.scan",
      description: `scan ${sourceDir}`,
    });

    try {
      for (const file of files) {
        try {
          if (filter && !filter.test(file.relPath)) continue;

          const memberType = ResourceType.fromPath(file.absPath);
          if (allowedTypes && !allowedTypes.includes(memberType)) {
            result.skipped++;
            continue;
          }

          const stats = await fs.stat(file.absPath);
          const relPath = path
            .relative(sourceDir, file.absPath)
            .replace(/\\/g, "/");
          const fileHash = await HashUtils.fromFile(
            file.absPath,
            this._cryptoKey,
          );

          const existing =
            sourceId != null
              ? await this.db.get(
                  "SELECT * FROM container_members WHERE container_rid = ? AND path = ? AND source_id = ?",
                  [containerRid, relPath, sourceId],
                )
              : await this.db.get(
                  "SELECT * FROM container_members WHERE container_rid = ? AND path = ?",
                  [containerRid, relPath],
                );

          const opParams = {
            containerRid,
            path: relPath,
            name: path.basename(file.absPath),
            size: stats.size,
            hash: fileHash,
            modified_time: stats.mtime.getTime(),
            sourceId,
          };

          if (existing && existing.status !== "deleted") {
            await this.transactionEngine.execute(
              tx.transactionId,
              "member.update",
              opParams,
            );
          } else {
            await this.transactionEngine.execute(
              tx.transactionId,
              "member.add",
              opParams,
            );
          }

          result.added++;
        } catch (e) {
          result.errors.push({ file: file.absPath, error: e.message });
        }
      }

      await this.transactionEngine.commit(tx.transactionId);
    } catch (err) {
      await this.transactionEngine.rollback(tx.transactionId);
      throw err;
    }

    return result;
  }

  /**
   * 递归扫描目录
   * @param {string} baseDir — 根目录
   * @param {string} currentDir — 当前目录
   * @param {boolean} recursive
   * @param {Array} result
   * @param {string[]} [ignorePatterns] — 要跳过的 glob 模式
   */
  async _scanDir(baseDir, currentDir, recursive, result, ignorePatterns = []) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const absPath = path.join(currentDir, entry.name);
        const relPath = path.relative(baseDir, absPath).replace(/\\/g, "/");

        // 检查忽略规则
        if (this._matchesIgnore(relPath, ignorePatterns)) continue;

        if (entry.isDirectory()) {
          if (
            recursive &&
            !entry.name.startsWith(".") &&
            entry.name !== "node_modules"
          ) {
            await this._scanDir(
              baseDir,
              absPath,
              recursive,
              result,
              ignorePatterns,
            );
          }
        } else if (entry.isFile()) {
          if (ResourceType.isSupported(absPath)) {
            result.push({ absPath, relPath });
          }
        }
      }
    } catch (e) {
      // 目录读取失败，静默跳过
    }
  }

  /**
   * 检查路径是否匹配任一忽略模式（简单通配符匹配）
   */
  _matchesIgnore(relPath, patterns) {
    return patterns.some((pattern) => {
      // 简单 glob：** 匹配任意层级，* 匹配单层
      const regex = new RegExp(
        `^${pattern
          .replace(/\./g, "\\.")
          .replace(/\*\*/g, "§§GLOBSTAR§§")
          .replace(/\*/g, "[^/]*")
          .replace(/§§GLOBSTAR§§/g, ".*")}$`,
      );
      return regex.test(relPath);
    });
  }

  /**
   * 添加成员到容器
   * @param {string} containerRid
   * @param {object} member
   * @param {string} member.path - 容器内的相对路径
   * @param {string} [member.absolutePath] - 磁盘上的绝对路径（用于 hash 计算）
   * @param {string} member.name - 文件名
   * @param {number} member.size - 文件大小
   * @param {string} member.hash - 内容哈希
   * @param {number} member.modified_time - 修改时间
   * @param {object} [member.metadata] - 元数据
   * @param {number} [member.sourceId] - 来源 source id（新成员强烈建议提供）
   * @returns {Promise<object>}
   */
  async addMember(containerRid, member) {
    const {
      path: memberPath,
      absolutePath,
      name,
      size,
      hash,
      modified_time,
      metadata = {},
      sourceId = null,
    } = member;

    // 计算 hash（如果提供了 absolutePath 但未提供 hash）
    let memberHash = hash;
    if (!memberHash && absolutePath) {
      memberHash = await HashUtils.fromFile(absolutePath, this._cryptoKey);
    }

    // 检查是否已存在（含 source_id 区分多 source）
    let existing;
    if (sourceId != null) {
      existing = await this.db.get(
        "SELECT id FROM container_members WHERE container_rid = ? AND path = ? AND source_id = ?",
        [containerRid, memberPath, sourceId],
      );
    } else {
      // 向后兼容：无 source_id 时检查任意 source
      existing = await this.db.get(
        "SELECT id FROM container_members WHERE container_rid = ? AND path = ?",
        [containerRid, memberPath],
      );
    }

    if (existing) {
      // 如果之前是 deleted 状态，恢复为 indexed（或 promoted，若之前已提升）
      const existingRow = await this.db.get(
        "SELECT id, status, resource_rid FROM container_members WHERE container_rid = ? AND path = ?",
        [containerRid, memberPath],
      );
      let newStatus = undefined;
      if (existingRow && existingRow.status === "deleted") {
        // 保留提升状态：如果删除前是 promoted 成员，恢复后仍为 promoted
        newStatus = existingRow.resource_rid ? "promoted" : "indexed";
      }

      const statusUpdate = newStatus ? ", status = ?" : "";
      const params = newStatus
        ? [
            name,
            size || 0,
            memberHash,
            modified_time || Date.now(),
            JSON.stringify(metadata),
            newStatus,
            existing.id,
          ]
        : [
            name,
            size || 0,
            memberHash,
            modified_time || Date.now(),
            JSON.stringify(metadata),
            existing.id,
          ];

      await this.db.run(
        `UPDATE container_members
         SET name = ?, size = ?, hash = ?, modified_time = ?, metadata = ?, updated_at = datetime('now')${statusUpdate}
         WHERE id = ?`,
        params,
      );
      return {
        id: existing.id,
        container_rid: containerRid,
        path: memberPath,
        updated: true,
      };
    }

    // 插入新成员
    const result = await this.db.run(
      `INSERT INTO container_members (container_rid, source_id, resource_rid, path, name, size, hash, modified_time, status, metadata)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'indexed', ?)`,
      [
        containerRid,
        sourceId,
        memberPath,
        name,
        size || 0,
        memberHash || "",
        modified_time || Date.now(),
        JSON.stringify(metadata),
      ],
    );

    return {
      id: result.lastID,
      container_rid: containerRid,
      path: memberPath,
      added: true,
    };
  }

  /**
   * 获取容器的所有成员
   * @param {string} containerRid
   * @param {{ resourceOnly?: boolean, fileOnly?: boolean }} options
   * @returns {Promise<Array>}
   */
  async getMembers(containerRid, options = {}) {
    const { resourceOnly = false, fileOnly = false, status } = options;

    let sql = "SELECT * FROM container_members WHERE container_rid = ?";
    const params = [containerRid];

    if (resourceOnly) {
      sql += " AND resource_rid IS NOT NULL";
    } else if (fileOnly) {
      sql += " AND resource_rid IS NULL";
    }

    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }

    sql += " ORDER BY path ASC";

    const rows = await this.db.all(sql, params);
    return rows.map((row) => this._hydrateMember(row));
  }

  /**
   * 按路径获取单个成员
   * @param {string} containerRid
   * @param {string} memberPath
   * @param {{ sourceId?: number }} options - 可选，指定 source 以区分多 source 同名文件
   * @returns {Promise<object|null>}
   */
  async getMember(containerRid, memberPath, options = {}) {
    const { sourceId = null } = options;
    if (sourceId != null) {
      const row = await this.db.get(
        "SELECT * FROM container_members WHERE container_rid = ? AND path = ? AND source_id = ?",
        [containerRid, memberPath, sourceId],
      );
      return row ? this._hydrateMember(row) : null;
    }
    const row = await this.db.get(
      "SELECT * FROM container_members WHERE container_rid = ? AND path = ?",
      [containerRid, memberPath],
    );
    return row ? this._hydrateMember(row) : null;
  }

  /**
   * Promote: 将普通 File Member 提升为独立的 Resource
   *
   * 流程:
   *   1. 创建新的 Resource（type 根据文件推导）
   *   2. 更新 container_members 的 resource_rid 指向新 Resource
   *   3. 新 Resource 拥有独立 RID，可以参与 Relation
   *
   * @param {string} containerRid - 容器 RID
   * @param {string} memberPath - 成员在容器中的路径
   * @param {{ sourceId?: number, type?: string, metadata?: object }} options
   * @returns {Promise<object>} 新创建的 Resource
   */
  async promoteMember(containerRid, memberPath, options = {}) {
    const { sourceId = null, type, metadata: meta = {} } = options;

    const member = await this.getMember(containerRid, memberPath, { sourceId });
    if (!member) {
      throw new Error(
        `成员不存在: ${memberPath}${sourceId ? ` (source ${sourceId})` : ""}`,
      );
    }

    if (member.resource_rid) {
      return this.resourceService.getByRid(member.resource_rid);
    }

    // 状态机校验: indexed → promoted
    MemberStateMachine.validate(member.status, "promote", "promoted");

    const container = await this.resourceService.getByRid(containerRid);
    if (!container) {
      throw new Error(`容器 Resource 不存在: ${containerRid}`);
    }

    // 从 Content Source 获取成员的绝对路径
    let absolutePath = null;
    if (sourceId != null) {
      // 指定 source 时，直接用该 source 的 location
      const source = await this.db.get(
        "SELECT * FROM resource_sources WHERE id = ?",
        [sourceId],
      );
      if (source) {
        const candidate = path
          .join(source.location, memberPath)
          .replace(/\\/g, "/");
        if (await fs.pathExists(candidate)) {
          absolutePath = candidate;
        }
      }
    } else {
      // 向后兼容：遍历所有 source
      const sources = await this.db.all(
        "SELECT * FROM resource_sources WHERE resource_rid = ?",
        [containerRid],
      );
      for (const src of sources) {
        const candidate = path
          .join(src.location, memberPath)
          .replace(/\\/g, "/");
        if (await fs.pathExists(candidate)) {
          absolutePath = candidate;
          break;
        }
      }
    }

    if (!absolutePath) {
      throw new Error(
        `无法找到成员的磁盘文件: ${memberPath}。请确保 Content Source 仍然存在。`,
      );
    }

    // 创建 Resource
    const resourceType = type || ResourceType.fromPath(absolutePath);
    const loc = this.resourceService.locationFromPath(absolutePath);
    const resource = await this.resourceService.create({
      type: resourceType,
      location_kind: loc.kind,
      location: loc.value,
      name: member.name.replace(/\.[^.]+$/, ""), // 去掉扩展名
      metadata: meta,
      capabilities: [],
    });

    // 更新 member 的 resource_rid 和 status
    await this.db.run(
      `UPDATE container_members SET resource_rid = ?, status = 'promoted', updated_at = datetime('now') WHERE id = ?`,
      [resource.rid, member.id],
    );

    return resource;
  }

  /**
   * 获取所有包含某个 Resource 作为成员的容器
   * @param {string} resourceRid
   * @returns {Promise<Array>}
   */
  async getContainersForResource(resourceRid) {
    const rows = await this.db.all(
      "SELECT * FROM container_members WHERE resource_rid = ?",
      [resourceRid],
    );
    return rows.map((row) => this._hydrateMember(row));
  }

  /**
   * Demote: 将已提升的 Resource Member 降级为普通 File Member
   *
   * @param {string} containerRid
   * @param {string} memberPath
   * @param {{ sourceId?: number }} options
   * @returns {Promise<{ demoted: boolean, previousResourceRid: string }>}
   */
  async demoteMember(containerRid, memberPath, options = {}) {
    const { sourceId = null } = options;
    const member = await this.getMember(containerRid, memberPath, { sourceId });
    if (!member) {
      throw new Error(
        `成员不存在: ${memberPath}${sourceId ? ` (source ${sourceId})` : ""}`,
      );
    }

    if (!member.resource_rid) {
      throw new Error(`成员 "${memberPath}" 尚未提升为 Resource`);
    }

    // 状态机校验: promoted → indexed
    MemberStateMachine.validate(member.status, "demote", "indexed");

    const rid = member.resource_rid;

    // 清除 resource_rid，状态变为 indexed
    await this.db.run(
      `UPDATE container_members SET resource_rid = NULL, status = 'indexed', updated_at = datetime('now') WHERE id = ?`,
      [member.id],
    );

    return {
      demoted: true,
      previousResourceRid: rid,
      resource_exists: !!(await this.resourceService.getByRid(rid)),
    };
  }

  /**
   * 获取容器的成员统计
   * @param {string} containerRid
   * @returns {Promise<{ total: number, resources: number, files: number }>}
   */
  async getMemberStats(containerRid) {
    const total = await this.db.get(
      `SELECT COUNT(*) as count FROM container_members
       WHERE container_rid = ? AND status != 'ignored'`,
      [containerRid],
    );
    const promoted = await this.db.get(
      `SELECT COUNT(*) as count FROM container_members
       WHERE container_rid = ? AND status = 'promoted'`,
      [containerRid],
    );
    const deleted = await this.db.get(
      `SELECT COUNT(*) as count FROM container_members
       WHERE container_rid = ? AND status = 'deleted'`,
      [containerRid],
    );

    return {
      total: total ? total.count : 0,
      promoted: promoted ? promoted.count : 0,
      indexed:
        (total ? total.count : 0) -
        (promoted ? promoted.count : 0) -
        (deleted ? deleted.count : 0),
      deleted: deleted ? deleted.count : 0,
    };
  }

  /**
   * @internal 仅供 ContainerSyncEngine 调用。计算当前文件系统与数据库快照之间的差异（只读）。
   */
  async _diffMembers(containerRid, sourceDir, options = {}) {
    const { sourceId } = options;

    if (!(await fs.pathExists(sourceDir))) {
      throw new Error(`源目录不存在: ${sourceDir}`);
    }

    // 1. 扫描文件系统
    const fsFiles = [];
    const ignorePatterns = await this.getIgnorePatterns(containerRid);
    await this._scanFilesForDiff(sourceDir, true, fsFiles, ignorePatterns);

    // 构建 相对路径 → 文件系统文件 的映射
    const fsMap = new Map();
    for (const f of fsFiles) {
      const relPath = path.relative(sourceDir, f.absPath).replace(/\\/g, "/");
      fsMap.set(relPath, f);
    }

    // 2. 获取数据库中的活跃成员，按 source_id 过滤
    const dbMembers = await this.getMembers(containerRid);
    const dbMap = new Map();
    for (const m of dbMembers) {
      if (m.status === "deleted") continue;
      // 多 source 场景：只比较属于当前 source 的成员
      if (sourceId != null && m.source_id != null && m.source_id !== sourceId)
        continue;
      dbMap.set(m.path, m);
    }

    // 3. 计算差异
    const added = [];
    const modified = [];
    const deleted = [];
    let unchanged = 0;

    // 文件系统中的文件：新增 or 修改 or 未变（跳过 force_ignored）
    for (const [relPath, fsFile] of fsMap) {
      const dbMember = dbMap.get(relPath);

      if (dbMember && dbMember.force_ignore) continue;

      if (!dbMember) {
        // 文件系统中存在，数据库中没有 → 新增
        added.push({
          path: relPath,
          name: fsFile.name,
          size: fsFile.size,
          hash: fsFile.hash,
          modified_time: fsFile.mtime,
          source: sourceDir,
        });
      } else {
        // 都存在，检查是否有变化
        const memberHash = dbMember.hash || "";
        if (memberHash !== fsFile.hash) {
          modified.push({
            path: relPath,
            name: fsFile.name,
            size: fsFile.size,
            hash: fsFile.hash,
            modified_time: fsFile.mtime,
            old_hash: memberHash,
            old_modified_time: dbMember.modified_time,
            resource_rid: dbMember.resource_rid,
            source: sourceDir,
          });
        } else {
          unchanged++;
        }
      }
    }

    // 数据库中存在但文件系统中不存在的 → 已删除
    for (const [relPath, dbMember] of dbMap) {
      if (!fsMap.has(relPath)) {
        deleted.push({
          path: relPath,
          name: dbMember.name,
          old_hash: dbMember.hash || "",
          resource_rid: dbMember.resource_rid,
          id: dbMember.id,
        });
      }
    }

    return { added, modified, deleted, unchanged };
  }

  /**
   * @internal 仅供 ContainerSyncEngine 调用。同步：将 diff 差异应用到数据库。
   *
   * Operation 唯一入口：所有变更（member.add / member.update / member.delete）逐项经
   * OperationEngine，可撤销、可追溯。未注入 TransactionEngine 时直接抛错，绝不绕过 Operation 直写。
   */
  async _syncMembers(containerRid, sourceDir, options = {}) {
    const { sourceId } = options;

    if (!this.transactionEngine) {
      throw new Error(
        "OperationEngine 未注入（TransactionEngine 缺失），sync 禁止绕过 Operation 直写",
      );
    }

    const diff = await this._diffMembers(containerRid, sourceDir, { sourceId });
    const result = { added: 0, updated: 0, removed: 0, errors: [] };

    const tx = await this.transactionEngine.begin({
      containerRid,
      type: "container.sync",
      description: `sync ${sourceDir}`,
    });

    try {
      for (const item of diff.added) {
        try {
          await this.transactionEngine.execute(tx.transactionId, "member.add", {
            containerRid,
            path: item.path,
            name: item.name,
            size: item.size,
            hash: item.hash,
            modified_time: item.modified_time,
            sourceId,
          });
          result.added++;
        } catch (e) {
          result.errors.push({ file: item.path, error: e.message });
        }
      }

      for (const item of diff.modified) {
        try {
          await this.transactionEngine.execute(
            tx.transactionId,
            "member.update",
            {
              containerRid,
              path: item.path,
              name: item.name,
              size: item.size,
              hash: item.hash,
              modified_time: item.modified_time,
              sourceId,
            },
          );
          result.updated++;
        } catch (e) {
          result.errors.push({ file: item.path, error: e.message });
        }
      }

      for (const item of diff.deleted) {
        try {
          await this.transactionEngine.execute(
            tx.transactionId,
            "member.delete",
            {
              containerRid,
              path: item.path,
              memberId: item.id,
            },
          );
          result.removed++;
        } catch (e) {
          result.errors.push({ file: item.path, error: e.message });
        }
      }

      await this.transactionEngine.commit(tx.transactionId);
    } catch (err) {
      await this.transactionEngine.rollback(tx.transactionId);
      throw err;
    }

    return result;
  }

  /**
   * 扫描目录文件（供 diff 使用，返回带 hash 的文件列表）
   */
  async _scanFilesForDiff(baseDir, recursive, result, ignorePatterns = []) {
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        const absPath = path.join(baseDir, entry.name);
        const relPath = path.relative(baseDir, absPath).replace(/\\/g, "/");

        if (this._matchesIgnore(relPath, ignorePatterns)) continue;

        if (entry.isDirectory()) {
          if (
            recursive &&
            !entry.name.startsWith(".") &&
            entry.name !== "node_modules"
          ) {
            await this._scanFilesForDiff(
              absPath,
              recursive,
              result,
              ignorePatterns,
            );
          }
        } else if (entry.isFile()) {
          if (ResourceType.isSupported(absPath)) {
            const stats = await fs.stat(absPath);
            const fileHash = await HashUtils.fromFile(absPath, this._cryptoKey);
            result.push({
              absPath,
              name: entry.name,
              size: stats.size,
              hash: fileHash,
              mtime: stats.mtime.getTime(),
            });
          }
        }
      }
    } catch (e) {
      // 目录读取失败，静默跳过
    }
  }

  /**
   * 检查指定文件路径是否属于某个 Container Source 目录。
   * 用于 FileWatcher 判断是否该跳过 import。
   *
   * @param {string} filePath - 绝对文件路径
   * @returns {Promise<boolean>}
   */
  async isInContainerSource(filePath) {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const sources = await this.db.all(`SELECT * FROM resource_sources`);

    for (const src of sources) {
      const normalizedSource = src.location.replace(/\\/g, "/");
      if (
        normalizedPath.startsWith(`${normalizedSource}/`) ||
        normalizedPath === normalizedSource
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 按名称或 RID 解析容器。
   * 优先匹配 RID，回退到按 name 查询（仅活跃层）。
   *
   * @param {string} identifier - 容器名称或 RID
   * @returns {Promise<string|null>} 容器 RID，或 null
   */
  async resolve(identifier) {
    // 1. 尝试 RID 匹配
    const byRid = await this.resourceService.getByRid(identifier);
    if (byRid && (await this.hasContainerCapability(byRid.rid))) {
      return byRid.rid;
    }

    // 2. 按名称匹配（活跃层）
    const byName = await this.resourceService.getByName(identifier);
    if (byName && (await this.hasContainerCapability(byName.rid))) {
      return byName.rid;
    }

    return null;
  }

  /**
   * 获取容器的忽略规则。
   * 从 container_ignore_patterns 表读取，合并内置排除项。
   *
   * @param {string} containerRid
   * @returns {Promise<string[]>} glob 模式数组
   */
  async getIgnorePatterns(containerRid) {
    const builtin = ["node_modules/**", ".git/**", ".repo/**"];
    const rows = await this.db.all(
      "SELECT pattern FROM container_ignore_patterns WHERE container_rid = ?",
      [containerRid],
    );
    const custom = rows.map((r) => r.pattern);
    return [...builtin, ...custom];
  }

  /**
   * 强制忽略指定的 Container Member（通过 force_ignore 标记，不改变生命周期状态）。
   *
   * @param {string} containerRid
   * @param {string} memberPath
   * @param {{ sourceId?: number }} options
   * @returns {Promise<{ ignored: boolean }>}
   */
  async ignoreMember(containerRid, memberPath, options = {}) {
    const { sourceId = null } = options;
    const member = await this.getMember(containerRid, memberPath, { sourceId });
    if (!member) {
      throw new Error(
        `成员不存在: ${memberPath}${sourceId ? ` (source ${sourceId})` : ""}`,
      );
    }

    await this.db.run(
      `UPDATE container_members SET force_ignore = 1, updated_at = datetime('now') WHERE id = ?`,
      [member.id],
    );

    return { ignored: true, path: memberPath };
  }

  /**
   * 取消强制忽略。
   */
  async unignoreMember(containerRid, memberPath, options = {}) {
    const { sourceId = null } = options;
    const member = await this.getMember(containerRid, memberPath, { sourceId });
    if (!member) {
      throw new Error(
        `成员不存在: ${memberPath}${sourceId ? ` (source ${sourceId})` : ""}`,
      );
    }
    if (!member.force_ignore) {
      throw new Error(`成员 "${memberPath}" 未被强制忽略`);
    }

    await this.db.run(
      `UPDATE container_members SET force_ignore = 0, updated_at = datetime('now') WHERE id = ?`,
      [member.id],
    );

    return { unignored: true, path: memberPath };
  }

  // ────────── Phase 4.1: Member API 补全 ──────────

  /**
   * 重命名成员路径（仅更新 DB，不动文件系统）。
   *
   * @param {string} containerRid
   * @param {string} memberPath - 当前路径
   * @param {string} newPath - 新路径
   * @param {{ sourceId?: number }} options
   * @returns {Promise<{ renamed: boolean, oldPath: string, newPath: string }>}
   */
  async renameMember(containerRid, memberPath, newPath, options = {}) {
    const { sourceId = null } = options;

    const member = await this.getMember(containerRid, memberPath, { sourceId });
    if (!member) {
      throw new Error(
        `成员不存在: ${memberPath}${sourceId ? ` (source ${sourceId})` : ""}`,
      );
    }

    // 检查目标路径是否已被占用（排除已删除的）
    const existing = await this.getMember(containerRid, newPath, { sourceId });
    if (existing && existing.status !== "deleted") {
      throw new Error(`目标路径已存在: ${newPath}`);
    }

    await this.db.run(
      `UPDATE container_members SET path = ?, name = ?, updated_at = datetime('now') WHERE id = ?`,
      [newPath, member.name, member.id],
    );

    return { renamed: true, oldPath: memberPath, newPath };
  }

  /**
   * 软删除成员（status → deleted，保留 resource_rid 和历史记录）。
   *
   * @param {string} containerRid
   * @param {string} memberPath
   * @param {{ sourceId?: number }} options
   * @returns {Promise<{ removed: boolean }>}
   */
  async removeMember(containerRid, memberPath, options = {}) {
    const { sourceId = null } = options;

    const member = await this.getMember(containerRid, memberPath, { sourceId });
    if (!member) {
      throw new Error(
        `成员不存在: ${memberPath}${sourceId ? ` (source ${sourceId})` : ""}`,
      );
    }

    if (member.status === "deleted") {
      throw new Error(`成员已被删除: ${memberPath}`);
    }

    // 状态机校验: indexed|promoted → deleted
    MemberStateMachine.validate(member.status, "remove", "deleted");

    await this.db.run(
      `UPDATE container_members SET status = 'deleted', updated_at = datetime('now') WHERE id = ?`,
      [member.id],
    );

    return { removed: true, path: memberPath };
  }

  /**
   * 恢复已删除的成员。
   * 如果删除前已提升（resource_rid 存在），恢复为 promoted；
   * 否则恢复为 indexed。
   *
   * @param {string} containerRid
   * @param {string} memberPath
   * @param {{ sourceId?: number }} options
   * @returns {Promise<{ restored: boolean, status: string }>}
   */
  async restoreMember(containerRid, memberPath, options = {}) {
    const { sourceId = null } = options;

    const member = await this.getMember(containerRid, memberPath, { sourceId });
    if (!member) {
      throw new Error(
        `成员不存在: ${memberPath}${sourceId ? ` (source ${sourceId})` : ""}`,
      );
    }

    if (member.status !== "deleted") {
      throw new Error(`成员未被删除，当前状态: ${member.status}`);
    }

    const newStatus = member.resource_rid ? "promoted" : "indexed";

    // 状态机校验: deleted → indexed|promoted
    MemberStateMachine.validate(member.status, "restore", newStatus);

    await this.db.run(
      `UPDATE container_members SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      [newStatus, member.id],
    );

    return { restored: true, path: memberPath, status: newStatus };
  }

  /**
   * 将成员移动到另一个容器。
   *
   * @param {string} containerRid - 源容器
   * @param {string} memberPath
   * @param {string} targetContainerRid - 目标容器
   * @param {{ sourceId?: number }} options
   * @returns {Promise<{ moved: boolean }>}
   */
  async moveMember(containerRid, memberPath, targetContainerRid, options = {}) {
    const { sourceId = null } = options;

    const member = await this.getMember(containerRid, memberPath, { sourceId });
    if (!member) {
      throw new Error(
        `成员不存在: ${memberPath}${sourceId ? ` (source ${sourceId})` : ""}`,
      );
    }

    if (!(await this.hasContainerCapability(targetContainerRid))) {
      throw new Error(
        `目标容器不具有 Container Capability: ${targetContainerRid}`,
      );
    }

    if (containerRid === targetContainerRid) {
      throw new Error("源容器与目标容器相同");
    }

    // 检查目标容器中是否已有同名路径
    const existing = await this.db.get(
      "SELECT id FROM container_members WHERE container_rid = ? AND path = ? AND status != ?",
      [targetContainerRid, memberPath, "deleted"],
    );
    if (existing) {
      throw new Error(`目标容器中已存在路径: ${memberPath}`);
    }

    await this.db.run(
      `UPDATE container_members SET container_rid = ?, updated_at = datetime('now') WHERE id = ?`,
      [targetContainerRid, member.id],
    );

    return {
      moved: true,
      path: memberPath,
      from: containerRid,
      to: targetContainerRid,
    };
  }

  /**
   * 复制成员到另一个容器。
   *
   * @param {string} containerRid - 源容器
   * @param {string} memberPath
   * @param {string} targetContainerRid - 目标容器
   * @param {{ sourceId?: number }} options
   * @returns {Promise<object>} 新创建的成员记录
   */
  async copyMember(containerRid, memberPath, targetContainerRid, options = {}) {
    const { sourceId = null } = options;

    const member = await this.getMember(containerRid, memberPath, { sourceId });
    if (!member) {
      throw new Error(
        `成员不存在: ${memberPath}${sourceId ? ` (source ${sourceId})` : ""}`,
      );
    }

    if (!(await this.hasContainerCapability(targetContainerRid))) {
      throw new Error(
        `目标容器不具有 Container Capability: ${targetContainerRid}`,
      );
    }

    // 检查目标容器中是否已有同名路径
    const existing = await this.db.get(
      "SELECT id FROM container_members WHERE container_rid = ? AND path = ? AND status != ?",
      [targetContainerRid, memberPath, "deleted"],
    );
    if (existing) {
      throw new Error(`目标容器中已存在路径: ${memberPath}`);
    }

    // 插入新成员记录（identity 保留，但 id 全新）
    const result = await this.db.run(
      `INSERT INTO container_members (container_rid, source_id, resource_rid, path, name, size, hash, modified_time, status, force_ignore, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'indexed', 0, ?)`,
      [
        targetContainerRid,
        member.source_id,
        member.resource_rid,
        member.path,
        member.name,
        member.size,
        member.hash,
        member.modified_time,
        JSON.stringify(member.metadata || {}),
      ],
    );

    return {
      copied: true,
      id: result.lastID,
      path: memberPath,
      to: targetContainerRid,
    };
  }

  _hydrateMember(row) {
    return {
      ...row,
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata || {},
    };
  }
}

module.exports = ContainerService;
