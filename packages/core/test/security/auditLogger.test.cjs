const path = require('path');
const Database = require('../../src/repo/database.cjs');
const AuditLogger = require('../../src/security/auditLogger.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('AuditLogger', () => {
  let tempDir, db, audit;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    audit = new AuditLogger(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('log should insert a row with defaults', async () => {
    await audit.log({ actor: 'alice', action: 'resource.read' });
    const rows = await db.all('SELECT * FROM security_audit');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toMatch(/^audit_/);
    expect(rows[0].actor).toBe('alice');
    expect(rows[0].action).toBe('resource.read');
    expect(rows[0].resource).toBe('');
    expect(rows[0].result).toBe('');
    expect(rows[0].metadata).toBe('{}');
  });

  test('log should persist full entry with metadata', async () => {
    await audit.log({
      actor: 'bob',
      action: 'note.delete',
      resource: 'r1',
      result: 'denied',
      reason: 'no permission',
      metadata: { ip: '1.2.3.4' }
    });
    const rows = await db.all('SELECT * FROM security_audit');
    expect(rows[0].result).toBe('denied');
    expect(JSON.parse(rows[0].metadata)).toEqual({ ip: '1.2.3.4' });
  });

  test('log should not throw when db write fails', async () => {
    const broken = new AuditLogger({ run: jest.fn().mockRejectedValue(new Error('db down')) });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(broken.log({ actor: 'a', action: 'x' })).resolves.toBeUndefined();
    errSpy.mockRestore();
  });

  test('query should filter by actor, action, result and since', async () => {
    await audit.log({ actor: 'alice', action: 'read', result: 'granted' });
    await audit.log({ actor: 'alice', action: 'delete', result: 'denied' });
    await audit.log({ actor: 'bob', action: 'read', result: 'denied' });

    expect(await audit.query({ actor: 'alice' })).toHaveLength(2);
    expect(await audit.query({ action: 'read' })).toHaveLength(2);
    expect(await audit.query({ result: 'denied' })).toHaveLength(2);
    expect(await audit.query({ actor: 'alice', result: 'granted' })).toHaveLength(1);
    expect(await audit.query({ since: Date.now() + 1000 })).toHaveLength(0);
  });

  test('query should respect limit', async () => {
    for (let i = 0; i < 5; i++) await audit.log({ actor: 'a', action: 'x' });
    const rows = await audit.query({ limit: 2 });
    expect(rows).toHaveLength(2);
  });

  test('query should return [] on error', async () => {
    const broken = new AuditLogger({ all: jest.fn().mockRejectedValue(new Error('boom')) });
    expect(await broken.query({})).toEqual([]);
  });

  test('deniedStats should aggregate denials', async () => {
    await audit.log({ actor: 'alice', action: 'read', result: 'denied' });
    await audit.log({ actor: 'alice', action: 'read', result: 'denied' });
    await audit.log({ actor: 'alice', action: 'write', result: 'denied' });
    await audit.log({ actor: 'alice', action: 'read', result: 'granted' });

    const stats = await audit.deniedStats(Date.now() - 100000);
    expect(stats).toEqual(expect.arrayContaining([
      { actor: 'alice', action: 'read', count: 2 }
    ]));
  });

  test('deniedStats should return [] on error', async () => {
    const broken = new AuditLogger({ all: jest.fn().mockRejectedValue(new Error('boom')) });
    expect(await broken.deniedStats()).toEqual([]);
  });

  test('detectAnomalies should find actors over threshold', async () => {
    for (let i = 0; i < 5; i++) await audit.log({ actor: 'attacker', action: 'x', result: 'denied' });
    for (let i = 0; i < 2; i++) await audit.log({ actor: 'normal', action: 'x', result: 'denied' });

    const anomalies = await audit.detectAnomalies(3, 60000);
    const attacker = anomalies.find(a => a.actor === 'attacker');
    expect(attacker).toBeDefined();
    expect(attacker.count).toBe(5);
    expect(anomalies.find(a => a.actor === 'normal')).toBeUndefined();
  });

  test('detectAnomalies should return [] on error', async () => {
    const broken = new AuditLogger({ all: jest.fn().mockRejectedValue(new Error('boom')) });
    expect(await broken.detectAnomalies()).toEqual([]);
  });
});
