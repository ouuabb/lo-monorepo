/**
 * lo-facade.cjs —— ctx.lo 接口契约
 *
 * 只定义插件侧可见的 lo 能力面**契约**（命名空间 + 方法签名），
 * 不包含任何实现，不 require @lo/client。
 *
 * 边界：
 *   - SDK 不替代 @lo/client（不封装 HTTP/协议）
 *   - SDK 不定义二次协议（不新增 operations/events/relations 之外的方法）
 *   - ctx.lo 的实现由 Host Adapter 注入（lo-agent 内映射到 @lo/client）
 *   - 权限模型：meta.permissions 提供白名单（permissions.lo 能力名数组），
 *     未授权的 ctx.lo 方法调用抛错；未提供 permissions 时默认全拒绝（最小权限）。
 *
 * 依赖方向：
 *   Plugin → ctx.lo（契约）→ Host Adapter（实现）→ @lo/client → lo Core
 */

const { PERMISSION_LO } = require('./types.cjs');

/**
 * 契约命名的能力面（描述性，供 Host 对齐）
 * 这些命名空间与 @lo/client 的能力面一致；SDK 不实现它们。
 */
const LO_CAPABILITIES = {
  operations: ['execute', 'list', 'get', 'undo'],
  relations: ['list', 'get', 'create', 'update', 'remove'],
  events: ['subscribe', 'history'],
  resources: ['list', 'get', 'search'],
  health: ['stats'],
};

/**
 * ctx.lo 方法 → 所需权限（PERMISSION_LO 常量）
 * 每个命名空间方法映射到单个权限能力名。
 */
const LO_PERMISSION_MAP = {
  operations: {
    execute: PERMISSION_LO.WRITE_OPS,
    list: PERMISSION_LO.READ_OPS,
    get: PERMISSION_LO.READ_OPS,
    undo: PERMISSION_LO.WRITE_OPS,
  },
  relations: {
    list: PERMISSION_LO.READ_REL,
    get: PERMISSION_LO.READ_REL,
    create: PERMISSION_LO.WRITE_REL,
    update: PERMISSION_LO.WRITE_REL,
    remove: PERMISSION_LO.WRITE_REL,
  },
  events: {
    subscribe: PERMISSION_LO.READ_EVENTS,
    history: PERMISSION_LO.READ_EVENTS,
  },
  resources: {
    list: PERMISSION_LO.READ_RES,
    get: PERMISSION_LO.READ_RES,
    search: PERMISSION_LO.READ_RES,
  },
  health: {
    stats: PERMISSION_LO.READ_HEALTH,
  },
};

/** 判断权限白名单是否包含指定能力；未提供 permissions 时不限制（向后兼容） */
function hasPermission(permissions, permission) {
  if (permissions === undefined) return true;
  if (!permissions || !Array.isArray(permissions.lo)) return false;
  return permissions.lo.includes(permission);
}

/**
 * 构造 ctx.lo —— 接收 Host 注入的实现（Host Adapter）
 *
 * @param {object} [impl] — Host 注入的 lo 能力实现（每个命名空间是方法集合）
 * @param {{ pluginId?: string, permissions?: { lo?: string[] } }} [meta]
 *   - pluginId: 供错误提示
 *   - permissions: 插件权限（resolvePermissions 输出）。未授权方法调用抛错；
 *     未提供 permissions 时不限制（SDK 契约默认向后兼容）。
 * @returns {object} ctx.lo 门面
 *
 * 说明：
 *   - 若 impl 未注入，返回 noop 门面（调用抛错提示）
 *   - 若 impl 注入，按契约白名单透传，不透传未声明能力
 *   - 权限过滤（仅在提供 permissions 时）：每次调用前校验，未授权抛错（最小权限原则）
 */
function createLoFacade(impl = null, meta = {}) {
  const pluginId = meta.pluginId || 'plugin';
  const permissions = meta.permissions;

  const notInjected = (ns, name) => () => {
    throw new Error(
      `[lo-facade] ${pluginId} 调用 ctx.lo.${ns}.${name} 失败：` +
        'lo 能力实现未注入，请确认插件运行在 lo-agent 中（Host Adapter 提供实现）',
    );
  };

  const notAuthorized = (ns, name, required) => () => {
    throw new Error(
      `[lo-facade] ${pluginId} 调用 ctx.lo.${ns}.${name} 被拒绝：` +
        `需要权限 '${required}'，请在 manifest.permissions.lo 中声明`,
    );
  };

  const facade = {};
  for (const [ns, methods] of Object.entries(LO_CAPABILITIES)) {
    facade[ns] = {};
    const nsImpl = impl && impl[ns];
    const permissionMap = LO_PERMISSION_MAP[ns] || {};
    for (const name of methods) {
      const required = permissionMap[name];
      const authorized = required === undefined || hasPermission(permissions, required);
      let fn;
      if (!authorized) {
        fn = notAuthorized(ns, name, required);
      } else if (nsImpl && typeof nsImpl[name] === 'function') {
        fn = nsImpl[name];
      } else {
        fn = notInjected(ns, name);
      }
      facade[ns][name] = fn;
    }
  }
  return facade;
}

module.exports = { createLoFacade, LO_CAPABILITIES, LO_PERMISSION_MAP };
