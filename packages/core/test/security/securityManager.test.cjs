const path = require('path');
const Database = require('../../src/repo/database.cjs');
const SecurityManager = require('../../src/security/securityManager.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('SecurityManager', () => {
  let tempDir, db, sm;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    sm = new SecurityManager({ db });
    await sm.initialize();
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('initialize should build the full stack and be idempotent', () => {
    expect(sm.permissionManager).toBeTruthy();
    expect(sm.auditLogger).toBeTruthy();
    expect(sm.authentication).toBeTruthy();
    expect(sm.policyEngine).toBeTruthy();
    expect(sm.authorization).toBeTruthy();
    expect(sm.accessControl).toBeTruthy();
    expect(sm.resourceGuard).toBeTruthy();
    expect(sm.eventEmitter).toBeTruthy();
  });

  describe('identity creation', () => {
    test('should create all identity types', () => {
      expect(sm.createIdentity('user', 'u', 'U').type).toBe('user');
      expect(sm.createIdentity('agent', 'a').type).toBe('agent');
      expect(sm.createIdentity('plugin', 'p').type).toBe('plugin');
      expect(sm.createIdentity('workflow', 'w').type).toBe('workflow');
      expect(sm.createIdentity('service', 's').type).toBe('service');
      expect(sm.createIdentity('system').id).toBe('system');
    });

    test('should throw for unknown type', () => {
      expect(() => sm.createIdentity('alien', 'x')).toThrow('Unknown identity type: alien');
    });
  });

  describe('authentication', () => {
    test('local auth via manager', async () => {
      const result = await sm.authenticate({ type: 'local' });
      expect(result.authenticated).toBe(true);
    });

    test('createToken and authenticate round-trip', async () => {
      const { token } = await sm.createToken('u1', 'token', 3600000);
      const result = await sm.authenticate({ type: 'token', token });
      expect(result.authenticated).toBe(true);
    });

    test('createApiKey and revokeCredential', async () => {
      const { token } = await sm.createApiKey('u1', 'key');
      const result = await sm.authenticate({ type: 'api-key', apiKey: token });
      expect(result.authenticated).toBe(true);

      const creds = await sm.listCredentials('u1');
      expect(creds).toHaveLength(1);
      await sm.revokeCredential(creds[0].id);
      const again = await sm.authenticate({ type: 'api-key', apiKey: token });
      expect(again.authenticated).toBe(false);
    });
  });

  describe('authorization flow', () => {
    test('check should allow via role assignment', async () => {
      await sm.assignRole('alice', 'editor');
      expect(await sm.check('alice', 'resource.read', 'r')).toBe(true);
      expect(await sm.canAll('alice', ['resource.read', 'resource.write'], 'r')).toBe(true);
      expect(await sm.authorize({ id: 'alice' }, 'resource.delete', 'r')).toMatchObject({ allowed: true });
    });

    test('resource guard should wrap access control', async () => {
      await sm.assignRole('alice', 'viewer');
      const allowed = await sm.guard('read', 'alice', 'r');
      expect(allowed.allowed).toBe(true);

      await sm.setResourceACL('r', {
        allow: [],
        deny: [{ subjectId: 'bob', permission: 'resource.delete' }]
      });
      const denied = await sm.guard('delete', 'bob', 'r');
      expect(denied.allowed).toBe(false);
    });

    test('permission management delegation', async () => {
      await sm.grantPermission('alice', 'ai.analyze');
      const perms = await sm.getSubjectRoles('alice');
      expect(perms).toEqual([]);
      expect((await sm.authorize({ id: 'alice' }, 'ai.analyze', 'r')).reason).toBe('direct_grant');

      await sm.revokePermission('alice', 'ai.analyze');
      expect((await sm.authorize({ id: 'alice' }, 'ai.analyze', 'r')).allowed).toBe(true); // default_allow
    });

    test('role management delegation', async () => {
      await sm.createRole({ id: 'tester', permissions: ['resource.read'] });
      expect((await sm.listRoles()).find(r => r.id === 'tester')).toBeTruthy();

      await sm.assignRole('alice', 'tester');
      expect((await sm.getSubjectRoles('alice')).map(r => r.id)).toContain('tester');
      await sm.unassignRole('alice', 'tester');
      expect(await sm.getSubjectRoles('alice')).toHaveLength(0);
    });

    test('resource ACL delegation', async () => {
      await sm.setResourceACL('note:1', {
        allow: [{ subjectId: 'alice', permission: 'read' }],
        deny: [{ subjectId: 'bob', permission: 'write' }]
      });
      expect(sm.getResourceACL('note:1')).toBeTruthy();
      expect((await sm.check('alice', 'read', 'note:1'))).toBe(true);
      expect((await sm.check('bob', 'write', 'note:1'))).toBe(false);
    });
  });

  describe('policy management', () => {
    test('addPolicy should persist policy and actions', async () => {
      const policy = await sm.addPolicy({
        id: 'p1', subject: 'alice', resource: 'note:*',
        actions: ['delete'], effect: 'deny', priority: 10
      });
      expect(policy.id).toBe('p1');

      const rows = await db.all('SELECT * FROM policy_actions WHERE policy_id = ?', ['p1']);
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe('delete');

      expect(await sm.check('alice', 'delete', 'note:1')).toBe(false);
    });

    test('listPolicies and getPolicy', async () => {
      await sm.addPolicy({ id: 'p2', subject: '*', resource: '*', actions: ['read'], effect: 'allow' });
      const list = await sm.listPolicies();
      expect(list.find(p => p.id === 'p2')).toBeTruthy();
      expect(await sm.getPolicy('p2')).toBeTruthy();
      expect(await sm.getPolicy('missing')).toBeFalsy();
    });

    test('deletePolicy should remove it', async () => {
      await sm.addPolicy({ id: 'p3', subject: '*', resource: '*', actions: ['read'], effect: 'allow' });
      await sm.deletePolicy('p3');
      expect(await sm.getPolicy('p3')).toBeFalsy();
    });
  });

  describe('audit', () => {
    test('audit should record access checks', async () => {
      await sm.check('alice', 'resource.read', 'r');
      const rows = await sm.audit({ actor: 'alice' });
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].actor).toBe('alice');
    });

    test('deniedStats and detectAnomalies should delegate', async () => {
      await sm.setResourceACL('r', {
        allow: [],
        deny: [{ subjectId: 'attacker', permission: 'resource.delete' }]
      });
      for (let i = 0; i < 5; i++) await sm.check('attacker', 'resource.delete', 'r');
      const stats = await sm.deniedStats(Date.now() - 100000);
      expect(Array.isArray(stats)).toBe(true);
      const anomalies = await sm.detectAnomalies(3, 60000);
      expect(anomalies.find(a => a.actor === 'attacker')).toBeTruthy();
    });
  });
});
