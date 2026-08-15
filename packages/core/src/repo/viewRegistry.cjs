/**
 * ViewRegistry — View 定义管理（方案 C：资源观察层）
 *
 * View 是独立的一等对象，由三部分组成：
 *   - Query Definition（query）：哪些 Resource 属于这个 View
 *   - Field Projection（fields）：显示哪些字段、顺序、别名、展示方式
 *   - Presentation Definition（type + config）：资源集合如何呈现
 *
 * View 不属于 Resource，不属于 Schema，也不是前端页面。View 不创建/不拥有
 * Resource，只是 Resource 集合的观察规则。Schema 提供字段定义，View 使用字段；
 * View 不强制绑定 Schema（无 schema 时可按 type/tag/metadata 等跨 Schema 组织）。
 *
 * query.conditions 支持的字段：
 *   - schema     目标 Schema（id 或 name；= / in，所有引用强校验必须存在）
 *   - type       资源类型（=）
 *   - tag        资源标签（contains / = / in）
 *   - capability 资源能力（= / in）
 *   - relation   关联资源（linked-to，value 为 RID，relationType 可选）
 *   - created / updated  时间条件（> / < / within-days）
 *   - 其余字段一律按 metadata 字段处理（json_extract）
 */

const PRESENTATION_TYPES = new Set([
  "table",
  "card",
  "kanban",
  "calendar",
  "timeline",
  "list",
]);
const STATUSES = new Set(["active", "deprecated"]);
const QUERY_FIELDS = new Set([
  "schema",
  "type",
  "tag",
  "capability",
  "relation",
  "created",
  "updated",
]);
const OPS = new Set([
  "=",
  "!=",
  ">",
  "<",
  "in",
  "contains",
  "within-days",
  "linked-to",
]);
const QUERY_DATE_FIELDS = new Set(["created", "updated"]);
const DATE_OPS = new Set([">", "<", "within-days"]);

/**
 * 各查询字段允许的 operator（校验与 SQL 一致，避免"校验通过但执行报错"）
 *  - schema / type / tag / capability / relation / created / updated
 *  - 其余字段一律按 metadata 字段处理（仅 = / != / > / < / contains / in）
 */
const FIELD_OPS = {
  schema: ["=", "in"],
  type: ["="],
  tag: ["contains", "=", "in"],
  capability: ["=", "in"],
  relation: ["linked-to"],
  created: [">", "<", "within-days"],
  updated: [">", "<", "within-days"],
};
const METADATA_OPS = ["=", "!=", ">", "<", "contains", "in"];

/**
 * 无 Schema View 允许投影的通用字段（rid/name 必含；title 可能缺失但 name 一定存在；
 * capabilities 不作为展示字段，仅作为查询条件）
 */
const GENERIC_FIELDS = new Set([
  "rid",
  "name",
  "title",
  "created",
  "updated",
  "tags",
  "type",
  "location",
  "location_kind",
]);

class ViewRegistry {
  /**
   * @param {import('./database.cjs')} db
   * @param {{ getSchemaRegistry?: Function }} [options]
   */
  constructor(db, { getSchemaRegistry } = {}) {
    this.db = db;
    this.getSchemaRegistry = getSchemaRegistry || (() => null);
  }

  /**
   * 归一化 Presentation Definition：
   * 统一结构 { type, config }。
   * - 新结构：presentation.type + presentation.config
   * - 旧结构兼容：顶层 mode（迁移前遗留）→ type；顶层 sort/group_by/kanban/calendar/timeline/card → config
   * @param {object} presentation
   * @returns {{ type: string, config: object }}
   */
  _normalizePresentation(presentation, legacyMode) {
    if (!presentation || typeof presentation !== "object") presentation = {};
    const LEGACY_KEYS = [
      "sort",
      "group_by",
      "kanban",
      "calendar",
      "timeline",
      "card",
    ];
    let type = presentation.type;
    let config = presentation.config;
    const hasLegacyShape =
      !type && LEGACY_KEYS.some((k) => presentation[k] !== undefined);

    if (type === undefined && (legacyMode || hasLegacyShape)) {
      type = legacyMode || "table";
    }
    if (type === undefined) type = "table";

    if (config === undefined) {
      config = {};
      for (const k of LEGACY_KEYS) {
        if (presentation[k] !== undefined) config[k] = presentation[k];
      }
      if (Object.keys(config).length === 0 && !hasLegacyShape) {
        const direct = { ...presentation };
        delete direct.type;
        config = direct;
      }
    }
    return { type, config };
  }

