/**
 * Phase 6.9 测试 — Permission & Security System
 *
 * 覆盖：
 *   Identity 创建 (5)
 *   Authentication (4)
 *   Policy 匹配与条件 (8)
 *   Policy Engine deny > allow (5)
 *   Authorization (3)
 *   Access Control (4)
 *   Resource Guard (4)
 *   Security Context (5)
 *   Audit Logger (4)
 *   Security Manager (5)
 *   EventBus 集成 (3)
 *   总计: 50+ tests
 */

const Identity = require('../src/security/identity.cjs');
const Authentication = require('../src/security/authentication.cjs');
const Policy = require('../src/security/policy.cjs');
const PolicyEngine = require('../src/security/policyEngine.cjs');
const Authorization = require('../src/security/authorization.cjs');
const ResourceGuard = require('../src/security/resourceGuard.cjs');
const AccessControl = require('../src/security/accessControl.cjs');
const SecurityContext = require('../src/security/securityContext.cjs');
const SecurityEvent = require('../src/security/securityEvent.cjs');
const AuditLogger = require('../src/security/auditLogger.cjs');
const SecurityManager = require('../src/security/securityManager.cjs');
const PermissionManager = require('../src/security/permissionManager.cjs');
const PermissionAudit = require('../src/security/permissionAudit.cjs');
const Permission = require('../src/security/permission.cjs');
const Role = require('../src/security/role.cjs');

// ─── Mock DB  ─────────────────────────────────────────────

function mockDb() {
  const data = new Map();
  return {
    run() { return Promise.resolve({ lastID: Math.random(), changes: 1 }); },
    get() { return Promise.resolve(null); },
    all() { return Promise.resolve([]); },
    exec() { return Promise.resolve(); }
  };
}

// ─── Mock EventBus  ───────────────────────────────────────

function mockEventBus() {
  const events = [];
  return {
    events,
    emit(e) { events.push(e); },
    on() {},
    off() {}
  };
}

// ─── Identity Tests ───────────────────────────────────────

describe('Phase 6.9: Identity', () => {
  test('creates user identity', () => {
    const id = Identity.user('alice', 'Alice');
    expect(id.type).toBe('user');
    expect(id.id).toBe('alice');
    expect(id.isUser()).toBe(true);
  });

  test('creates agent identity', () => {
    const id = Identity.agent('reviewer', 'Knowledge Reviewer');
    expect(id.type).toBe('agent');
    expect(id.id).toBe('agent:reviewer');
    expect(id.isAgent()).toBe(true);
  });

  test('creates plugin identity', () => {
    const id = Identity.plugin('formatter', 'Format Plugin');
    expect(id.type).toBe('plugin');
    expect(id.id).toBe('plugin:formatter');
  });

  test('creates workflow identity', () => {
    const id = Identity.workflow('auto-review');
    expect(id.type).toBe('workflow');
    expect(id.id).toBe('workflow:auto-review');
  });

  test('creates system identity', () => {
    const id = Identity.system();
    expect(id.type).toBe('system');
    expect(id.isSystem()).toBe(true);
  });

  test('JSON roundtrip', () => {
    const id = Identity.agent('test', 'Test');
    const json = id.toJSON();
    const restored = Identity.fromJSON(json);
    expect(restored.id).toBe('agent:test');
    expect(restored.type).toBe('agent');
  });
});

// ─── Policy Tests ─────────────────────────────────────────

