/**
 * SecurityManager — 安全统一入口
 *
 * Phase 6.9: 提供身份管理、认证、授权、审计的统一接口。
 * Repository 集成：repo.security → SecurityManager 实例。
 */

const Identity = require('./identity.cjs');
const Authentication = require('./authentication.cjs');
const Authorization = require('./authorization.cjs');
const AccessControl = require('./accessControl.cjs');
const ResourceGuard = require('./resourceGuard.cjs');
const AuditLogger = require('./auditLogger.cjs');
const Policy = require('./policy.cjs');
const SecurityEvent = require('./securityEvent.cjs');
const PolicyEngine = require('./policyEngine.cjs');
const PermissionManager = require('./permissionManager.cjs');
const PermissionAudit = require('./permissionAudit.cjs');

class SecurityManager {
  /**
   * @param {object} services
   * @param {object} services.db           — SQLite 数据库
   * @param {object} [services.eventBus]   — EventBus 实例
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.db = services.db;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;

    // 初始化完成标志
    this._initialized = false;
  }

  /**
   * 初始化安全子系统
   */
  async initialize() {
    if (this._initialized) return;

    // 1. 权限管理器
    this.permissionManager = new PermissionManager(this.db);
    await this.permissionManager.initialize();

    // 2. 审计日志
    this.permissionAudit = new PermissionAudit(this.db);
    this.auditLogger = new AuditLogger(this.db);

    // 3. 安全事件
    this.eventEmitter = new SecurityEvent(this.eventBus);

    // 4. 认证
    this.authentication = new Authentication(this.db, { logger: this.logger });

    // 5. 策略引擎（增强版）
    this.policyEngine = new PolicyEngine({
      permissionManager: this.permissionManager,
      audit: this.permissionAudit,
      db: this.db
    });

    // 6. 授权
    this.authorization = new Authorization({
      policyEngine: this.policyEngine,
      permissionManager: this.permissionManager,
      logger: this.logger
    });

    // 7. 访问控制
    this.accessControl = new AccessControl({
      authorization: this.authorization,
      auditLogger: this.auditLogger,
      eventEmitter: this.eventEmitter
    });

    // 8. 资源守卫
    this.resourceGuard = new ResourceGuard({
      accessControl: this.accessControl,
      logger: this.logger
    });

    this._initialized = true;
    this.logger.log('[security] SecurityManager initialized');
  }

  // ─── Identity ────────────────────────────────────────

  createIdentity(type, id, name) {
    switch (type) {
      case 'user':     return Identity.user(id, name);
      case 'agent':    return Identity.agent(id, name);
      case 'plugin':   return Identity.plugin(id, name);
      case 'workflow': return Identity.workflow(id, name);
      case 'service':  return Identity.service(id, name);
      case 'system':   return Identity.system();
      default: throw new Error(`Unknown identity type: ${type}`);
    }
  }

  // ─── Authentication ──────────────────────────────────

  async authenticate(credentials) {
    return this.authentication.authenticate(credentials);
  }

  async createApiKey(identityId, name) {
    return this.authentication.createApiKey(identityId, name);
  }

  async createToken(identityId, name, expiresMs) {
    return this.authentication.createToken(identityId, name, expiresMs);
  }

  async revokeCredential(credentialId) {
    return this.authentication.revokeCredential(credentialId);
  }

  async listCredentials(identityId) {
    return this.authentication.listCredentials(identityId);
  }

  // ─── Authorization ───────────────────────────────────

  async authorize(context, action, resource) {
    return this.authorization.authorize(context, action, resource);
  }

  async check(subject, action, resource) {
    return this.accessControl.can(subject, action, resource);
  }

  async canAll(subject, actions, resource) {
    return this.accessControl.canAll(subject, actions, resource);
  }

  // ─── Resource Guard ──────────────────────────────────

  async guard(action, context, resourceId) {
    return this.resourceGuard.guard(action, context, resourceId);
  }

  // ─── Audit ───────────────────────────────────────────

  async audit(options = {}) {
    return this.auditLogger.query(options);
  }

  async deniedStats(since) {
    return this.auditLogger.deniedStats(since);
  }

  async detectAnomalies(threshold, windowMs) {
    return this.auditLogger.detectAnomalies(threshold, windowMs);
  }

  // ─── Policy ──────────────────────────────────────────

  async addPolicy(policyDef) {
    const policy = new Policy(policyDef);
    await this.db.run(
      `INSERT INTO policies (id, subject, resource, effect, priority, condition_JSON, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [policy.id, policy.subject, policy.resource,
       policy.effect, policy.priority, JSON.stringify(policy.condition), JSON.stringify(policy.metadata)]
    );
    // 写入 policy_actions 表
    await this.db.run('DELETE FROM policy_actions WHERE policy_id = ?', [policy.id]);
    for (const action of policy.actions) {
      await this.db.run(
        'INSERT OR IGNORE INTO policy_actions (policy_id, action) VALUES (?, ?)',
        [policy.id, action]
      );
    }

    // 发布事件
    this.eventEmitter.policyChanged('system', policy.id);

    return policy;
  }

  async listPolicies() {
    try {
      const rows = await this.db.all('SELECT * FROM policies ORDER BY priority DESC');
      return rows;
    } catch {
      return [];
    }
  }

  async getPolicy(id) {
    try {
      return await this.db.get('SELECT * FROM policies WHERE id = ?', [id]);
    } catch {
      return null;
    }
  }

  async deletePolicy(id) {
    await this.db.run('DELETE FROM policies WHERE id = ?', [id]);
    this.eventEmitter.policyChanged('system', id);
  }

  // ─── 权限系统委托 ────────────────────────────────────

  async createRole(def) {
    return this.permissionManager.createRole(def);
  }

  async listRoles() {
    return this.permissionManager.listRoles();
  }

  async assignRole(subjectId, roleId) {
    return this.permissionManager.assignRole(subjectId, roleId);
  }

  async unassignRole(subjectId, roleId) {
    return this.permissionManager.unassignRole(subjectId, roleId);
  }

  async getSubjectRoles(subjectId) {
    return this.permissionManager.getSubjectRoles(subjectId);
  }

  async grantPermission(subjectId, action) {
    return this.permissionManager.grantPermission(subjectId, action);
  }

  async revokePermission(subjectId, action) {
    return this.permissionManager.revokePermission(subjectId, action);
  }

  async setResourceACL(resourceId, policy) {
    return this.permissionManager.setResourceACL(resourceId, policy);
  }

  async getResourceACL(resourceId) {
    return this.permissionManager.getResourceACL(resourceId);
  }
}

module.exports = SecurityManager;