  _parse(row) {
    if (!row) return null;
    const presentationRaw =
      typeof row.presentation === "string"
        ? JSON.parse(row.presentation)
        : row.presentation || {};
    const { type, config } = this._normalizePresentation(
      presentationRaw,
      row.mode,
    );
    return {
      id: row.id,
      name: row.name,
      query:
        typeof row.query === "string"
          ? JSON.parse(row.query)
          : row.query || { conditions: [] },
      fields:
        typeof row.fields === "string"
          ? JSON.parse(row.fields)
          : row.fields || [],
      presentation: { type, config },
      status: row.status,
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata || {},
      created: row.created,
      updated: row.updated,
    };
  }

  /**
   * 解析 query 中所有 Schema 引用（schema 条件 = 或 in 的值），返回引用名数组
   * @param {object} query
   * @returns {string[]}
   */
  _collectSchemaRefs(query) {
    const refs = [];
    const conditions =
      query && Array.isArray(query.conditions) ? query.conditions : [];
    for (const cond of conditions) {
      if (cond && cond.field === "schema") {
        if (Array.isArray(cond.value)) {
          refs.push(...cond.value.filter((v) => typeof v === "string"));
        } else if (typeof cond.value === "string") {
          refs.push(cond.value);
        }
      }
    }
    return refs;
  }

  /**
   * 校验 Query Definition：结构 + 所有 Schema 引用必须存在（强校验，抽象到
   * "所有 Schema 引用"而非绑定某个条件/字段）
   * @param {object} query
   * @returns {Promise<{ schemaIds: string[], schemaNames: string[] }>} 解析出的 Schema
   */
  async _validateQuery(query) {
    if (!query || typeof query !== "object" || Array.isArray(query)) {
      throw new Error("ViewRegistry: query 必须是对象");
    }
    const conditions = query.conditions;
    if (conditions === undefined || conditions === null)
      return { schemaIds: [], schemaNames: [] };
    if (!Array.isArray(conditions))
      throw new Error("ViewRegistry: query.conditions 必须是数组");

    for (const cond of conditions) {
      if (
        !cond ||
        typeof cond !== "object" ||
        typeof cond.field !== "string" ||
        cond.field.length === 0
      ) {
        throw new Error("ViewRegistry: 每个查询条件必须包含非空 field");
      }
      const op = cond.operator || cond.op;
      if (!op || !OPS.has(op)) {
        throw new Error(
          `ViewRegistry: 条件 "${cond.field}" 的 operator "${op}" 非法（支持 ${[...OPS].join(", ")}）`,
        );
      }

      // 按字段类型限定合法 operator（与 _buildQuery 一致）
      if (QUERY_FIELDS.has(cond.field)) {
        const allowed = FIELD_OPS[cond.field];
        if (!allowed.includes(op)) {
          const phrase =
            cond.field === "schema"
              ? "只支持 = 或 in"
              : `只支持 ${allowed.join(", ")}`;
          throw new Error(
            `ViewRegistry: ${cond.field} 条件${phrase}，得到 "${op}"`,
          );
        }
      } else if (!METADATA_OPS.includes(op)) {
        throw new Error(
          `ViewRegistry: metadata 字段 "${cond.field}" 只支持 ${METADATA_OPS.join(", ")}，得到 "${op}"`,
        );
      }

      const validateStr = (msg) => {
        if (typeof cond.value !== "string" || cond.value.length === 0) {
          throw new Error(msg);
        }
      };
      const validateStrArray = (msg) => {
        if (
          !Array.isArray(cond.value) ||
          cond.value.length === 0 ||
          cond.value.some((v) => typeof v !== "string")
        ) {
          throw new Error(msg);
        }
      };

      if (cond.field === "relation") {
        if (op !== "linked-to")
          throw new Error("ViewRegistry: relation 条件只支持 linked-to");
        if (typeof cond.value !== "string" || cond.value.length === 0) {
          throw new Error(
            "ViewRegistry: relation 条件 value 必须是目标资源 RID",
          );
        }
      }
      if (QUERY_DATE_FIELDS.has(cond.field)) {
        if (!DATE_OPS.has(op)) {
          throw new Error(
            `ViewRegistry: ${cond.field} 条件只支持 ${[...DATE_OPS].join(", ")}`,
          );
        }
        if (typeof cond.value !== "number" && typeof cond.value !== "string") {
          throw new Error(
            `ViewRegistry: ${cond.field} 条件 value 必须是数字（天数/时间戳）`,
          );
        }
      }
      if (cond.field === "schema") {
        if (op === "=")
          validateStr(
            "ViewRegistry: schema 条件 value 必须是 Schema id 或 name",
          );
        if (op === "in")
          validateStrArray(
            "ViewRegistry: schema in 条件 value 必须是 Schema id/name 数组",
          );
      }
      if (cond.field === "capability") {
        if (op === "=")
          validateStr(`ViewRegistry: capability = 条件 value 必须是字符串`);
        if (op === "in")
          validateStrArray(
            `ViewRegistry: capability in 条件 value 必须是字符串数组`,
          );
      }
      if (cond.field === "tag") {
        if (op === "=" || op === "contains")
          validateStr(`ViewRegistry: tag ${op} 条件 value 必须是字符串`);
        if (op === "in")
          validateStrArray(`ViewRegistry: tag in 条件 value 必须是字符串数组`);
      }
      if (cond.field === "type") {
        validateStr("ViewRegistry: type 条件 value 必须是字符串");
      }
      if (!QUERY_FIELDS.has(cond.field) && op === "in") {
        validateStrArray(
          `ViewRegistry: metadata 字段 "${cond.field}" 的 in 条件 value 必须是数组`,
        );
      }
    }

    // 强校验：所有 Schema 引用必须存在（= 或 in 统一处理）
    const schemaRegistry = this.getSchemaRegistry();
    const schemaIds = [];
    const schemaNames = [];
    for (const ref of this._collectSchemaRefs(query)) {
      const byId = schemaRegistry ? await schemaRegistry.getSchema(ref) : null;
      const byName = schemaRegistry
        ? await schemaRegistry.getSchemaByName(ref)
        : null;
      const schema = byId || byName;
      if (!schema) {
        throw new Error(
          `ViewRegistry: query 引用的 Schema "${ref}" 不存在，请先创建对应 Schema`,
        );
      }
      schemaIds.push(schema.id);
      schemaNames.push(schema.name);
    }
    return { schemaIds, schemaNames };
  }

