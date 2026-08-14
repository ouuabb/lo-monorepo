/**
 * SchemaRegistry — Schema 定义与 Resource 引用管理
 *
 * Schema 是 Resource 的描述层（结构化语义），本模块提供：
 *   - Schema 定义 CRUD（fields / relations 存 JSON 列）
 *   - Resource → Schema 引用（记录创建时使用的 schema 版本）
 *   - 按 Schema 字段规则校验值（不依赖 validateMetadata 全局白名单）
 *
 * 关系：Resource.metadata 由 Schema 解释（Schema 不拥有 Metadata，只描述它）
 *
 * fields 结构：{ name, type, label?, description?, display?, required?, values?, min?, max?, target? }
 *   type ∈ text / number / boolean / date / datetime / enum / json / relation
 *   label / description 为展示名与语义说明；display 为展示方式（对象）
 *   relation 字段的 target 必须指向已存在的 Schema（强校验）
 * relations 结构：{ name, type, target? }（target 同样强校验存在性）
 * behaviors 结构：{ stateField?, titleField?, archiveField?, sortableFields?, ... }
 *   语义声明（不执行任何行为），引用的字段名必须存在于 fields 中
 */

const FIELD_TYPES = new Set([
  "text",
  "number",
  "boolean",
  "date",
  "datetime",
  "enum",
  "json",
  "relation",
]);
const STATUSES = new Set(["active", "deprecated"]);

class SchemaRegistry {
  /**
   * @param {import('./database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  _parse(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      fields:
        typeof row.fields === "string"
          ? JSON.parse(row.fields)
          : row.fields || [],
      relations:
        typeof row.relations === "string"
          ? JSON.parse(row.relations)
          : row.relations || [],
      status: row.status,
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata || {},
      behaviors:
        typeof row.behaviors === "string"
          ? JSON.parse(row.behaviors)
          : row.behaviors || {},
      created: row.created,
      updated: row.updated,
    };
  }

  _validateFields(fields) {
    if (!Array.isArray(fields)) {
      throw new Error("SchemaRegistry: fields 必须是数组");
    }
    for (const f of fields) {
      if (
        !f ||
        typeof f !== "object" ||
        typeof f.name !== "string" ||
        f.name.length === 0
      ) {
        throw new Error("SchemaRegistry: 每个 field 必须包含非空 name");
      }
      if (f.type && !FIELD_TYPES.has(f.type)) {
        throw new Error(
          `SchemaRegistry: field "${f.name}" 的 type "${f.type}" 非法`,
        );
      }
      if (f.type === "enum" && !Array.isArray(f.values)) {
        throw new Error(
          `SchemaRegistry: enum 字段 "${f.name}" 必须声明 values 数组`,
        );
      }
      if (f.type === "relation" && typeof f.target !== "string") {
        throw new Error(
          `SchemaRegistry: relation 字段 "${f.name}" 必须声明 target`,
        );
      }
      if (f.label !== undefined && typeof f.label !== "string") {
        throw new Error(
          `SchemaRegistry: field "${f.name}" 的 label 必须是字符串`,
        );
      }
      if (f.description !== undefined && typeof f.description !== "string") {
        throw new Error(
          `SchemaRegistry: field "${f.name}" 的 description 必须是字符串`,
        );
      }
      if (f.display !== undefined && typeof f.display !== "object") {
        throw new Error(
          `SchemaRegistry: field "${f.name}" 的 display 必须是对象`,
        );
      }
    }
  }

  /**
   * 强校验 relation 字段 / relations 条目的 target 必须指向已存在的 Schema
   * @param {{ name: string, type?: string, target?: string }[]} fields
   * @param {{ name: string, type?: string, target?: string }[]} [relations]
   * @returns {Promise<void>}
   */
  async _validateTargets(fields, relations = []) {
    const targets = new Set();
    for (const f of fields) {
      if (f.type === "relation" && f.target) targets.add(f.target);
    }
    for (const r of relations) {
      if (r && r.target) targets.add(r.target);
    }
    for (const target of targets) {
      const exists =
        (await this.getSchema(target)) || (await this.getSchemaByName(target));
      if (!exists) {
        throw new Error(
          `SchemaRegistry: relation target "${target}" 不存在，请先创建对应 Schema`,
        );
      }
    }
  }

