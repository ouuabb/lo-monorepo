const path = require('path');
const Database = require('../../src/repo/database.cjs');
const PolicyEngine = require('../../src/security/policyEngine.cjs');
const PermissionManager = require('../../src/security/permissionManager.cjs');
const PermissionAudit = require('../../src/security/permissionAudit.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('PolicyEngine', () => {
  let tempDir, db, pm, audit, engine;

  async function setup() {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    pm = new PermissionManager(db);
    await pm.initialize();
    audit = new PermissionAudit(db);
    engine = new PolicyEngine({ permissionManager: pm, audit, db });
  }

  beforeEach(setup);
  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('should default allow when no permissionManager', async () => {
    const bare = new PolicyEngine({});
    const result = await bare.check('alice', 'anything.at.all', 'r');
    expect(result).toEqual({ allowed: true, reason: 'default_allow' });
  });

  test('should allow via role permission', async () => {
    await pm.assignRole('alice', 'editor');
    const result = await engine.check('alice', 'resource.read', 'r');
    expect(result).toEqual({ allowed: true, reason: 'role:editor' });
  });

  test('should allow via direct permission', async () => {
    await pm.grantPermission('alice', 'ai.analyze');
    const result = await engine.check('alice', 'ai.analyze', 'r');
    expect(result).toEqual({ allowed: true, reason: 'direct_grant' });
  });

  test('should deny via resource ACL', async () => {
    await pm.setResourceACL('note:1', {
      allow: [{ subjectId: 'alice', permission: 'read' }],
      deny: [{ subjectId: 'bob', permission: 'write' }]
    });
    expect(await engine.check('alice', 'read', 'note:1')).toEqual({ allowed: true, reason: 'allowed_by_acl' });
    expect(await engine.check('bob', 'write', 'note:1')).toEqual({ allowed: false, reason: 'denied_by_acl' });
  });

  test('should default allow when no rule matches but manager present', async () => {
    const result = await engine.check('stranger', 'resource.write', 'r');
    expect(result).toEqual({ allowed: true, reason: 'default_allow' });
  });

  test('should deny via declarative policy', async () => {
    await db.run(
      'INSERT INTO policies (id, subject, resource, effect, priority) VALUES (?, ?, ?, ?, ?)',
      ['pol-deny', 'alice', 'note:*', 'deny', 10]
    );
    await db.run(
      'INSERT INTO policy_actions (policy_id, action) VALUES (?, ?)',
      ['pol-deny', 'delete']
    );
    engine.invalidatePolicyCache();

    const result = await engine.check('alice', 'delete', 'note:1');
    expect(result).toEqual({ allowed: false, reason: 'policy:pol-deny' });
  });

  test('should allow via declarative policy and deny overrides allow', async () => {
    await db.run(
      'INSERT INTO policies (id, subject, resource, effect, priority) VALUES (?, ?, ?, ?, ?)',
      ['pol-allow', 'alice', '*', 'allow', 5]
    );
    await db.run('INSERT INTO policy_actions (policy_id, action) VALUES (?, ?)', ['pol-allow', 'read']);
    await db.run(
      'INSERT INTO policies (id, subject, resource, effect, priority) VALUES (?, ?, ?, ?, ?)',
      ['pol-deny2', 'alice', '*', 'deny', 20]
    );
    await db.run('INSERT INTO policy_actions (policy_id, action) VALUES (?, ?)', ['pol-deny2', 'read']);
    engine.invalidatePolicyCache();

    expect((await engine.check('alice', 'read', 'note:1')).reason).toBe('policy:pol-deny2');
    expect((await engine.check('alice', 'read', 'note:1')).allowed).toBe(false);
  });

  test('declarative policy should honor conditions', async () => {
    await db.run(
      'INSERT INTO policies (id, subject, resource, effect, priority, condition_JSON) VALUES (?, ?, ?, ?, ?, ?)',
      ['pol-cond', '*', '*', 'deny', 10, JSON.stringify({ field: 'subject.id', op: 'eq', value: 'alice' })]
    );
    await db.run('INSERT INTO policy_actions (policy_id, action) VALUES (?, ?)', ['pol-cond', 'export']);
    engine.invalidatePolicyCache();

    expect((await engine.check('alice', 'export', 'big-note')).allowed).toBe(false);
    expect((await engine.check('bob', 'export', 'big-note')).allowed).toBe(true);
  });

  test('loadPolicies should cache and invalidatePolicyCache should reset', async () => {
    const spy = jest.spyOn(db, 'all');
    await engine.loadPolicies();
    const callsAfterFirst = spy.mock.calls.length;
    await engine.loadPolicies();
    expect(spy.mock.calls.length).toBe(callsAfterFirst);

    engine.invalidatePolicyCache();
    await engine.loadPolicies();
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    spy.mockRestore();
  });

  test('loadPolicies should return [] without db', async () => {
    const bare = new PolicyEngine({});
    expect(await bare.loadPolicies()).toEqual([]);
  });

  test('can should return boolean and batchCheck should map results', async () => {
    await pm.assignRole('alice', 'viewer');
    expect(await engine.can('alice', 'resource.read', 'r')).toBe(true);
    const batch = await engine.batchCheck('alice', ['resource.read', 'resource.delete'], 'r');
    expect(Object.keys(batch)).toEqual(['resource.read', 'resource.delete']);
    expect(batch['resource.read'].allowed).toBe(true);
  });

  test('should audit every check', async () => {
    await pm.assignRole('alice', 'viewer');
    await engine.check('alice', 'resource.read', 'r');
    await engine.check('alice', 'resource.delete', 'r');
    const rows = await db.all('SELECT * FROM permission_audit');
    expect(rows).toHaveLength(2);
    expect(rows[0].reason).toBe('role:viewer');
  });
});
