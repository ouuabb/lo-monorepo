const path = require('path');
const Database = require('../../src/repo/database.cjs');
const PermissionAudit = require('../../src/security/permissionAudit.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('PermissionAudit', () => {
  let tempDir, db, audit;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    audit = new PermissionAudit(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('record should insert a row', async () => {
    await audit.record('alice', 'resource.read', 'r1', true, 'role:editor');
    const rows = await db.all('SELECT * FROM permission_audit');
    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe('alice');
    expect(rows[0].action).toBe('resource.read');
    expect(rows[0].resource).toBe('r1');
    expect(rows[0].allowed).toBe(1);
    expect(rows[0].reason).toBe('role:editor');
  });

  test('record should default resource and reason', async () => {
    await audit.record('bob', 'x.y', null, false);
    const rows = await db.all('SELECT * FROM permission_audit');
    expect(rows[0].resource).toBe('');
    expect(rows[0].allowed).toBe(0);
  });

  test('query should filter by subject, action, allowed and since', async () => {
    await audit.record('alice', 'read', 'r1', true, 'a');
    await audit.record('alice', 'write', 'r1', false, 'd');
    await audit.record('bob', 'read', 'r1', true, 'a');

    expect(await audit.query({ subject: 'alice' })).toHaveLength(2);
    expect(await audit.query({ action: 'read' })).toHaveLength(2);
    expect(await audit.query({ allowed: false })).toHaveLength(1);
    expect(await audit.query({ subject: 'alice', allowed: true })).toHaveLength(1);
    expect(await audit.query({ since: Date.now() + 1000 })).toHaveLength(0);
  });

  test('query should map allowed to boolean and respect limit/offset', async () => {
    for (let i = 0; i < 4; i++) await audit.record('alice', 'x', 'r', i % 2 === 0, '');
    const first = await audit.query({ limit: 2, offset: 0 });
    const second = await audit.query({ limit: 2, offset: 2 });
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(typeof first[0].allowed).toBe('boolean');
    expect(first[0].createdAt).toBeDefined();
  });

  test('deniedStats should aggregate denials', async () => {
    await audit.record('alice', 'delete', 'r', false, '');
    await audit.record('alice', 'delete', 'r', false, '');
    await audit.record('alice', 'write', 'r', false, '');
    await audit.record('bob', 'delete', 'r', true, '');

    const stats = await audit.deniedStats();
    expect(stats).toEqual(expect.arrayContaining([
      { subject: 'alice', action: 'delete', count: 2 },
      { subject: 'alice', action: 'write', count: 1 }
    ]));
    expect(stats.find(s => s.subject === 'bob')).toBeUndefined();
  });
});