  /**
   * 校验 behaviors 语义声明：已知语义键引用的字段必须存在于 fields 中。
   * 允许任意键（语义声明是开放扩展点），但 stateField / titleField / archiveField
   * 必须是字符串，sortableFields 必须是字段名数组。
   * @param {object[]} fields
   * @param {object} [behaviors]
   */
  _validateBehaviors(fields, behaviors = {}) {
    if (
      !behaviors ||
      typeof behaviors !== "object" ||
      Array.isArray(behaviors)
    ) {
      throw new Error("SchemaRegistry: behaviors 必须是对象");
    }
    const fieldNames = new Set(fields.map((f) => f.name));
    const singleKeys = ["stateField", "titleField", "archiveField"];
    for (const key of singleKeys) {
      if (behaviors[key] === undefined || behaviors[key] === null) continue;
      if (typeof behaviors[key] !== "string") {
        throw new Error(`SchemaRegistry: behaviors.${key} 必须是字段名字符串`);
      }
      if (!fieldNames.has(behaviors[key])) {
        throw new Error(
          `SchemaRegistry: behaviors.${key} 引用的字段 "${behaviors[key]}" 不存在`,
        );
      }
    }
    if (
      behaviors.sortableFields !== undefined &&
      behaviors.sortableFields !== null
    ) {
      if (!Array.isArray(behaviors.sortableFields)) {
        throw new Error(
          "SchemaRegistry: behaviors.sortableFields 必须是字段名数组",
        );
      }
      for (const name of behaviors.sortableFields) {
        if (typeof name !== "string" || !fieldNames.has(name)) {
          throw new Error(
            `SchemaRegistry: behaviors.sortableFields 引用的字段 "${name}" 不存在`,
          );
        }
      }
    }
  }