  /**
   * 校验 Field Projection：字段名必须有效（有 schema 时强校验存在；无 schema 时仅通用字段）
   * @param {object} query
   * @param {object[]} fields
   * @returns {Promise<object|null>} 目标 schema（单 schema = 条件时返回，用于字段强校验）
   */
  async _validateFields(query, fields) {
    if (!Array.isArray(fields))
      throw new Error("ViewRegistry: fields 必须是数组");
    for (const f of fields) {
      if (
        !f ||
        typeof f !== "object" ||
        typeof f.name !== "string" ||
        f.name.length === 0
      ) {
        throw new Error("ViewRegistry: 每个 field 必须包含非空 name");
      }
    }

    const schemaRefs = this._collectSchemaRefs(query);
    // 恰好一个 schema 引用时 → 字段强校验（schema.fields 或通用字段）
    if (schemaRefs.length === 1) {
      const schemaRegistry = this.getSchemaRegistry();
      const schema = schemaRegistry
        ? (await schemaRegistry.getSchema(schemaRefs[0])) ||
          (await schemaRegistry.getSchemaByName(schemaRefs[0]))
        : null;
      if (schema) {
        const schemaFieldNames = new Set(
          (schema.fields || []).map((f) => f.name),
        );
        for (const f of fields) {
          if (f.name === "rid" || f.name === "name") continue;
          if (!GENERIC_FIELDS.has(f.name) && !schemaFieldNames.has(f.name)) {
            throw new Error(
              `ViewRegistry: field "${f.name}" 既不是通用字段也不存在于 Schema "${schema.name}"`,
            );
          }
        }
      }
      return schema;
    }
    // 无 schema / 多 schema → 仅通用字段
    for (const f of fields) {
      if (!GENERIC_FIELDS.has(f.name)) {
        throw new Error(
          `ViewRegistry: 无 Schema 的 View 只能投影通用字段（${[...GENERIC_FIELDS].join(", ")}），得到 "${f.name}"`,
        );
      }
    }
    return null;
  }

