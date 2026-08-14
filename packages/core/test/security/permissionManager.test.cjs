const path = require('path');
const Database = require('../../src/repo/database.cjs');
const PermissionManager = require('../../src/security/permissionManager.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('PermissionManager', () => {
  let tempDir, db, pm;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    pm = new PermissionManager(db);
    await pm.initialize();
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('should load builtin roles', () => {
    expect(pm.getRole('owner')).toBeTruthy();
    expect(pm.getRole('viewer')).toBeTruthy();
    expect(pm.getRole('nope')).toBeNull();
  });

  test('listRoles should summarize roles', () => {
    const roles = pm.listRoles();
    const viewer = roles.find(r => r.id === 'viewer');
    expect(viewer).toMatchObject({ id: 'viewer', permissionCount: 3 });
  });

  describe('role management', () => {
    test('createRole should persist and load custom role', async () => {
      const role = await pm.createRole({ id: 'custom', name: 'Custom', permissions: ['resource.read'] });
      expect(role.id).toBe('custom');
      expect(pm.getRole('custom').hasPermission('resource.read')).toBe(true);

      const pm2 = new PermissionManager(db);
      await pm2.initialize();
      expect(pm2.getRole('custom')).toBeTruthy();
    });

    test('assignRole should throw for unknown role', async () => {
      await expect(pm.assignRole('alice', 'ghost')).rejects.toThrow("Role 'ghost' not found");
    });

    test('assignRole and getSubjectRoles', async () => {
      await pm.assignRole('alice', 'editor');
      const roles = pm.getSubjectRoles('alice');
      expect(roles.map(r => r.id)).toContain('editor');
    });

    test('unassignRole should remove assignment', async () => {
      await pm.assignRole('alice', 'editor');
      await pm.unassignRole('alice', 'editor');
      expect(pm.getSubjectRoles('alice')).toHaveLength(0);
    });
  });

  describe('direct permissions', () => {
    test('grantPermission should add direct permission', async () => {
      await pm.grantPermission('alice', 'ai.analyze');
      expect(pm.getSubjectPermissions('alice')).toContain('ai.analyze');
    });

    test('revokePermission should remove it', async () => {
      await pm.grantPermission('alice', 'ai.analyze');
      await pm.revokePermission('alice', 'ai.analyze');
      expect(pm.getSubjectPermissions('alice')).not.toContain('ai.analyze');
    });
  });

  describe('resource ACL', () => {
    test('setResourceACL should store allow and deny entries', async () => {
      const policy = {
        allow: [{ subjectId: 'alice', permission: 'read' }],
        deny: [{ subjectId: 'bob', permission: 'write' }]
      };
      await pm.setResourceACL('note:1', policy);
      const rows = await db.all('SELECT * FROM resource_acl WHERE resource_id = ?', ['note:1']);
      expect(rows).toHaveLength(2);
      const denyRow = rows.find(r => r.deny === 1);
      expect(denyRow).toMatchObject({ subject_id: 'bob', permission: 'write' });
    });

    test('getResourceACL should return the policy', async () => {
      const policy = { allow: [{ subjectId: 'alice', permission: 'read' }], deny: [] };
      await pm.setResourceACL('note:1', policy);
      const stored = pm.getResourceACL('note:1');
      expect(stored).toBeInstanceOf(require('../../src/security/resourcePolicy.cjs'));
      expect(stored.allow).toEqual([{ subjectId: 'alice', permission: 'read' }]);
      expect(stored.deny).toEqual([]);
      expect(pm.getResourceACL('missing')).toBeNull();
    });
  });
});
