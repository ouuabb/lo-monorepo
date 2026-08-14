/**
 * Role — 角色模型
 *
 * Phase 6.4: 定义角色及默认角色。
 */

const Permission = require('./permission.cjs');

const BUILTIN_ROLES = {
  owner: {
    id: 'owner',
    name: 'Owner',
    description: '全部权限',
    permissions: ['*']
  },
  admin: {
    id: 'admin',
    name: 'Admin',
    description: '系统管理',
    permissions: [
      'resource.*',
      'relation.*',
      'graph.*',
      'workflow.*',
      'plugin.*',
      'event.*',
      'suggestion.*',
      'ai.*',
      'federation.*',
      'sync.*',
      'system.*'
    ]
  },
  editor: {
    id: 'editor',
    name: 'Editor',
    description: '读写知识',
    permissions: [
      'resource.read', 'resource.write', 'resource.export',
      'relation.create', 'relation.read', 'relation.delete',
      'graph.view', 'graph.analyze', 'graph.export',
      'workflow.execute',
      'event.subscribe',
      'ai.analyze', 'ai.summarize'
    ]
  },
  viewer: {
    id: 'viewer',
    name: 'Viewer',
    description: '只读',
    permissions: [
      'resource.read',
      'relation.read',
      'graph.view'
    ]
  },
  'ai-agent': {
    id: 'ai-agent',
    name: 'AI Agent',
    description: 'AI 代理（分析/建议/摘要）',
    permissions: [
      'resource.read',
      'relation.read',
      'graph.view', 'graph.analyze',
      'ai.analyze', 'ai.summarize',
      'suggestion.create',
      'event.subscribe'
    ]
  }
};

class Role {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {string} [opts.name]
   * @param {string} [opts.description]
   * @param {string[]} [opts.permissions]
   */
  constructor({ id, name, description, permissions } = {}) {
    if (!id) throw new Error('Role must have an id');

    this.id = id;
    this.name = name || id;
    this.description = description || '';
    this.permissions = (permissions || []).map(p => new Permission(p));
  }

  /**
   * 是否有某权限
   */
  hasPermission(action) {
    return this.permissions.some(p => p.matches(action));
  }

  /**
   * 获取所有权限代码
   */
  get permissionCodes() {
    return this.permissions.map(p => p.code);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      permissions: this.permissionCodes
    };
  }

  static fromJSON(json) {
    return new Role(json);
  }

  static builtins() {
    return Object.values(BUILTIN_ROLES).map(r => new Role(r));
  }

  static getBuiltin(id) {
    const def = BUILTIN_ROLES[id];
    return def ? new Role(def) : null;
  }
}

module.exports = Role;