  /**
   * 创建 Schema
   * @param {{ id: string, name: string, version?: number,
   *           fields?: object[], relations?: object[], status?: string,
   *           metadata?: object, behaviors?: object }} input
   * @returns {Promise<object>}
   */
  async createSchema(input) {
    const {
      id,
      name,
      version = 1,
      fields = [],
      relations = [],
      status = "active",
      metadata = {},
      behaviors = {},
    } = input;
    if (!id || typeof id !== "string")
      throw new Error("SchemaRegistry: id 必填");
    if (!name || typeof name !== "string")
      throw new Error("SchemaRegistry: name 必填");
    this._validateFields(fields);
    if (!Array.isArray(relations))
      throw new Error("SchemaRegistry: relations 必须是数组");
    if (!STATUSES.has(status))
      throw new Error(`SchemaRegistry: status "${status}" 非法`);
    this._validateBehaviors(fields, behaviors);
    await this._validateTargets(fields, relations);

    const now = Date.now();
    await this.db.run(
      `INSERT INTO schemas (id, name, version, fields, relations, status, metadata, behaviors, created, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        version,
        JSON.stringify(fields),
        JSON.stringify(relations),
        status,
        JSON.stringify(metadata),
        JSON.stringify(behaviors),
        now,
        now,
      ],
    );
    return this.getSchema(id);
  }

  /**
   * 按 id 查询 Schema
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getSchema(id) {
    const row = await this.db.get("SELECT * FROM schemas WHERE id = ?", [id]);
    return this._parse(row);
  }

  /**
   * 按 name 查询 Schema
   * @param {string} name
   * @returns {Promise<object|null>}
   */
  async getSchemaByName(name) {
    const row = await this.db.get("SELECT * FROM schemas WHERE name = ?", [
      name,
    ]);
    return this._parse(row);
  }

  /**
   * 列出 Schema，可按 status 过滤
   * @param {{ status?: string }} [filter]
   * @returns {Promise<object[]>}
   */
  async listSchemas(filter = {}) {
    const where = [];
    const params = [];
    if (filter.status) {
      where.push("status = ?");
      params.push(filter.status);
    }
    const sql = `SELECT * FROM schemas ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY name`;
    const rows = await this.db.all(sql, params);
    return rows.map((r) => this._parse(r));
  }

  /**
   * 更新 Schema。fields / relations / behaviors 变化时自动升版（version + 1）
   * @param {string} id
   * @param {{ name?: string, version?: number,
   *           fields?: object[], relations?: object[], status?: string,
   *           metadata?: object, behaviors?: object }} patch
   * @returns {Promise<object>}
   */
  async updateSchema(id, patch = {}) {
    const existing = await this.getSchema(id);
    if (!existing) throw new Error(`SchemaRegistry: schema "${id}" 不存在`);
    if (patch.fields !== undefined) this._validateFields(patch.fields);
    if (patch.relations !== undefined && !Array.isArray(patch.relations)) {
      throw new Error("SchemaRegistry: relations 必须是数组");
    }
    if (patch.status !== undefined && !STATUSES.has(patch.status)) {
      throw new Error(`SchemaRegistry: status "${patch.status}" 非法`);
    }

    const next = {
      name: patch.name !== undefined ? patch.name : existing.name,
      version: patch.version !== undefined ? patch.version : existing.version,
      fields: patch.fields !== undefined ? patch.fields : existing.fields,
      relations:
        patch.relations !== undefined ? patch.relations : existing.relations,
      status: patch.status !== undefined ? patch.status : existing.status,
      metadata:
        patch.metadata !== undefined ? patch.metadata : existing.metadata,
      behaviors:
        patch.behaviors !== undefined ? patch.behaviors : existing.behaviors,
    };
    if (patch.behaviors !== undefined)
      this._validateBehaviors(next.fields, next.behaviors);
    const structureChanged =
      patch.fields !== undefined ||
      patch.relations !== undefined ||
      patch.behaviors !== undefined;
    if (structureChanged) {
      await this._validateTargets(next.fields, next.relations);
    }
    if (structureChanged && patch.version === undefined) {
      next.version += 1;
    }

    await this.db.run(
      `UPDATE schemas SET name = ?, version = ?, fields = ?, relations = ?, status = ?, metadata = ?, behaviors = ?, updated = ?
       WHERE id = ?`,
      [
        next.name,
        next.version,
        JSON.stringify(next.fields),
        JSON.stringify(next.relations),
        next.status,
        JSON.stringify(next.metadata),
        JSON.stringify(next.behaviors),
        Date.now(),
        id,
      ],
    );
    return this.getSchema(id);
  }

  /**
   * 删除 Schema（resource_schemas 引用随之级联删除）
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteSchema(id) {
    const result = await this.db.run("DELETE FROM schemas WHERE id = ?", [id]);
    return result.changes > 0;
  }

  /**
   * Resource 引用 Schema，记录当前版本号
   * @param {string} resourceRid
   * @param {string} schemaId
   * @returns {Promise<object>}
   */
  async attachSchema(resourceRid, schemaId) {
    const schema = await this.getSchema(schemaId);
    if (!schema) throw new Error(`SchemaRegistry: schema "${schemaId}" 不存在`);
    await this.db.run(
      `INSERT INTO resource_schemas (resource_rid, schema_id, schema_version, attached_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(resource_rid) DO UPDATE SET
         schema_id = excluded.schema_id,
         schema_version = excluded.schema_version,
         attached_at = excluded.attached_at`,
      [resourceRid, schemaId, schema.version, Date.now()],
    );
    return this.getResourceSchema(resourceRid);
  }

  /**
   * 查询 Resource 关联的 Schema（含创建时版本）
   * @param {string} resourceRid
   * @returns {Promise<object|null>}
   */
  async getResourceSchema(resourceRid) {
    const row = await this.db.get(
      "SELECT schema_id, schema_version, attached_at FROM resource_schemas WHERE resource_rid = ?",
      [resourceRid],
    );
    if (!row) return null;
    const schema = await this.getSchema(row.schema_id);
    if (!schema) return null;
    return {
      ...schema,
      attached_version: row.schema_version,
      attached_at: row.attached_at,
    };
  }

  /**
   * 解除 Resource 与 Schema 的引用
   * @param {string} resourceRid
   * @returns {Promise<boolean>}
   */
  async detachSchema(resourceRid) {
    const result = await this.db.run(
      "DELETE FROM resource_schemas WHERE resource_rid = ?",
      [resourceRid],
    );
    return result.changes > 0;
  }

  /**
   * 列出引用某 Schema 的 Resource（仅未删除资源，按关联时间倒序）
   * @param {string} schemaId
   * @returns {Promise<{ rid: string, name: string, type: string, schema_version: number, attached_at: number }[]>}
   */
  async listResourcesBySchema(schemaId) {
    const rows = await this.db.all(
      `SELECT r.rid, r.name, r.type, rs.schema_version, rs.attached_at
       FROM resource_schemas rs
       JOIN resources r ON r.rid = rs.resource_rid AND r.deleted = 0
       WHERE rs.schema_id = ?
       ORDER BY rs.attached_at DESC`,
      [schemaId],
    );
    return rows;
  }

  /**
   * Resource 的 Schema 公开视图（消费端使用：结构 + 关联版本，不含内部 status/metadata）
   * @param {string} resourceRid
   * @returns {Promise<object|null>}
   */
  async getResourceSchemaPublic(resourceRid) {
    const schema = await this.getResourceSchema(resourceRid);
    if (!schema) return null;
    const {
      id,
      name,
      version,
      fields,
      relations,
      behaviors,
      attached_version,
      attached_at,
    } = schema;
    return {
      id,
      name,
      version,
      fields,
      relations,
      behaviors,
      attached_version,
      attached_at,
    };
  }

  /**
   * 按 Schema 字段规则校验值集合
   *
   * strictKeys=true（默认）：schema 未定义的 key 视为错误
   * strictKeys=false：忽略 schema 未定义的 key（配合"Metadata 保持开放"原则，
   *   允许 title / wordCount 等 lo 内置自动提取字段与用户自定义字段共存）
   *
   * @param {object} schema
   * @param {object} values
   * @param {{ strictKeys?: boolean }} [options]
   * @returns {string[]} 错误列表（空数组表示通过）
   */
  validateValues(schema, values, { strictKeys = true } = {}) {
    const errors = [];
    if (!schema || !Array.isArray(schema.fields)) return errors;
    if (!values || typeof values !== "object" || Array.isArray(values))
      return errors;
    const fieldMap = new Map(schema.fields.map((f) => [f.name, f]));

    for (const field of schema.fields) {
      const value = values[field.name];
      const empty = value === undefined || value === null || value === "";
      if (field.required && empty) {
        errors.push(`字段 "${field.name}" 必填`);
      }
    }

    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null) continue;
      const field = fieldMap.get(key);
      if (!field) {
        if (strictKeys) {
          errors.push(`字段 "${key}" 未在 schema "${schema.name}" 中定义`);
        }
        continue;
      }
      const err = this._checkField(field, value);
      if (err) errors.push(err);
    }
    return errors;
  }

  _checkField(field, value) {
    const { name, type = "text" } = field;
    switch (type) {
      case "text": {
        if (typeof value !== "string")
          return `字段 "${name}" 期望 text，收到 ${typeof value}`;
        if (
          typeof field.maxLength === "number" &&
          value.length > field.maxLength
        ) {
          return `字段 "${name}" 超出最大长度 ${field.maxLength}`;
        }
        return null;
      }
      case "number": {
        if (typeof value !== "number")
          return `字段 "${name}" 期望 number，收到 ${typeof value}`;
        if (field.min !== undefined && value < field.min)
          return `字段 "${name}" 小于最小值 ${field.min}`;
        if (field.max !== undefined && value > field.max)
          return `字段 "${name}" 大于最大值 ${field.max}`;
        return null;
      }
      case "boolean":
        if (typeof value !== "boolean")
          return `字段 "${name}" 期望 boolean，收到 ${typeof value}`;
        return null;
      case "date":
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return `字段 "${name}" 期望日期 YYYY-MM-DD`;
        }
        return null;
      case "datetime":
        if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
          return `字段 "${name}" 期望合法日期时间`;
        }
        return null;
      case "enum":
        if (!Array.isArray(field.values) || !field.values.includes(value)) {
          return `字段 "${name}" 的取值必须属于 [${(field.values || []).join(", ")}]`;
        }
        return null;
      case "json":
        return null;
      case "relation":
        if (typeof value !== "string" || value.length === 0) {
          return `字段 "${name}" 期望资源 RID 字符串`;
        }
        return null;
      default:
        return null;
    }
  }
}

module.exports = SchemaRegistry;