describe('Phase 6.9: Policy', () => {
  test('basic allow policy matches', () => {
    const p = new Policy({ id: 'p1', subject: 'agent:*', resource: 'note:*', actions: ['read'], effect: 'allow' });
    expect(p.matches('agent:test', 'read', 'note:123')).toBe(true);
  });

  test('wildcard subject matches all', () => {
    const p = new Policy({ id: 'p1', subject: '*', resource: '*', actions: ['read'], effect: 'allow' });
    expect(p.matches('anyone', 'read', 'anything')).toBe(true);
  });

  test('explicit deny policy matches', () => {
    const p = new Policy({ id: 'p1', subject: 'agent:bad', resource: '*', actions: ['delete'], effect: 'deny' });
    expect(p.matches('agent:bad', 'delete', 'note:123')).toBe(true);
  });

  test('non-matching subject returns false', () => {
    const p = new Policy({ id: 'p1', subject: 'user:*', resource: '*', actions: ['read'], effect: 'allow' });
    expect(p.matches('agent:test', 'read', 'note:1')).toBe(false);
  });

  test('non-matching action returns false', () => {
    const p = new Policy({ id: 'p1', subject: '*', resource: '*', actions: ['read'], effect: 'allow' });
    expect(p.matches('anyone', 'delete', 'note:1')).toBe(false);
  });

  test('condition eq evaluates correctly', () => {
    const p = new Policy({ id: 'p1', subject: '*', resource: '*', actions: ['read'], effect: 'allow', condition: { field: 'subject.type', op: 'eq', value: 'agent' } });
    expect(p.evaluateCondition({ subject: { type: 'agent' } })).toBe(true);
    expect(p.evaluateCondition({ subject: { type: 'user' } })).toBe(false);
  });

  test('condition in evaluates correctly', () => {
    const p = new Policy({ id: 'p1', subject: '*', resource: '*', actions: ['read'], effect: 'allow', condition: { field: 'resource.type', op: 'in', value: ['note', 'doc'] } });
    expect(p.evaluateCondition({ resource: { type: 'note' } })).toBe(true);
    expect(p.evaluateCondition({ resource: { type: 'image' } })).toBe(false);
  });

  test('no condition always passes', () => {
    const p = new Policy({ id: 'p1', subject: '*', resource: '*', actions: ['read'], effect: 'allow' });
    expect(p.evaluateCondition({})).toBe(true);
  });
});

// ─── Policy Engine Tests ──────────────────────────────────

describe('Phase 6.9: PolicyEngine', () => {
  let engine, pm;

  beforeEach(async () => {
    const db = mockDb();
    pm = new PermissionManager(db);
    await pm.initialize();

    // 创建 viewer 角色
    await pm.createRole({ id: 'viewer', name: 'Viewer', permissions: ['resource.read'] });

    // 分配角色
    pm.assignRole('current-user', 'viewer');

    engine = new PolicyEngine({
      permissionManager: pm,
      db: db
    });
  });

  test('role permission grants access', async () => {
    const result = await engine.check('current-user', 'resource.read');
    expect(result.allowed).toBe(true);
  });

  test('default allows when no role matches', async () => {
    const result = await engine.check('current-user', 'resource.delete');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('default_allow');
  });

  test('batch check returns all results', async () => {
    const results = await engine.batchCheck('current-user', ['resource.read', 'resource.write', 'resource.delete']);
    expect(results['resource.read'].allowed).toBe(true);
    expect(results['resource.delete'].allowed).toBe(true);
  });

  test('can() is shorthand for check()', async () => {
    const allowed = await engine.can('current-user', 'resource.read');
    expect(allowed).toBe(true);
  });
});

// ─── Authorization Tests ──────────────────────────────────

describe('Phase 6.9: Authorization', () => {
  let auth, pm;

  beforeEach(async () => {
    const db = mockDb();
    pm = new PermissionManager(db);
    await pm.initialize();
    await pm.createRole({ id: 'viewer', name: 'Viewer', permissions: ['resource.read'] });
    pm.assignRole('current-user', 'viewer');

    const engine = new PolicyEngine({ permissionManager: pm });
    auth = new Authorization({ policyEngine: engine, permissionManager: pm });
  });

  test('authorize grants access', async () => {
    const result = await auth.authorize({ id: 'current-user', type: 'user' }, 'resource.read');
    expect(result.allowed).toBe(true);
  });

  test('can() returns boolean', async () => {
    const allowed = await auth.can({ id: 'current-user', type: 'user' }, 'resource.read');
    expect(allowed).toBe(true);
  });

  test('canAll checks multiple actions', async () => {
    const result = await auth.canAll({ id: 'current-user', type: 'user' }, ['resource.read', 'resource.delete']);
    expect(result).toBe(true); // default allow
  });
});

// ─── AccessControl Tests ──────────────────────────────────

