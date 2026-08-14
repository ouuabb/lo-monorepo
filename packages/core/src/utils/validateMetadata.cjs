/**
 * 资源元数据严格校验模块
 *
 * 所有 resource metadata 写入 SQLite 前必须通过此校验，不通过直接报错。
 * 两个入口点：
 *   1. resourceService.create / update → 本地写入前
 *   2. syncOps._applyOp → 远程 ops 重放写入前
 *
 * 策略：
 *   - 已知字段：严格类型校验，不通过则 throw
 *   - 已知字段值域：白名单校验（如 status）
 *   - 未知字段：直接报错，不允许存在
 *   - category 空字符串自动规范化为 null
 *   - tags 重复值自动去重
 */

/**
 * 合法的 status 值
 */
const VALID_STATUSES = new Set(['draft', 'published', 'archived']);

/**
 * 已知的 metadata 字段规范
 * 每个字段定义：{ type: string, validator?: Function, normalize?: Function }
 */
const FIELD_SCHEMA = {
  title: {
    type: 'string',
    check(v) { return typeof v === 'string' && v.length > 0; }
  },
  wordCount: {
    type: 'number',
    check(v) { return typeof v === 'number' && Number.isInteger(v) && v >= 0; }
  },
  tags: {
    type: 'array',
    check(v) {
      if (!Array.isArray(v)) return false;
      return v.every(t => typeof t === 'string' && t.length > 0);
    }
  },
  category: {
    type: 'string|null',
    check(v) { return v === null || typeof v === 'string'; },
    normalize(v) { return (v === '' || v === undefined) ? null : v; }
  },
  status: {
    type: 'string',
    check(v) { return typeof v === 'string' && VALID_STATUSES.has(v); }
  },
  conflict: {
    type: 'boolean',
    check(v) { return typeof v === 'boolean'; }
  },
  original_rid: {
    type: 'string',
    check(v) { return typeof v === 'string' && v.startsWith('res_') && v.length > 0; }
  },
  mimetype: {
    type: 'string',
    check(v) { return typeof v === 'string' && v.includes('/') && v.length > 0; }
  },
  size: {
    type: 'number',
    check(v) { return typeof v === 'number' && v >= 0; }
  },
  // ── 冲突栈相关（syncOps stack_conflict 路径使用）──
  stacked: {
    type: 'boolean',
    check(v) { return typeof v === 'boolean'; }
  },
  conflict_source: {
    type: 'string',
    check(v) { return typeof v === 'string' && v.length > 0; }
  }
};

/**
 * 插件动态注册的 metadata 字段
 *
 * 两层注册：
 *   1. EXTRA_FIELDS — 全局字段（无 resourceType 关联），所有类型共享
 *   2. _typedFields — 按 resourceType 隔离的字段，仅对该类型生效
 *
 * 查询时先查 _typedFields[resourceType]，再查 EXTRA_FIELDS，最后查 FIELD_SCHEMA。
 */
const EXTRA_FIELDS = new Map();          // fieldName → schema（全局）
const _typedFields = new Map();          // resourceType → Map<fieldName, schema>
const _fieldOwners = new Map();          // ownerKey → { owner, name, resourceType }

function _ownerKey(fieldName, resourceType) {
  return resourceType ? `${resourceType}::${fieldName}` : fieldName;
}

/**
 * 注册插件自定义 metadata 字段
 * @param {string} name — 字段名
 * @param {{ type: string, check?: Function, normalize?: Function }} schema — 字段 schema
 * @param {object} [options]
 * @param {string} [options.owner] — 归属插件 ID（用于卸载时注销）
 * @param {string} [options.resourceType] — 关联的 resourceType（按类型隔离）
 */
function registerMetadataField(name, schema, options = {}) {
  if (!name || typeof name !== 'string') {
    throw new Error('registerMetadataField: name 必须是非空字符串');
  }
  if (!schema || typeof schema.check !== 'function') {
    throw new Error(`registerMetadataField: 字段 "${name}" 的 schema 必须包含 check 函数`);
  }
  const { owner, resourceType } = options;
  if (resourceType) {
    if (!_typedFields.has(resourceType)) {
      _typedFields.set(resourceType, new Map());
    }
    _typedFields.get(resourceType).set(name, schema);
  } else {
    EXTRA_FIELDS.set(name, schema);
  }
  if (owner) {
    _fieldOwners.set(_ownerKey(name, resourceType), { owner, name, resourceType });
  }
}

/**
 * 注销某插件注册的所有 metadata 字段（插件卸载时调用）
 * @param {string} owner — 插件 ID
 */
function unregisterMetadataFields(owner) {
  if (!owner) return;
  for (const [key, info] of _fieldOwners) {
    if (info.owner === owner) {
      if (info.resourceType) {
        const typeMap = _typedFields.get(info.resourceType);
        if (typeMap) typeMap.delete(info.name);
      } else {
        EXTRA_FIELDS.delete(info.name);
      }
      _fieldOwners.delete(key);
    }
  }
}

