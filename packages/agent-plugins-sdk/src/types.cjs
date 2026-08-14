/**
 * types.cjs —— Capability / Permission 类型定义
 *
 * SDK 定义插件能力与权限的类型常量；Host 据此收集/校验。
 */

/**
 * 插件可声明的能力（扩展点）类型
 * 对齐 012 §7：commands / views / panels / editors / services
 */
const CAPABILITY_TYPES = ['commands', 'views', 'panels', 'editors', 'services'];

/**
 * 默认权限（未声明时）——最小权限：只读 + 无存储/网络/shell
 * 对齐 012 §8.2：插件默认只能读，写操作（operations.write 等）需显式声明。
 */
const DEFAULT_PERMISSIONS = {
  lo: [
    'operations.read',
    'relations.read',
    'events.read',
    'resources.read',
    'health.read',
  ],
  storage: false,
  network: false,
  shell: false,
};

/** lo 能力权限白名单（与 lo-facade 契约对齐） */
const PERMISSION_LO = {
  READ_OPS: 'operations.read',
  WRITE_OPS: 'operations.write',
  READ_REL: 'relations.read',
  WRITE_REL: 'relations.write',
  READ_EVENTS: 'events.read',
  READ_RES: 'resources.read',
  WRITE_RES: 'resources.write',
  READ_HEALTH: 'health.read',
};

/**
 * 合并 manifest.permissions 与默认值
 * @param {object} [declared] — manifest.permissions
 * @returns {object} 完整权限对象
 */
function resolvePermissions(declared = {}) {
  return {
    lo: Array.isArray(declared.lo) ? declared.lo : DEFAULT_PERMISSIONS.lo,
    storage:
      typeof declared.storage === 'boolean'
        ? declared.storage
        : DEFAULT_PERMISSIONS.storage,
    network:
      typeof declared.network === 'boolean'
        ? declared.network
        : DEFAULT_PERMISSIONS.network,
    shell:
      typeof declared.shell === 'boolean' ? declared.shell : DEFAULT_PERMISSIONS.shell,
  };
}

module.exports = {
  CAPABILITY_TYPES,
  DEFAULT_PERMISSIONS,
  PERMISSION_LO,
  resolvePermissions,
};