  /**
   * 校验 Presentation Definition（统一结构 { type, config }）
   * @param {object} presentation
   * @param {object|null} schema
   */
  _validatePresentation(presentation, schema) {
    if (
      !presentation ||
      typeof presentation !== "object" ||
      Array.isArray(presentation)
    ) {
      throw new Error("ViewRegistry: presentation 必须是对象");
    }
    const { type, config } = this._normalizePresentation(presentation);
    if (!PRESENTATION_TYPES.has(type)) {
      throw new Error(
        `ViewRegistry: presentation.type "${type}" 非法（支持 ${[...PRESENTATION_TYPES].join(", ")}）`,
      );
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("ViewRegistry: presentation.config 必须是对象");
    }
    const validFieldNames = new Set([
      ...GENERIC_FIELDS,
      ...(schema && schema.fields ? schema.fields.map((f) => f.name) : []),
    ]);
    const checkField = (label, name) => {
      if (name && !validFieldNames.has(name)) {
        throw new Error(
          `ViewRegistry: presentation.config.${label} 引用字段 "${name}" 不存在`,
        );
      }
    };
    if (config.sort !== undefined) {
      if (!Array.isArray(config.sort))
        throw new Error("ViewRegistry: presentation.config.sort 必须是数组");
      for (const s of config.sort) {
        if (!s || typeof s.field !== "string")
          throw new Error("ViewRegistry: sort 条目必须包含 field");
        checkField("sort", s.field);
        if (s.order !== undefined && s.order !== "asc" && s.order !== "desc") {
          throw new Error("ViewRegistry: sort order 只能是 asc / desc");
        }
      }
    }
    checkField("group_by", config.group_by);
    if (config.kanban !== undefined) {
      if (!config.kanban || typeof config.kanban !== "object")
        throw new Error("ViewRegistry: presentation.config.kanban 必须是对象");
      if (
        config.kanban.columns !== undefined &&
        !Array.isArray(config.kanban.columns)
      ) {
        throw new Error(
          "ViewRegistry: presentation.config.kanban.columns 必须是数组",
        );
      }
    }
    if (config.calendar !== undefined) {
      if (!config.calendar || typeof config.calendar !== "object")
        throw new Error(
          "ViewRegistry: presentation.config.calendar 必须是对象",
        );
      checkField("calendar.date_field", config.calendar.date_field);
    }
    if (config.timeline !== undefined) {
      if (!config.timeline || typeof config.timeline !== "object")
        throw new Error(
          "ViewRegistry: presentation.config.timeline 必须是对象",
        );
      checkField("timeline.date_field", config.timeline.date_field);
    }
    if (config.card !== undefined) {
      if (!config.card || typeof config.card !== "object")
        throw new Error("ViewRegistry: presentation.config.card 必须是对象");
      checkField("card.title_field", config.card.title_field);
      checkField("card.description_field", config.card.description_field);
    }
  }

