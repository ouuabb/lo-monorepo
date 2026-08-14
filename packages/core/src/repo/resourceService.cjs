const RidUtils = require("../utils/rid.cjs");
const HashUtils = require("../utils/hash.cjs");
const ResourceType = require("../plugin/typeRegistry.cjs");
const { assertMetadata } = require("../utils/validateMetadata.cjs");
const fs = require("fs-extra");
const path = require("path");

class ResourceService {
  /**
   * @param {import('./database.cjs')} db
   * @param {{
   *   getCryptoKey?: () => Buffer|null,
   *   isEncryptByDefault?: () => boolean,
   *   getHookManager?: () => import('../plugin/hookManager.cjs')|null,
   *   getExtensionRegistry?: () => import('../plugin/extensionRegistry.cjs')|null,
   *   getSchemaRegistry?: () => import('./schemaRegistry.cjs')|null
   * }} options
   */
  constructor(db, options = {}) {
    this.db = db;
    /** 懒加载加密密钥获取函数（仅内存中存在） */
    this._getCryptoKey = options.getCryptoKey || null;
    /** 是否默认加密新文件（从仓库配置读取） */
    this._isEncryptByDefault = options.isEncryptByDefault || (() => false);
    /** 懒加载 HookManager 获取函数（PluginManager 懒初始化，故用 getter） */
    this._getHookManager = options.getHookManager || (() => null);
    /** 懒加载 ExtensionRegistry 获取函数 */
    this._getExtensionRegistry = options.getExtensionRegistry || (() => null);
    /** 懒加载 SchemaRegistry 获取函数 */
    this._getSchemaRegistry = options.getSchemaRegistry || (() => null);
  }

  /**
   * 获取当前加密密钥
   * @returns {Buffer|null}
   */
  get _cryptoKey() {
    return this._getCryptoKey ? this._getCryptoKey() : null;
  }

  /**
   * 获取 HookManager（可能为 null，表示无插件系统）
   */
  get _hooks() {
    return this._getHookManager();
  }

  /**
   * 获取 ExtensionRegistry（可能为 null）
   */
  get _extensions() {
    return this._getExtensionRegistry();
  }

  /**
   * 运行 before hook；若被取消则抛出特定错误
   * @param {string} name
   * @param {object} payload
   * @returns {Promise<object>} 处理后的 payload（若取消则抛错）
   */
  async _runBefore(name, payload) {
    const hooks = this._hooks;
    if (!hooks) return payload;
    const { cancelled, payload: newPayload } = await hooks.runBefore(
      name,
      payload,
    );
    if (cancelled) {
      const err = new Error(`操作被 hook '${name}' 取消`);
      err.cancelledByHook = name;
      throw err;
    }
    return newPayload;
  }

  /**
   * 运行 after hook（不阻塞，错误隔离）
   */
  async _runAfter(name, payload) {
    const hooks = this._hooks;
    if (!hooks) return;
    await hooks.runAfter(name, payload);
  }

  /**
   * 读取文件内容（自动处理加密/明文）
   * @param {string} filePath
   * @param {string} [encoding]
   * @returns {Promise<Buffer|string>}
   */
  async _readFile(filePath, encoding) {
    const raw = await fs.readFile(filePath);
    const CryptoUtils = require("../utils/crypto.cjs");

    // 检测是否为加密文件
    if (raw.length >= 4 && raw.subarray(0, 4).equals(CryptoUtils.MAGIC)) {
      const key = this._cryptoKey;
      if (!key) {
        throw new Error(
          `文件已加密但无法获取解密密钥: ${filePath}。请确保已通过 SSH 认证。`,
        );
      }
      const decrypted = CryptoUtils.decryptFile(raw, key);
      return encoding ? decrypted.toString(encoding) : decrypted;
    }

    return encoding ? raw.toString(encoding) : raw;
  }

  /**
   * 写入文件内容（根据加密策略决定是否加密）
   * @param {string} filePath
   * @param {Buffer|string} data
   * @param {{ encrypt?: boolean }} [opts] - encrypt=true 强制加密，未指定时使用仓库默认策略
   */
  async _writeFile(filePath, data, opts = {}) {
    const CryptoUtils = require("../utils/crypto.cjs");
    const key = this._cryptoKey;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8");
    const shouldEncrypt =
      opts.encrypt === true ||
      (opts.encrypt !== false && this._isEncryptByDefault());

    await fs.ensureDir(path.dirname(filePath));

    if (key && shouldEncrypt) {
      const encrypted = CryptoUtils.encryptFile(buf, key);
      await fs.writeFile(filePath, encrypted);
    } else {
      await fs.writeFile(filePath, buf);
    }
  }