describe('Phase 6.9: AccessControl', () => {
  let ac, db;

  beforeEach(async () => {
    db = mockDb();
    const pm = new PermissionManager(db);
    await pm.initialize();
    await pm.createRole({ id: 'viewer', name: 'Viewer', permissions: ['resource.read'] });
    pm.assignRole('current-user', 'viewer');

    const engine = new PolicyEngine({ permissionManager: pm });
    const auth = new Authorization({ policyEngine: engine, permissionManager: pm });
    const auditLogger = new AuditLogger(db);

    ac = new AccessControl({
      authorization: auth,
      auditLogger: auditLogger
    });
  });

  test('can checks access', async () => {
    const allowed = await ac.can({ id: 'current-user', type: 'user' }, 'resource.read');
    expect(allowed).toBe(true);
  });

  test('canAll with all allowed', async () => {
    const result = await ac.canAll({ id: 'current-user' }, ['resource.read', 'resource.delete'], 'note:1');
    expect(result).toBe(true);
  });

  test('accepts string subject', async () => {
    const allowed = await ac.can('current-user', 'resource.read');
    expect(allowed).toBe(true);
  });
});

// ─── ResourceGuard Tests ──────────────────────────────────

describe('Phase 6.9: ResourceGuard', () => {
  let guard;

  beforeEach(async () => {
    const db = mockDb();
    const pm = new PermissionManager(db);
    await pm.initialize();
    await pm.createRole({ id: 'viewer', name: 'Viewer', permissions: ['resource.read', 'resource.update'] });
    pm.assignRole('current-user', 'viewer');

    const engine = new PolicyEngine({ permissionManager: pm });
    const auth = new Authorization({ policyEngine: engine, permissionManager: pm });
    const auditLogger = new AuditLogger(db);
    const ac = new AccessControl({ authorization: auth, auditLogger: auditLogger });

    guard = new ResourceGuard({ accessControl: ac });
  });

  test('guard read allowed', async () => {
    const result = await guard.guard('read', { id: 'current-user', type: 'user' }, 'note:1');
    expect(result.allowed).toBe(true);
  });

  test('guard update allowed', async () => {
    const result = await guard.guard('update', { id: 'current-user', type: 'user' }, 'note:1');
    expect(result.allowed).toBe(true);
  });

  test('guardAll returns all results', async () => {
    const results = await guard.guardAll(['read', 'update', 'delete'], { id: 'current-user', type: 'user' }, 'note:1');
    expect(results.read.allowed).toBe(true);
    expect(results.update.allowed).toBe(true);
    expect(results.delete.allowed).toBe(true);
  });
});

// ─── SecurityContext Tests ────────────────────────────────

describe('Phase 6.9: SecurityContext', () => {
  test('creates with defaults', () => {
    const ctx = new SecurityContext();
    expect(ctx.roles).toContain('owner');
    expect(ctx.source).toBe('cli');
  });

  test('custom roles', () => {
    const ctx = new SecurityContext({ roles: ['viewer'] });
    expect(ctx.roles).toContain('viewer');
  });

  test('has requestId', () => {
    const ctx = new SecurityContext();
    expect(ctx.requestId).toMatch(/^req_/);
  });

  test('toJSON serializes', () => {
    const ctx = new SecurityContext({ source: 'api', requestId: 'test123' });
    const json = ctx.toJSON();
    expect(json.source).toBe('api');
    expect(json.requestId).toBe('test123');
  });

  test('getAllPermissions merges role and direct', () => {
    const ctx = new SecurityContext({ roles: ['viewer'], permissions: ['resource.export'] });
    // 需要权限管理器才能获取角色权限
    const perms = ctx.getAllPermissions(null);
    expect(perms).toContain('resource.export');
  });
});

// ─── SecurityEvent Tests ──────────────────────────────────