  /**
   * 创建 View
   * @param {{ id: string, name: string, query?: object, fields?: object[],
   *           presentation?: object, mode?: string, status?: string, metadata?: object }} input
   * @returns {Promise<object>}
   */
  async createView(input) {
    const {
      id,
      name,
      query = { conditions: [] },
      fields = [],
      presentation = {},
      mode,
      status = "active",
      metadata = {},
    } = input;
    if (!id || typeof id !== "string") throw new Error("ViewRegistry: id 必填");
    if (!name || typeof name !== "string")
      throw new Error("ViewRegistry: name 必填");
    if (!STATUSES.has(status))
      throw new Error(`ViewRegistry: status "${status}" 非法`);

    const schema = await this._validateFields(query, fields);
    await this._validateQuery(query);
    const normalized = this._normalizePresentation(presentation, mode);
    this._validatePresentation(normalized, schema);

    const now = Date.now();
    await this.db.run(
      `INSERT INTO views (id, name, query, fields, presentation, status, metadata, created, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        JSON.stringify(query),
        JSON.stringify(fields),
        JSON.stringify(normalized),
        status,
        JSON.stringify(metadata),
        now,
        now,
      ],
    );
    return this.getView(id);
  }

  /**
   * 按 id 查询 View
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getView(id) {
    const row = await this.db.get("SELECT * FROM views WHERE id = ?", [id]);
    return this._parse(row);
  }

  /**
   * 按 name 查询 View
   * @param {string} name
   * @returns {Promise<object|null>}
   */
  async getViewByName(name) {
    const row = await this.db.get("SELECT * FROM views WHERE name = ?", [name]);
    return this._parse(row);
  }

  /**
   * 列出 View，可按 status 过滤
   * @param {{ status?: string }} [filter]
   * @returns {Promise<object[]>}
   */
  async listViews(filter = {}) {
    const where = [];
    const params = [];
    if (filter.status) {
      where.push("status = ?");
      params.push(filter.status);
    }
    const sql = `SELECT * FROM views ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY name`;
    const rows = await this.db.all(sql, params);
    return rows.map((r) => this._parse(r));
  }

  /**
   * 更新 View。query / fields / presentation 变化视为结构变更（version 语义由上层决定）
   * @param {string} id
   * @param {{ name?: string, query?: object, fields?: object[], presentation?: object,
   *           mode?: string, status?: string, metadata?: object }} patch
   * @returns {Promise<object>}
   */
  async updateView(id, patch = {}) {
    const existing = await this.getView(id);
    if (!existing) throw new Error(`ViewRegistry: view "${id}" 不存在`);
    if (patch.status !== undefined && !STATUSES.has(patch.status)) {
      throw new Error(`ViewRegistry: status "${patch.status}" 非法`);
    }

    let presentation =
      patch.presentation !== undefined
        ? patch.presentation
        : existing.presentation;
    presentation = this._normalizePresentation(presentation);
    if (patch.mode !== undefined) {
      presentation = { type: patch.mode, config: presentation.config || {} };
    }

    const next = {
      name: patch.name !== undefined ? patch.name : existing.name,
      query: patch.query !== undefined ? patch.query : existing.query,
      fields: patch.fields !== undefined ? patch.fields : existing.fields,
      presentation,
      status: patch.status !== undefined ? patch.status : existing.status,
      metadata:
        patch.metadata !== undefined ? patch.metadata : existing.metadata,
    };

    const schema = await this._validateFields(next.query, next.fields);
    await this._validateQuery(next.query);
    this._validatePresentation(next.presentation, schema);

    await this.db.run(
      `UPDATE views SET name = ?, query = ?, fields = ?, presentation = ?, status = ?, metadata = ?, updated = ?
       WHERE id = ?`,
      [
        next.name,
        JSON.stringify(next.query),
        JSON.stringify(next.fields),
        JSON.stringify(next.presentation),
        next.status,
        JSON.stringify(next.metadata),
        Date.now(),
        id,
      ],
    );
    return this.getView(id);
  }

  /**
   * 删除 View
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteView(id) {
    const result = await this.db.run("DELETE FROM views WHERE id = ?", [id]);
    return result.changes > 0;
  }

  /**
   * 导出 View 定义（完整 JSON，供分享 / 导入）
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async exportView(id) {
    const view = await this.getView(id);
    if (!view) return null;
    const {
      id: vid,
      name,
      query,
      fields,
      presentation,
      metadata,
      status,
      created,
      updated,
    } = view;
    return {
      id: vid,
      name,
      query,
      fields,
      presentation,
      status,
      metadata,
      created,
      updated,
    };
  }

  /**
   * 导入 View 定义（从 exportView 输出创建）
   * @param {object} input
   * @returns {Promise<object>}
   */
  async importView(input) {
    return this.createView(input);
  }

  // ---- 查询执行（renderView 核心） ------------------------------------

  /**
   * 根据 View 查询资源并投影 / 排序 / 分组。
   * 返回结构化结果（不渲染，由 CLI / HTTP / 前端 Renderer 各自解释）。
   * @param {string} id
   * @param {{ limit?: number, offset?: number }} [options]
   * @returns {Promise<{ presentation: object, columns: object[], rows: object[], groups?: object[], total: number }>}
   */
  async renderView(id, { limit, offset } = {}) {
    const view = await this.getView(id);
    if (!view) throw new Error(`ViewRegistry: view "${id}" 不存在`);

    const schema = await this._resolveSchema(view.query);
    const schemaIdMap = await this._buildSchemaIdMap(view.query);
    const sql = this._buildQuery(view.query, { limit, offset, schemaIdMap });
    const rows = await this.db.all(sql.sql, sql.params);
    const hydrated = await this._hydrateRows(rows);

    const countSql = this._buildQuery(view.query, { schemaIdMap });
    const countRow = await this.db.get(
      `SELECT COUNT(*) AS total FROM (${countSql.sql})`,
      countSql.params,
    );

    // 排序与分组基于完整行（hydrated），投影放在最后，保证非投影字段也能排序/分组
    const sorted = this._applySort(view, hydrated);
    const config = (view.presentation && view.presentation.config) || {};
    const groupBy = config.group_by;
    if (groupBy) {
      const groups = this._applyGroup(view, sorted);
      const projectedGroups = groups.map((g) => ({
        key: g.key,
        rows: this._project(view, g.rows, schema).rows,
      }));
      return {
        presentation: view.presentation,
        columns: this._columns(view, schema),
        rows: null,
        groups: projectedGroups,
        total: countRow ? countRow.total : hydrated.length,
      };
    }

    return {
      presentation: view.presentation,
      columns: this._columns(view, schema),
      rows: this._project(view, sorted, schema).rows,
      groups: null,
      total: countRow ? countRow.total : hydrated.length,
    };
  }

  /**
   * 将 query 中所有 Schema 引用（id 或 name）解析为 id 映射，供 _buildQuery 使用
   * @param {object} query
   * @returns {Promise<Map<string,string>>}
   */
  async _buildSchemaIdMap(query) {
    const map = new Map();
    const refs = this._collectSchemaRefs(query);
    if (!refs.length) return map;
    const schemaRegistry = this.getSchemaRegistry();
    if (!schemaRegistry) return map;
    for (const ref of refs) {
      if (map.has(ref)) continue;
      const schema =
        (await schemaRegistry.getSchema(ref)) ||
        (await schemaRegistry.getSchemaByName(ref));
      if (schema) map.set(ref, schema.id);
    }
    return map;
  }

  /**
   * 解析 View 的 query 对应的唯一 Schema（仅当恰好一个 schema 引用）
   * @param {object} query
   * @returns {Promise<object|null>}
   */
  async _resolveSchema(query) {
    const refs = this._collectSchemaRefs(query);
    if (refs.length !== 1) return null;
    const schemaRegistry = this.getSchemaRegistry();
    if (!schemaRegistry) return null;
    const byId = await schemaRegistry.getSchema(refs[0]);
    if (byId) return byId;
    return schemaRegistry.getSchemaByName(refs[0]);
  }

  /**
   * 由 Query Definition 生成 SQL（六类条件）
   * @param {object} query
   * @param {{ limit?: number, offset?: number, schemaIdMap?: Map<string,string> }} [options]
   * @returns {{ sql: string, params: any[] }}
   */
  _buildQuery(query, { limit, offset, schemaIdMap } = {}) {
    let sql = "SELECT r.* FROM resources r WHERE r.deleted = 0";
    const params = [];
    const conditions =
      query && Array.isArray(query.conditions) ? query.conditions : [];

    for (const cond of conditions) {
      const op = cond.operator || cond.op;
      const schemaIds = (refs) => {
        if (!schemaIdMap) return refs;
        return refs.map((r) => schemaIdMap.get(r) || r);
      };
      switch (cond.field) {
        case "schema": {
          const refs = Array.isArray(cond.value) ? cond.value : [cond.value];
          const ids = schemaIds(refs);
          sql +=
            " AND EXISTS (SELECT 1 FROM resource_schemas rs WHERE rs.resource_rid = r.rid AND rs.schema_id IN (";
          sql += ids.map(() => "?").join(", ");
          sql += "))";
          params.push(...ids);
          break;
        }
        case "type": {
          sql += ` AND r.type ${op === "=" ? "=" : op} ?`;
          params.push(cond.value);
          break;
        }
        case "tag": {
          const placeholders = (vals) => vals.map(() => "?").join(", ");
          if (op === "contains") {
            sql +=
              " AND EXISTS (SELECT 1 FROM resource_tags t WHERE t.resource_rid = r.rid AND t.tag LIKE ?)";
            params.push(`%${cond.value}%`);
          } else if (op === "in") {
            const vals = Array.isArray(cond.value) ? cond.value : [cond.value];
            sql += ` AND EXISTS (SELECT 1 FROM resource_tags t WHERE t.resource_rid = r.rid AND t.tag IN (${placeholders(vals)}))`;
            params.push(...vals);
          } else {
            sql +=
              " AND EXISTS (SELECT 1 FROM resource_tags t WHERE t.resource_rid = r.rid AND t.tag = ?)";
            params.push(cond.value);
          }
          break;
        }
        case "capability": {
          if (op === "in") {
            const vals = Array.isArray(cond.value) ? cond.value : [cond.value];
            sql += ` AND EXISTS (SELECT 1 FROM resource_capabilities c WHERE c.resource_rid = r.rid AND c.capability IN (${vals.map(() => "?").join(", ")}))`;
            params.push(...vals);
          } else {
            sql +=
              " AND EXISTS (SELECT 1 FROM resource_capabilities c WHERE c.resource_rid = r.rid AND c.capability = ?)";
            params.push(cond.value);
          }
          break;
        }
        case "relation": {
          const target = cond.value;
          const rtype = cond.relationType;
          if (rtype) {
            sql +=
              " AND EXISTS (SELECT 1 FROM relations rel WHERE rel.from_rid = r.rid AND rel.to_rid = ? AND rel.type = ? AND rel.deleted = 0)";
            params.push(target, rtype);
          } else {
            sql +=
              " AND EXISTS (SELECT 1 FROM relations rel WHERE rel.from_rid = r.rid AND rel.to_rid = ? AND rel.deleted = 0)";
            params.push(target);
          }
          break;
        }
        case "created":
        case "updated": {
          const col = cond.field === "created" ? "r.created" : "r.updated";
          if (op === "within-days") {
            sql += ` AND ${col} >= ?`;
            params.push(Date.now() - Number(cond.value) * 24 * 3600 * 1000);
          } else {
            const val =
              typeof cond.value === "number"
                ? cond.value
                : Date.parse(cond.value);
            sql += ` AND ${col} ${op} ?`;
            params.push(val);
          }
          break;
        }
        default: {
          // metadata 字段（op 已被校验限制为 = / != / > / < / contains / in）
          if (op === "contains") {
            sql += ` AND json_extract(r.metadata, '$.${cond.field}') LIKE ?`;
            params.push(`%${cond.value}%`);
          } else if (op === "in") {
            const vals = Array.isArray(cond.value) ? cond.value : [cond.value];
            sql += ` AND json_extract(r.metadata, '$.${cond.field}') IN (${vals.map(() => "?").join(", ")})`;
            params.push(...vals);
          } else {
            sql += ` AND json_extract(r.metadata, '$.${cond.field}') ${op} ?`;
            params.push(cond.value);
          }
          break;
        }
      }
    }

    if (limit) {
      sql += " LIMIT ?";
      params.push(limit);
    } else if (offset) {
      // SQLite 不允许 OFFSET 单独出现，必须配合 LIMIT（-1 表示无限制）
      sql += " LIMIT -1";
    }
    if (offset) {
      sql += " OFFSET ?";
      params.push(offset);
    }
    return { sql, params };
  }

  /**
   * 行 hydration：补全 name/tags/type/path/metadata 并展开 schema 引用信息
   * @param {object[]} rows
   * @returns {Promise<object[]>}
   */
  async _hydrateRows(rows) {
    const schemaRegistry = this.getSchemaRegistry();
    const result = [];
    for (const row of rows) {
      const tags = await this.db.all(
        "SELECT tag FROM resource_tags WHERE resource_rid = ?",
        [row.rid],
      );
      const capabilities = await this.db.all(
        "SELECT capability FROM resource_capabilities WHERE resource_rid = ?",
        [row.rid],
      );
      let schemaRef = null;
      if (schemaRegistry) {
        const rs = await this.db.get(
          "SELECT schema_id, schema_version FROM resource_schemas WHERE resource_rid = ?",
          [row.rid],
        );
        if (rs) {
          const schema = await schemaRegistry.getSchema(rs.schema_id);
          if (schema)
            schemaRef = {
              id: schema.id,
              name: schema.name,
              version: rs.schema_version,
            };
        }
      }
      result.push({
        rid: row.rid,
        name: row.name,
        type: row.type,
        location_kind: row.location_kind,
        location: row.location,
        metadata:
          typeof row.metadata === "string"
            ? JSON.parse(row.metadata)
            : row.metadata || {},
        tags: tags.map((t) => t.tag),
        capabilities: capabilities.map((c) => c.capability),
        schema: schemaRef,
        created: row.created,
        updated: row.updated,
      });
    }
    return result;
  }

  /**
   * 生成投影列定义
   * @param {object} view
   * @param {object|null} schema
   * @returns {object[]}
   */
  _columns(view, schema) {
    const fields =
      view.fields && view.fields.length
        ? view.fields
        : this._defaultFields(schema);
    return fields.map((f) => ({
      name: f.name,
      label: f.label || f.name,
      format: f.format || "text",
    }));
  }

  /**
   * 字段投影：按 fields 定义选择字段（含通用字段 + metadata 字段），生成 columns
   * @param {object} view
   * @param {object[]} rows
   * @param {object|null} schema
   * @returns {{ columns: object[], rows: object[] }}
   */
  _project(view, rows, schema) {
    const fields =
      view.fields && view.fields.length
        ? view.fields
        : this._defaultFields(schema);
    const projected = rows.map((row) => {
      const out = {};
      for (const f of fields) {
        out[f.name] = this._resolveValue(row, f.name);
      }
      return out;
    });
    return { columns: this._columns(view, schema), rows: projected };
  }

  /**
   * 无显式 fields 时，根据 schema 自动生成默认投影
   * @param {object|null} schema
   * @returns {object[]}
   */
  _defaultFields(schema) {
    if (
      !schema ||
      !Array.isArray(schema.fields) ||
      schema.fields.length === 0
    ) {
      return [
        { name: "rid", label: "RID" },
        { name: "name", label: "名称" },
      ];
    }
    return schema.fields.map((f) => ({
      name: f.name,
      label: f.label || f.name,
    }));
  }

  /**
   * 解析单个字段值（通用字段优先，其余读 metadata）
   * @param {object} row
   * @param {string} name
   */
  _resolveValue(row, name) {
    switch (name) {
      case "rid":
        return row.rid;
      case "name":
        return row.name;
      case "title":
        return (row.metadata && row.metadata.title) || row.name;
      case "type":
        return row.type;
      case "location":
        return row.location;
      case "location_kind":
        return row.location_kind;
      case "tags":
        return row.tags;
      case "created":
        return row.created;
      case "updated":
        return row.updated;
      default:
        return row.metadata ? row.metadata[name] : undefined;
    }
  }

  /**
   * 排序
   * @param {object} view
   * @param {object[]} rows
   * @returns {object[]}
   */
  _applySort(view, rows) {
    const config = (view.presentation && view.presentation.config) || {};
    const sort = config.sort || [];
    if (!sort.length) return rows;
    return [...rows].sort((a, b) => {
      for (const s of sort) {
        const av = this._resolveValue(a, s.field);
        const bv = this._resolveValue(b, s.field);
        let cmp = 0;
        if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
        else
          cmp = String(av == null ? "" : av).localeCompare(
            String(bv == null ? "" : bv),
          );
        if (cmp !== 0) return s.order === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  }

  /**
   * 分组（看板 / 分组）
   * @param {object} view
   * @param {object[]} rows
   * @returns {object[]}
   */
  _applyGroup(view, rows) {
    const config = (view.presentation && view.presentation.config) || {};
    const groupBy = config.group_by;
    const groups = [];
    const map = new Map();
    for (const row of rows) {
      const key = String(
        this._resolveValue(row, groupBy) == null
          ? ""
          : this._resolveValue(row, groupBy),
      );
      if (!map.has(key)) {
        const g = { key, rows: [] };
        map.set(key, g);
        groups.push(g);
      }
      map.get(key).rows.push(row);
    }
    return groups;
  }
}

module.exports = ViewRegistry;
