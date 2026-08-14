/**
 * PermissionManager — 权限管理器
 *
 * Phase 6.4: 统一权限管理入口。
 *
 * API:
 *   createRole / getRole / listRoles
 *   assignRole / unassignRole
 *   getSubjectRoles / getSubjectPermissions
 *   grantPermission / revokePermission
 *   setResourceACL / getResourceACL
 */

const Role = require("./role.cjs");
const ResourcePolicy = require("./resourcePolicy.cjs");

class PermissionManager {
  /**
   * @param {import('../repo/database.cjs')} db
   */
  constructor(db) {
    this.db = db;

    /** @type {Map<string, Role>} */
    this._roles = new Map();

    /** @type {Map<string, Set<string>>} subjectId → roleIds */
    this._subjectRoles = new Map();

    /** @type {Map<string, Set<string>>} subjectId → permission codes */
    this._subjectPermissions = new Map();

    /** @type {Map<string, ResourcePolicy>} resourceId → ACL */
    this._resourceACL = new Map();

    // 内存中加载内置角色
    for (const role of Role.builtins()) {
      this._roles.set(role.id, role);
    }
  }

  /**
   * 初始化：加载默认角色
   */
  async initialize() {
    // 从 DB 加载自定义角色
    try {
      const rows = await this.db.all("SELECT * FROM roles");
      for (const row of rows) {
        if (!this._roles.has(row.id)) {
          // 从 role_permissions 表读取权限
          const permRows = await this.db.all(
            "SELECT permission FROM role_permissions WHERE role_id = ?",
            [row.id],
          );
          const permissions = permRows.map((p) => p.permission);
          this._roles.set(
            row.id,
            new Role({
              id: row.id,
              name: row.name,
              description: row.description,
              permissions,
            }),
          );
        }
      }

      // 加载角色分配
      const assignments = await this.db.all("SELECT * FROM subjects_roles");
      for (const a of assignments) {
        if (!this._subjectRoles.has(a.subject_id)) {
          this._subjectRoles.set(a.subject_id, new Set());
        }
        this._subjectRoles.get(a.subject_id).add(a.role_id);
      }

      // 加载直接权限
      const perms = await this.db.all("SELECT * FROM permissions");
      for (const p of perms) {
        if (!this._subjectPermissions.has(p.subject_id)) {
          this._subjectPermissions.set(p.subject_id, new Set());
        }
        this._subjectPermissions.get(p.subject_id).add(p.action);
      }

      // 加载 ACL
      const acls = await this.db.all("SELECT * FROM resource_acl");
      for (const a of acls) {
        if (!this._resourceACL.has(a.resource_id)) {
          this._resourceACL.set(
            a.resource_id,
            new ResourcePolicy({ resourceId: a.resource_id }),
          );
        }
        const rp = this._resourceACL.get(a.resource_id);
        if (a.deny) {
          rp.deny.push({ subjectId: a.subject_id, permission: a.permission });
        } else {
          rp.allow.push({ subjectId: a.subject_id, permission: a.permission });
        }
      }
    } catch (e) {
      // 可能表不存在，跳过
    }
  }

  // ── Role ──

  async createRole(roleDef) {
    const role = new Role(roleDef);
    await this.db.run(
      "INSERT OR REPLACE INTO roles (id, name, description) VALUES (?, ?, ?)",
      [role.id, role.name, role.description],
    );
    // 写入 role_permissions 表
    await this.db.run("DELETE FROM role_permissions WHERE role_id = ?", [
      role.id,
    ]);
    for (const perm of role.permissionCodes) {
      await this.db.run(
        "INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)",
        [role.id, perm],
      );
    }
    this._roles.set(role.id, role);
    return role;
  }

  getRole(id) {
    return this._roles.get(id) || null;
  }

  listRoles() {
    return Array.from(this._roles.values()).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissionCount: r.permissions.length,
    }));
  }

  // ── Subject Role ──

  async assignRole(subjectId, roleId) {
    const role = this._roles.get(roleId);
    if (!role) throw new Error(`Role '${roleId}' not found`);

    await this.db.run(
      "INSERT OR REPLACE INTO subjects_roles (subject_id, role_id) VALUES (?, ?)",
      [subjectId, roleId],
    );

    if (!this._subjectRoles.has(subjectId)) {
      this._subjectRoles.set(subjectId, new Set());
    }
    this._subjectRoles.get(subjectId).add(roleId);
  }

  async unassignRole(subjectId, roleId) {
    await this.db.run(
      "DELETE FROM subjects_roles WHERE subject_id = ? AND role_id = ?",
      [subjectId, roleId],
    );

    const roles = this._subjectRoles.get(subjectId);
    if (roles) {
      roles.delete(roleId);
    }
  }

  getSubjectRoles(subjectId) {
    const roleIds = this._subjectRoles.get(subjectId);
    if (!roleIds) return [];

    const roles = [];
    for (const rid of roleIds) {
      const role = this._roles.get(rid);
      if (role) roles.push(role);
    }
    return roles;
  }

  // ── Direct Permissions ──

  async grantPermission(subjectId, action) {
    if (!this._subjectPermissions.has(subjectId)) {
      this._subjectPermissions.set(subjectId, new Set());
    }
    this._subjectPermissions.get(subjectId).add(action);

    const id = `perm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await this.db.run(
      "INSERT OR REPLACE INTO permissions (id, subject_id, action) VALUES (?, ?, ?)",
      [id, subjectId, action],
    );
  }

  async revokePermission(subjectId, action) {
    await this.db.run(
      "DELETE FROM permissions WHERE subject_id = ? AND action = ?",
      [subjectId, action],
    );

    const perms = this._subjectPermissions.get(subjectId);
    if (perms) {
      perms.delete(action);
    }
  }

  getSubjectPermissions(subjectId) {
    const perms = this._subjectPermissions.get(subjectId);
    return perms ? Array.from(perms) : [];
  }

  // ── Resource ACL ──

  async setResourceACL(resourceId, policy) {
    // 删除旧 ACL
    await this.db.run("DELETE FROM resource_acl WHERE resource_id = ?", [
      resourceId,
    ]);

    // 插入新的
    for (const a of policy.allow || []) {
      await this.db.run(
        "INSERT INTO resource_acl (resource_id, subject_id, permission, deny) VALUES (?, ?, ?, 0)",
        [resourceId, a.subjectId, a.permission],
      );
    }

    for (const d of policy.deny || []) {
      await this.db.run(
        "INSERT INTO resource_acl (resource_id, subject_id, permission, deny) VALUES (?, ?, ?, 1)",
        [resourceId, d.subjectId, d.permission],
      );
    }

    this._resourceACL.set(
      resourceId,
      new ResourcePolicy({
        resourceId,
        allow: policy.allow || [],
        deny: policy.deny || [],
      }),
    );
  }

  getResourceACL(resourceId) {
    return this._resourceACL.get(resourceId) || null;
  }
}

module.exports = PermissionManager;