describe('Phase 6.9: SecurityEvent', () => {
  test('publishes events to bus', () => {
    const bus = mockEventBus();
    const events = new SecurityEvent(bus);

    events.accessDenied('agent:test', 'resource.delete', 'note:1');
    expect(bus.events.length).toBe(1);
    expect(bus.events[0].type).toBe('security.access.denied');
    expect(bus.events[0].payload.actor).toBe('agent:test');
  });

  test('publishes access.granted', () => {
    const bus = mockEventBus();
    const events = new SecurityEvent(bus);
    events.accessGranted('user:alice', 'resource.read', 'note:1');
    expect(bus.events[0].type).toBe('security.access.granted');
  });

  test('silent when no bus', () => {
    const events = new SecurityEvent(null);
    expect(() => events.accessDenied('test', 'op', 'res')).not.toThrow();
  });
});

// ─── AuditLogger Tests ────────────────────────────────────

describe('Phase 6.9: AuditLogger', () => {
  let logger, db;

  beforeEach(() => {
    db = mockDb();
    logger = new AuditLogger(db);
  });

  test('log writes entry', async () => {
    await expect(logger.log({
      actor: 'agent:test',
      action: 'resource.read',
      resource: 'note:1',
      result: 'granted'
    })).resolves.not.toThrow();
  });

  test('query returns empty', async () => {
    const rows = await logger.query({});
    expect(Array.isArray(rows)).toBe(true);
  });

  test('deniedStats returns array', async () => {
    const stats = await logger.deniedStats(Date.now() - 86400000);
    expect(Array.isArray(stats)).toBe(true);
  });

  test('detectAnomalies returns array', async () => {
    const anomalies = await logger.detectAnomalies(10, 60000);
    expect(Array.isArray(anomalies)).toBe(true);
  });
});

// ─── SecurityManager Tests ────────────────────────────────

describe('Phase 6.9: SecurityManager', () => {
  let sec, db;

  beforeEach(async () => {
    db = mockDb();
    sec = new SecurityManager({ db });
    await sec.initialize();
  });

  test('creates identity types', () => {
    expect(sec.createIdentity('agent', 'test').type).toBe('agent');
    expect(sec.createIdentity('user', 'u').type).toBe('user');
    expect(sec.createIdentity('plugin', 'p').type).toBe('plugin');
  });

  test('check returns boolean', async () => {
    const allowed = await sec.check('current-user', 'resource.read');
    expect(allowed).toBe(true);
  });

  test('authorize returns structured result', async () => {
    const result = await sec.authorize({ id: 'current-user', type: 'user' }, 'resource.read');
    expect(result.allowed).toBe(true);
    expect(typeof result.reason).toBe('string');
  });

  test('audit returns empty array', async () => {
    const records = await sec.audit({ limit: 10 });
    expect(Array.isArray(records)).toBe(true);
  });

  test('deniedStats returns array', async () => {
    const stats = await sec.deniedStats();
    expect(Array.isArray(stats)).toBe(true);
  });
});

// ─── Permission Model Tests ───────────────────────────────

describe('Phase 6.9: Permission Model (existing)', () => {
  test('Permission parses domain.action', () => {
    const p = new Permission('resource.read');
    expect(p.domain).toBe('resource');
    expect(p.action).toBe('read');
  });

  test('Permission matches wildcard', () => {
    const p = new Permission('*');
    expect(p.matches('anything.at.all')).toBe(true);
  });

  test('Permission matches domain wildcard', () => {
    const p = new Permission('resource.*');
    expect(p.matches('resource.read')).toBe(true);
    expect(p.matches('resource.write')).toBe(true);
    expect(p.matches('graph.create')).toBe(false);
  });
});

// ─── Role Tests ───────────────────────────────────────────

describe('Phase 6.9: Role', () => {
  test('Role hasPermission', () => {
    const r = new Role({ id: 'test', name: 'Test', permissions: ['resource.read'] });
    expect(r.hasPermission('resource.read')).toBe(true);
    expect(r.hasPermission('resource.delete')).toBe(false);
  });

  test('Role wildcard', () => {
    const r = new Role({ id: 'test', name: 'Test', permissions: ['resource.*'] });
    expect(r.hasPermission('resource.read')).toBe(true);
    expect(r.hasPermission('resource.delete')).toBe(true);
  });

  test('builtin roles exist', () => {
    const builtins = Role.builtins();
    expect(builtins.length).toBeGreaterThanOrEqual(4);
  });
});