  /**
   * 创建资源（入库）
   * @param {object} resource
   * @param {string} resource.type - 资源类型
   * @param {string} resource.path - 文件路径
   * @param {string} [resource.rid] - 预生成的 RID（可选，不提供则自动生成）
   * @param {string} resource.name - 资源逻辑名称（全局唯一）
   * @param {object} [resource.metadata] - 元数据
   * @param {string[]} [resource.capabilities] - 能力列表（如 ["container"]）
   * @param {object} [resource.container_schema] - 容器规则（如 allowed_types）
   * @param {string} [resource.schema] - 引用的 Schema（id 或 name），校验 metadata 字段并记录版本
   */
  async create(resource) {
    const {
      type,
      path: filePath,
      metadata: callerMeta = {},
      rid: preRid,
      capabilities = [],
      container_schema = {},
      schema: schemaRef,
    } = resource;
    const { name } = resource;

    // ── Hook: beforeResourceCreate ──
    // 允许插件修改 payload（如改写 metadata、注入字段）或取消操作
    const beforePayload = await this._runBefore("beforeResourceCreate", {
      resource: {
        type,
        path: filePath,
        name,
        metadata: callerMeta,
        rid: preRid,
        capabilities,
        container_schema,
      },
    });
    // 用 hook 返回值覆盖；undefined 表示未修改，仍用原值
    const hookRes = beforePayload.resource || {};
    const pick = (k, fallback) =>
      hookRes[k] !== undefined ? hookRes[k] : fallback;
    const finalType = pick("type", type);
    let finalPath = pick("path", filePath);
    const finalRid = pick("rid", preRid);
    const finalCapabilities = pick("capabilities", capabilities);
    const finalContainerSchema = pick("container_schema", container_schema);
    // metadata 合并：callerMeta 为主，hook 注入为辅（后者覆盖前者同名 key）
    const finalMeta = { ...callerMeta, ...(hookRes.metadata || {}) };
    // name 保留在 scope 中，在后续自动推导逻辑里再 pick 一次
    let finalName = pick("name", name);

    if (!finalName) {
      if (finalPath && typeof finalPath === "string") {
        // 自动推导 name：从文件路径提取
        const basename = path.basename(finalPath, path.extname(finalPath));
        finalName = basename
          .replace(/^\d{4}-\d{2}-\d{2}-/, "")
          .replace(/-[a-f0-9]{8}$/, "");
      } else {
        // 无文件也无 name：用 type + 时间戳生成唯一名（参考 1.md §6：资源可能没有文件）
        finalName = `${finalType || "resource"}-${Date.now()}`;
      }
    }

    // 确定 layer：同名时自动入栈（layer 1~19），否则 layer 0（活跃）
    let layer = 0;
    const active = await this.getByName(finalName); // 只查 layer=0
    if (active) {
      // 同名冲突 → 找下一个可用栈层级
      const stack = await this.getStack(finalName);
      const usedLayers = new Set(stack.map((r) => r.layer));
      for (let l = 1; l < 20; l++) {
        if (!usedLayers.has(l)) {
          layer = l;
          break;
        }
      }
      if (layer === 0) {
        throw new Error(
          `资源名称 "${finalName}" 栈已满（最多 20 层，含活跃层），无法入栈。请先 lo stack remove 释放空间。`,
        );
      }
    }

    // 无文件资源（虚拟资源，如翻译记录、浏览历史等）跳过文件操作
    // 参考 1.md §6："资源可能没有文件"
    const hasFile =
      finalPath && typeof finalPath === "string" && finalPath.length > 0;
    // resources.path 列有 NOT NULL 约束，无文件时用空字符串占位
    if (!hasFile) finalPath = "";

    // 自动提取元数据（title, wordCount, size, mtime），调用方传入的优先级更高
    // ── 扩展点: resourceTypes.<type>.extractMetadata ──
    const extracted = hasFile
      ? await this._extractMetadata(finalPath, finalType)
      : {};

    // ── Schema 解析（先于 metadata 校验）──
    // 指定 schema 时：解析定义，其字段名作为 extraKeys 允许进入 metadata，
    // 值随后按 schema 字段规则校验（schema 优先于内置白名单）
    let schemaRegistry = null;
    let schemaInfo = null;
    if (schemaRef) {
      schemaRegistry = this._getSchemaRegistry
        ? this._getSchemaRegistry()
        : null;
      if (!schemaRegistry) {
        throw new Error(
          `指定了 schema "${schemaRef}" 但 SchemaRegistry 未初始化`,
        );
      }
      schemaInfo =
        (await schemaRegistry.getSchema(schemaRef)) ||
        (await schemaRegistry.getSchemaByName(schemaRef));
      if (!schemaInfo) {
        throw new Error(
          `Schema "${schemaRef}" 不存在，请先创建或传入已注册的 Schema`,
        );
      }
    }

    const metadata = assertMetadata(
      { ...extracted, ...finalMeta },
      "resourceService.create",
      {
        resourceType: finalType,
        extraKeys: schemaInfo
          ? schemaInfo.fields.map((f) => f.name)
          : undefined,
      },
    );

    // ── Schema 值校验 ──
    if (schemaInfo) {
      const errors = schemaRegistry.validateValues(schemaInfo, metadata, {
        strictKeys: false,
      });
      if (errors.length > 0) {
        throw new Error(
          `Schema "${schemaInfo.name}" 校验失败:\n  - ${errors.join("\n  - ")}`,
        );
      }
    }

    let isDirectory = false;
    let plainHash = "";
    let alreadyEncrypted = false;
    let contentBuffer = null;

    if (hasFile) {
      // 检查 path 是否是目录（Container Resource 等场景）
      const stats = await fs.stat(finalPath);
      isDirectory = stats.isDirectory();

      if (!isDirectory) {
        contentBuffer = await fs.readFile(finalPath);
        const CryptoUtils = require("../utils/crypto.cjs");

        // 检测是否为已加密文件
        alreadyEncrypted =
          contentBuffer.length >= 4 &&
          contentBuffer.subarray(0, 4).equals(CryptoUtils.MAGIC);

        // 计算明文散列（用于变更检测），未加密文件直接散列，已加密文件需要先解密
        if (alreadyEncrypted) {
          if (!this._cryptoKey) {
            throw new Error(
              `文件已加密但无法获取解密密钥: ${finalPath}。请确保已通过 SSH 认证。`,
            );
          }
          const plaintext = CryptoUtils.decryptFile(
            contentBuffer,
            this._cryptoKey,
          );
          plainHash = HashUtils.fromBuffer(plaintext);
        } else {
          plainHash = HashUtils.fromBuffer(contentBuffer);
          // 仅在全仓库加密模式下才自动加密未加密文件
          if (this._cryptoKey && this._isEncryptByDefault()) {
            await CryptoUtils.writeEncryptedFile(
              finalPath,
              contentBuffer,
              this._cryptoKey,
            );
          }
        }
      }
    }

    const now = Date.now();
    if (finalRid && !RidUtils.validate(finalRid)) {
      throw new Error(`非法的 preRid: ${finalRid}，必须匹配 res_ 格式`);
    }
    const rid = finalRid || RidUtils.generate();
    const encrypted =
      alreadyEncrypted || (!!this._cryptoKey && this._isEncryptByDefault());

    const cleanMeta = { ...metadata };
    delete cleanMeta.tags;
    await this.db.run("SAVEPOINT tx_create");
    try {
      await this.db.run(
        `
        INSERT INTO resources (rid, name, layer, type, path, hash, metadata, encrypted, container_schema, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          rid,
          finalName,
          layer,
          finalType,
          finalPath,
          plainHash,
          JSON.stringify(cleanMeta),
          encrypted ? 1 : 0,
          JSON.stringify(finalContainerSchema),
          now,
          now,
        ],
      );

      // 同步写入 resource_tags
      const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
      for (const t of tags) {
        if (t && t.trim()) {
          await this.db.run(
            "INSERT OR IGNORE INTO resource_tags (resource_rid, tag) VALUES (?, ?)",
            [rid, t.trim()],
          );
        }
      }
      // 同步写入 resource_capabilities
      for (const c of finalCapabilities) {
        if (c && c.trim()) {
          await this.db.run(
            "INSERT OR IGNORE INTO resource_capabilities (resource_rid, capability) VALUES (?, ?)",
            [rid, c.trim()],
          );
        }
      }
      // 同步写入 container_ignore_patterns
      if (finalContainerSchema && finalContainerSchema.ignored_patterns) {
        for (const p of finalContainerSchema.ignored_patterns) {
          if (p && p.trim()) {
            await this.db.run(
              "INSERT OR IGNORE INTO container_ignore_patterns (container_rid, pattern) VALUES (?, ?)",
              [rid, p.trim()],
            );
          }
        }
      }
      // 同步写入 Resource → Schema 引用（记录创建时版本）
      if (schemaInfo && schemaRegistry) {
        await schemaRegistry.attachSchema(rid, schemaInfo.id);
      }

      await this.db.run("RELEASE tx_create");
    } catch (e) {
      await this.db.run("ROLLBACK TO tx_create");
      throw e;
    }

    const result = {
      rid,
      name: finalName,
      layer,
      type: finalType,
      path: finalPath,
      hash: plainHash,
      metadata,
      encrypted,
      capabilities: finalCapabilities,
      created: now,
      updated: now,
      schema: schemaInfo
        ? {
            id: schemaInfo.id,
            name: schemaInfo.name,
            version: schemaInfo.version,
          }
        : null,
    };

    // ── Hook: afterResourceCreate ──
    // 通知插件资源已创建（不阻塞，错误隔离）
    await this._runAfter("afterResourceCreate", { resource: result });

    return result;
  }

  async getByRid(rid) {
    const row = await this.db.get(
      `
      SELECT * FROM resources WHERE rid = ? AND deleted = 0
    `,
      [rid],
    );

    if (!row) return null;

    const resource = this._hydrate(row);
    resource.tags = await this._loadTags(rid);
    resource.capabilities = await this._loadCapabilities(rid);
    resource.schema = await this._loadSchema(rid);
    return resource;
  }

  async getByName(name) {
    // 默认只返回活跃层（layer=0）
    const row = await this.db.get(
      `
      SELECT * FROM resources WHERE name = ? AND layer = 0 AND deleted = 0
    `,
      [name],
    );

    if (!row) return null;

    const resource = this._hydrate(row);
    resource.tags = await this._loadTags(resource.rid);
    resource.capabilities = await this._loadCapabilities(resource.rid);
    resource.schema = await this._loadSchema(resource.rid);
    return resource;
  }

  async getByNameLayer(name, layer) {
    const row = await this.db.get(
      `
      SELECT * FROM resources WHERE name = ? AND layer = ? AND deleted = 0
    `,
      [name, layer],
    );

    if (!row) return null;

    const resource = this._hydrate(row);
    resource.tags = await this._loadTags(resource.rid);
    resource.capabilities = await this._loadCapabilities(resource.rid);
    resource.schema = await this._loadSchema(resource.rid);
    return resource;
  }

  /**
   * 获取指定名称的完整栈（所有层，按 layer 排序）
   * @param {string} name
   * @returns {Promise<Array>}
   */
  async getStack(name) {
    const rows = await this.db.all(
      `
      SELECT * FROM resources WHERE name = ? AND deleted = 0 ORDER BY layer ASC
    `,
      [name],
    );

    const resources = rows.map((row) => this._hydrate(row));
    for (const r of resources) {
      r.tags = await this._loadTags(r.rid);
      r.capabilities = await this._loadCapabilities(r.rid);
    }
    return resources;
  }

  /**
   * 提升：将指定 RID 的资源提升为活跃层（layer=0），原活跃层降入栈
   *
   *
   * @param {string} rid - 要提升的资源 RID
   * @returns {Promise<object>} 新的活跃层资源
   */
  async promote(rid) {
    const target = await this.getByRid(rid);
    if (!target) {
      throw new Error(`资源不存在: ${rid}`);
    }
    if (target.layer === 0) {
      throw new Error(`资源 ${rid} 已经是活跃层（layer=0），无需提升`);
    }

    const name = target.name;
    const targetOldLayer = target.layer;

    // 找到当前活跃层
    const active = await this.getByName(name);
    if (!active) {
      // 无活跃层：直接设为目标为 layer 0
      await this.db.run("UPDATE resources SET layer = 0 WHERE rid = ?", [rid]);
      return this.getByRid(rid);
    }

    // 三步交换，避免 UNIQUE(name,layer) 约束冲突
    await this.db.run("SAVEPOINT tx_promote");
    try {
      await this.db.run("UPDATE resources SET layer = ? WHERE rid = ?", [
        -1,
        active.rid,
      ]);
      await this.db.run("UPDATE resources SET layer = ? WHERE rid = ?", [
        0,
        target.rid,
      ]);
      await this.db.run("UPDATE resources SET layer = ? WHERE rid = ?", [
        targetOldLayer,
        active.rid,
      ]);
      await this.db.run("RELEASE tx_promote");
    } catch (e) {
      await this.db.run("ROLLBACK TO tx_promote");
      throw e;
    }

    return this.getByRid(rid);
  }

  /**
   * 从栈中移除指定 RID 的资源（硬删除）
   *
   *
   * @param {string} rid - 要移除的资源 RID
   * @returns {Promise<object>} { rid, removed: true }
   */
  async removeFromStack(rid) {
    const resource = await this.getByRid(rid);
    if (!resource) {
      throw new Error(`资源不存在: ${rid}`);
    }
    if (resource.layer === 0) {
      throw new Error(
        "不能移除活跃层（layer=0），请先 promote 其他资源或使用 delete",
      );
    }
    // 硬删除
    await this.db.run("DELETE FROM resources WHERE rid = ?", [rid]);
    await this.db.run(
      "DELETE FROM relations WHERE from_rid = ? OR to_rid = ?",
      [rid, rid],
    );
    return { rid, removed: true };
  }

  async getByPath(filePath) {
    const row = await this.db.get(
      `
      SELECT * FROM resources WHERE path = ? AND deleted = 0
    `,
      [filePath],
    );

    if (!row) return null;

    return this._hydrate(row);
  }

  async getByHash(filePath) {
    const hash = await HashUtils.fromFile(filePath, this._cryptoKey);
    const row = await this.db.get(
      `
      SELECT * FROM resources WHERE hash = ? AND deleted = 0
    `,
      [hash],
    );

    if (!row) return null;

    return this._hydrate(row);
  }

  async getAll(options = {}) {
    const { type, schema, limit, offset, activeOnly } = options;

    let sql = "SELECT r.* FROM resources r WHERE r.deleted = 0";
    const params = [];

    if (activeOnly) {
      sql += " AND r.layer = 0";
    }

    if (type) {
      sql += " AND r.type = ?";
      params.push(type);
    }

    if (schema) {
      sql +=
        " AND EXISTS (SELECT 1 FROM resource_schemas rs WHERE rs.resource_rid = r.rid AND rs.schema_id = ?)";
      params.push(schema);
    }

    sql += " ORDER BY r.created DESC";

    if (limit) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    if (offset) {
      sql += " OFFSET ?";
      params.push(offset);
    }

    const rows = await this.db.all(sql, params);
    const resources = rows.map((row) => this._hydrate(row));
    for (const r of resources) {
      r.tags = await this._loadTags(r.rid);
      r.capabilities = await this._loadCapabilities(r.rid);
    }
    return resources;
  }

  /**
   * 更新资源内容（写文件 + refresh 元数据）
   *
   * 从 serve 的 PUT /api/notes/:rid 兼容层下沉而来：
   * 保持文件加密状态不变，写文件后 refresh 提取 hash/metadata。
   * 供 notes.update 兼容层与 resource.update Operation handler 共用，
   * 保证 content 修改走统一的资源内容更新路径。
   *
   * @param {string} rid
   * @param {string|object} content — 新内容（对象会被 JSON.stringify）
   * @returns {Promise<object>} 更新后的资源
   */
  async updateContent(rid, content) {
    const resource = await this.getByRid(rid);
    if (!resource) {
      throw new Error(`资源不存在: ${rid}`);
    }

    const filePath = path.resolve(resource.path);
    const rawContent =
      typeof content === "string" ? content : JSON.stringify(content);

    // 保持文件的加密状态不变（已加密的继续加密，明文的保持明文）
    const wasEncrypted = resource.encrypted;
    if (this._cryptoKey && wasEncrypted) {
      const CryptoUtils = require("../utils/crypto.cjs");
      const encrypted = CryptoUtils.encryptFile(
        Buffer.from(rawContent, "utf-8"),
        this._cryptoKey,
      );
      await fs.writeFile(filePath, encrypted);
    } else {
      await fs.writeFile(filePath, rawContent, "utf-8");
    }

    // refresh() 统一提取标题、词数、hash（自动处理加密/明文）
    return this.refresh(rid);
  }

  async update(rid, updates) {
    const { path, hash, metadata, capabilities, container_schema, type } =
      updates;

    // ── Hook: beforeResourceUpdate ──
    const beforePayload = await this._runBefore("beforeResourceUpdate", {
      rid,
      updates: { path, hash, metadata, capabilities, container_schema, type },
    });
    const finalRid = beforePayload.rid !== undefined ? beforePayload.rid : rid;
    const finalUpdates =
      beforePayload.updates !== undefined ? beforePayload.updates : updates;
    const {
      path: fPath,
      hash: fHash,
      metadata: fMeta,
      capabilities: fCaps,
      container_schema: fSchema,
      type: fType,
    } = finalUpdates;

    await this.db.run("SAVEPOINT tx_update");
    try {
      let sql = "UPDATE resources SET updated = ?";
      const params = [Date.now()];

      // 确定资源的当前类型：更新时的 metadata 校验需要按类型查插件注册字段
      const curType =
        fType !== undefined
          ? fType
          : (await this.getByRid(finalRid))?.type || undefined;

      if (fPath) {
        sql += ", path = ?";
        params.push(fPath);
      }
      if (fHash) {
        sql += ", hash = ?";
        params.push(fHash);
      }
      if (fMeta) {
        // ── Schema 校验：若资源已绑定 Schema，更新值需满足 Schema 规则 ──
        let schemaInfo = null;
        const schemaRegistry = this._getSchemaRegistry
          ? this._getSchemaRegistry()
          : null;
        if (schemaRegistry) {
          const existingRes = await this.getByRid(finalRid);
          if (existingRes && existingRes.schema) {
            schemaInfo = await schemaRegistry.getSchema(existingRes.schema.id);
            if (schemaInfo) {
              const errors = schemaRegistry.validateValues(schemaInfo, fMeta, {
                strictKeys: false,
              });
              if (errors.length > 0) {
                throw new Error(
                  `Schema "${schemaInfo.name}" 校验失败:\n  - ${errors.join("\n  - ")}`,
                );
              }
            }
          }
        }
        const validated = assertMetadata(fMeta, "resourceService.update", {
          resourceType: curType,
          extraKeys: schemaInfo
            ? schemaInfo.fields.map((f) => f.name)
            : undefined,
        });
        const { tags: _, ...cleanMeta } = validated;
        sql += ", metadata = ?";
        params.push(JSON.stringify(cleanMeta));
      }
      if (fSchema !== undefined) {
        sql += ", container_schema = ?";
        params.push(JSON.stringify(fSchema));
      }
      if (fType !== undefined) {
        sql += ", type = ?";
        params.push(fType);
      }

      sql += " WHERE rid = ? AND deleted = 0";
      params.push(finalRid);

      const result = await this.db.run(sql, params);
      if (result.changes === 0) {
        await this.db.run("ROLLBACK TO tx_update");
        throw new Error("Resource not found");
      }

      // 同步 resource_tags
      if (fMeta && fMeta.tags !== undefined) {
        await this.db.run("DELETE FROM resource_tags WHERE resource_rid = ?", [
          finalRid,
        ]);
        const tags = Array.isArray(fMeta.tags) ? fMeta.tags : [];
        for (const t of tags) {
          if (t && t.trim()) {
            await this.db.run(
              "INSERT OR IGNORE INTO resource_tags (resource_rid, tag) VALUES (?, ?)",
              [finalRid, t.trim()],
            );
          }
        }
      }
      // 同步 resource_capabilities
      if (fCaps !== undefined) {
        await this.db.run(
          "DELETE FROM resource_capabilities WHERE resource_rid = ?",
          [finalRid],
        );
        for (const c of fCaps) {
          if (c && c.trim()) {
            await this.db.run(
              "INSERT OR IGNORE INTO resource_capabilities (resource_rid, capability) VALUES (?, ?)",
              [finalRid, c.trim()],
            );
          }
        }
      }
      // 同步 container_ignore_patterns
      if (fSchema !== undefined) {
        await this.db.run(
          "DELETE FROM container_ignore_patterns WHERE container_rid = ?",
          [finalRid],
        );
        const patterns =
          fSchema && fSchema.ignored_patterns ? fSchema.ignored_patterns : [];
        for (const p of patterns) {
          if (p && p.trim()) {
            await this.db.run(
              "INSERT OR IGNORE INTO container_ignore_patterns (container_rid, pattern) VALUES (?, ?)",
              [finalRid, p.trim()],
            );
          }
        }
      }

      await this.db.run("RELEASE tx_update");
    } catch (e) {
      await this.db.run("ROLLBACK TO tx_update");
      throw e;
    }

    const updated = await this.getByRid(finalRid);

    // ── Hook: afterResourceUpdate ──
    await this._runAfter("afterResourceUpdate", {
      rid: finalRid,
      resource: updated,
      updates: finalUpdates,
    });

    return updated;
  }

  async delete(rid, soft = true) {
    // 系统资源不可删除（覆盖 operation 层拦截不到的硬删路径）
    const systemCheck = await this.getByRid(rid);
    if (systemCheck && systemCheck.type === 'system') {
      throw new Error(`系统资源不可删除: ${rid}`);
    }

    // ── Hook: beforeResourceDelete ──
    const beforePayload = await this._runBefore("beforeResourceDelete", {
      rid,
      soft,
    });
    const finalRid = beforePayload.rid !== undefined ? beforePayload.rid : rid;
    const finalSoft =
      beforePayload.soft !== undefined ? beforePayload.soft : soft;

    const resource = finalSoft ? await this.getByRid(finalRid) : null;

    if (finalSoft) {
      // 软删除前释放名称（追加 rid 后缀），允许同名资源重新创建
      if (resource && resource.name) {
        await this.db.run(
          `
          UPDATE resources SET name = ?, deleted = 1, updated = ? WHERE rid = ?
        `,
          [`${resource.name}_del_${finalRid.slice(-8)}`, Date.now(), finalRid],
        );
      } else {
        await this.db.run(
          `
          UPDATE resources SET deleted = 1, updated = ? WHERE rid = ?
        `,
          [Date.now(), finalRid],
        );
      }
    } else {
      await this.db.run(
        `
        DELETE FROM resources WHERE rid = ?
      `,
        [finalRid],
      );

      await this.db.run(
        `
        DELETE FROM relations WHERE from_rid = ? OR to_rid = ?
      `,
        [finalRid, finalRid],
      );
    }

    // ── Hook: afterResourceDelete ──
    await this._runAfter("afterResourceDelete", {
      rid: finalRid,
      soft: finalSoft,
      deleted: true,
    });

    return { rid: finalRid, deleted: true };
  }

  async importFile(filePath, type = null, options = {}) {
    // 先按路径检查
    const existing = await this.getByPath(filePath);
    if (existing) {
      return existing;
    }

    const resourceType = type || ResourceType.fromPath(filePath);
    const metadata = await this._extractMetadata(filePath, resourceType);

    // 推导名称（去掉日期前缀和随机后缀）
    // 例如: 2026-07-07-我的笔记-a1b2c3d4.md → 我的笔记
    const basename = path.basename(filePath, path.extname(filePath));
    const name = basename
      .replace(/^\d{4}-\d{2}-\d{2}-/, "") // 去掉日期前缀
      .replace(/-[a-f0-9]{8}$/, ""); // 去掉随机后缀

    // 重名校验（交给 create 统一报错）

    return this.create({
      type: resourceType,
      path: filePath,
      name,
      metadata,
      ...options,
    });
  }

  async move(rid, newPath) {
    const resource = await this.getByRid(rid);
    if (!resource) {
      throw new Error("Resource not found");
    }

    await fs.move(resource.path, newPath);

    return this.update(rid, { path: newPath });
  }

  // 仅更新 DB 路径，不移动磁盘文件（用于 sync 检测到重命名时文件已在目标位置）
  async updatePath(rid, newPath) {
    return this.update(rid, { path: newPath });
  }

  async rehash(rid) {
    const resource = await this.getByRid(rid);
    if (!resource) {
      throw new Error("Resource not found");
    }

    // 读取文件内容并计算明文散列（加密文件需要先解密再散列）
    const rawBuffer = await fs.readFile(resource.path);
    const CryptoUtils = require("../utils/crypto.cjs");

    let plaintextBuffer;
    const isEncrypted =
      rawBuffer.length >= 4 &&
      rawBuffer.subarray(0, 4).equals(CryptoUtils.MAGIC);

    if (isEncrypted) {
      if (!this._cryptoKey) {
        throw new Error(
          `文件已加密但无法获取解密密钥: ${resource.path}。请确保已通过 SSH 认证。`,
        );
      }
      plaintextBuffer = CryptoUtils.decryptFile(rawBuffer, this._cryptoKey);
    } else {
      plaintextBuffer = rawBuffer;
    }

    const newHash = HashUtils.fromBuffer(plaintextBuffer);

    if (newHash !== resource.hash) {
      return this.update(rid, { hash: newHash });
    }

    return resource;
  }

  async refresh(rid) {
    const resource = await this.getByRid(rid);
    if (!resource) {
      throw new Error("Resource not found");
    }

    const newMeta = await this._extractMetadata(resource.path, resource.type);

    const rawBuffer = await fs.readFile(resource.path);
    const CryptoUtils = require("../utils/crypto.cjs");
    let plaintextBuffer;
    if (
      rawBuffer.length >= 4 &&
      rawBuffer.subarray(0, 4).equals(CryptoUtils.MAGIC)
    ) {
      if (!this._cryptoKey) {
        throw new Error("文件已加密但无法获取解密密钥");
      }
      plaintextBuffer = CryptoUtils.decryptFile(rawBuffer, this._cryptoKey);
    } else {
      plaintextBuffer = rawBuffer;
    }
    const newHash = HashUtils.fromBuffer(plaintextBuffer);

    const updates = { hash: newHash };
    // 合并新元数据到现有元数据（保留 tags/status 等手动设置的字段）
    const merged = { ...resource.metadata, ...newMeta };
    if (
      JSON.stringify(merged) !== JSON.stringify(resource.metadata) ||
      newHash !== resource.hash
    ) {
      updates.metadata = merged;
    }

    return this.update(rid, updates);
  }

  async _extractMetadata(filePath, type) {
    const metadata = {};

    // 注意：不记录 mtime/ctime，因为加密等操作会修改文件时间戳，
    // 导致后续 sync 的 metadata 比较误判为变更。
    // sync 的增量检测直接使用 fs.stat().mtime。

    // 目录（Container Resource）不提取文件级元数据
    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        return metadata;
      }
    } catch {
      return metadata;
    }

    if (type === "note") {
      try {
        const content = await this._readFile(filePath, "utf-8");
        const match = content.match(/^#\s+(.+)$/m);
        if (match) {
          metadata.title = match[1].trim();
        }
        metadata.wordCount = content
          .split(/\s+/)
          .filter((w) => w.length > 0).length;
      } catch (e) {
        // 忽略内容解析错误
      }
    }

    // ── 扩展点: resourceTypes.<type>.extractMetadata ──
    // 允许插件为自定义资源类型提供元数据提取器
    // handler 结构: { id, extractMetadata: async (filePath, stat) => metadataObj }
    const ext = this._extensions;
    if (ext) {
      const handler = ext.get("resourceTypes", type);
      if (handler && typeof handler.extractMetadata === "function") {
        try {
          const stats = await fs.stat(filePath);
          const extMeta = await handler.extractMetadata(filePath, stats);
          if (extMeta && typeof extMeta === "object") {
            Object.assign(metadata, extMeta);
          }
        } catch (e) {
          // 扩展点失败不阻塞主流程
          console.error(
            `[plugin] resourceTypes.${type}.extractMetadata failed: ${e.message}`,
          );
        }
      }
    }

    return metadata;
  }

  /**
   * 判断指定路径的文件是否加密（通过魔数检测）
   * @param {string} filePath - 文件路径
   * @returns {boolean}
   */
  isEncrypted(filePath) {
    const CryptoUtils = require("../utils/crypto.cjs");
    return CryptoUtils.isEncryptedFile(filePath);
  }

  _hydrate(row) {
    return {
      ...row,
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata,
      container_schema:
        typeof row.container_schema === "string"
          ? JSON.parse(row.container_schema)
          : row.container_schema || {},
      encrypted: row.encrypted === 1 || row.encrypted === true,
    };
  }

  async _loadTags(rid) {
    const rows = await this.db.all(
      "SELECT tag FROM resource_tags WHERE resource_rid = ?",
      [rid],
    );
    return rows.map((r) => r.tag);
  }

  async _loadCapabilities(rid) {
    const rows = await this.db.all(
      "SELECT capability FROM resource_capabilities WHERE resource_rid = ?",
      [rid],
    );
    return rows.map((r) => r.capability);
  }

  async _loadSchema(rid) {
    const schemaRegistry = this._getSchemaRegistry
      ? this._getSchemaRegistry()
      : null;
    if (!schemaRegistry) return null;
    const attached = await schemaRegistry.getResourceSchema(rid);
    if (!attached) return null;
    return {
      id: attached.id,
      name: attached.name,
      version: attached.attached_version,
    };
  }

  async _loadIgnorePatterns(rid) {
    const rows = await this.db.all(
      "SELECT pattern FROM container_ignore_patterns WHERE container_rid = ?",
      [rid],
    );
    return rows.map((r) => r.pattern);
  }
}

module.exports = ResourceService;