/**
 * 获取某字段 schema
 * 查询顺序：_typedFields[resourceType] → EXTRA_FIELDS → FIELD_SCHEMA
 * @param {string} name — 字段名
 * @param {string} [resourceType] — 资源类型（可选，用于按类型查询）
 */
function getFieldSchema(name, resourceType) {
  if (resourceType && _typedFields.has(resourceType)) {
    const typed = _typedFields.get(resourceType).get(name);
    if (typed) return typed;
  }
  return EXTRA_FIELDS.get(name) || FIELD_SCHEMA[name] || null;
}

/**
 * 校验并规范化 metadata 对象
 *
 * @param {object} metadata - 待校验的 metadata 对象
 * @param {object} [options]
 * @param {string} [options.context] - 调用上下文（用于错误信息），如 'create', 'sync_applyOp'
 * @param {boolean} [options.lenient=false] - 宽容模式：未知字段保留并警告（不报错）。
 *   用于远程同步场景——对端已校验过，本地不应因插件字段未注册而拒绝同步。
 * @param {string} [options.resourceType] - 资源类型，用于查询类型特定的 metadataSchema
 * @param {string[]} [options.extraKeys] - 额外允许的 key（Schema 声明的字段）。
 *   命中时跳过内置白名单直接保留（值由 SchemaRegistry 校验），schema 优先于内置字段定义。
 * @returns {{ valid: boolean, errors: string[], warnings: string[], normalized: object }}
 */
function validateMetadata(metadata, options = {}) {
  const { context = 'unknown', lenient = false, resourceType, extraKeys } = options;

  const errors = [];
  const warnings = [];
  const normalized = {};

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    errors.push(`metadata 必须是非空普通对象，收到: ${JSON.stringify(metadata)}`);
    return { valid: false, errors, warnings, normalized: {} };
  }

  // 合并已知字段：内置 + 全局插件字段 + 类型特定字段
  const knownKeys = new Set([...Object.keys(FIELD_SCHEMA), ...EXTRA_FIELDS.keys()]);
  if (resourceType && _typedFields.has(resourceType)) {
    for (const key of _typedFields.get(resourceType).keys()) {
      knownKeys.add(key);
    }
  }
  const extraSet = extraKeys ? new Set(extraKeys) : null;
  const inputKeys = Object.keys(metadata);

  for (const key of inputKeys) {
    if (key === '' || key.includes(' ')) {
      errors.push(`[${context}] metadata key 无效: "${key}"（key 不能为空或包含空格）`);
      continue;
    }

    // Schema 声明的字段：跳过内置白名单直接保留（值由 SchemaRegistry 校验）
    if (extraSet && extraSet.has(key)) {
      normalized[key] = metadata[key];
      continue;
    }

    const value = metadata[key];

    const schema = getFieldSchema(key, resourceType);
    if (schema) {
      // 规范化（如 category 空字符串 → null）
      let finalValue = value;
      if (schema.normalize) {
        finalValue = schema.normalize(value);
      }

      if (!schema.check(finalValue)) {
        const received = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
        errors.push(
          `[${context}] metadata.${key} 类型错误：期望 ${schema.type}，收到 ${received}`
        );
      } else {
        normalized[key] = finalValue;
      }
    } else {
      // 未知字段
      if (lenient) {
        // 宽容模式（远程同步）：保留字段，只记录警告
        // 场景：对端装了插件注册了自定义字段，本端没装该插件
        warnings.push(
          `[${context}] metadata 包含未知字段 "${key}"（lenient 模式保留，值: ${JSON.stringify(value)}）`
        );
        normalized[key] = value;
      } else {
        // 严格模式：直接报错
        errors.push(
          `[${context}] metadata 包含未知字段 "${key}"（值: ${JSON.stringify(value)}），不允许写入`
        );
      }
    }
  }

  // tags 重复值自动去重
  if (Array.isArray(normalized.tags)) {
    const unique = [...new Set(normalized.tags)];
    if (unique.length !== normalized.tags.length) {
      warnings.push(`[${context}] metadata.tags 包含重复值，已自动去重`);
      normalized.tags = unique;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized
  };
}

/**
 * 严格校验并返回规范化后的 metadata。
 * 校验不通过时抛出详细错误。
 *
 * @param {object} metadata - 待校验的 metadata 对象
 * @param {string} context - 调用上下文标识
 * @param {object} [options]
 * @param {boolean} [options.lenient=false] - 宽容模式（远程同步用）
 * @returns {object} 规范化后的 metadata
 * @throws {Error} 校验失败时抛出
 */
function assertMetadata(metadata, context = 'unknown', options = {}) {
  const result = validateMetadata(metadata, { context, ...options });

  // 打印警告（不阻塞）
  for (const warn of result.warnings) {
    const Logger = require('./logger.cjs');
    Logger.warn(warn);
  }

  if (!result.valid) {
    const msg = `元数据校验失败 (${context}):\n  - ${result.errors.join('\n  - ')}`;
    throw new Error(msg);
  }

  return result.normalized;
}

module.exports = { validateMetadata, assertMetadata, FIELD_SCHEMA, VALID_STATUSES, registerMetadataField, unregisterMetadataFields, getFieldSchema };
