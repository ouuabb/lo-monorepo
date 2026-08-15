const fs = require('fs-extra');
const path = require('path');
const Database = require('../../src/repo/database.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

const MIGRATIONS_DIR = path.join(__dirname, '../../src/repo/migrations');

describe('MigrationRunner', () => {
  let tempDir, db;

  beforeEach(async () => {
    // Database 层测试：裸目录即可（迁移由测试手动执行，不需要 Repository 初始化）
    tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-mig-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.open();
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('should create schema_migrations table and run pending migrations', async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    const table = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'");
    expect(table).not.toBeNull();
    const rows = await db.all('SELECT migration_id FROM schema_migrations');
    expect(rows.map(r => r.migration_id)).toEqual(['001_initial_schema', '002_automation']);
    const res = await db.get('SELECT rid FROM resources WHERE rid = ?', ['__system__']);
    expect(res).not.toBeNull();
  });

  test('should be idempotent on second run', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await runMigrations(db, MIGRATIONS_DIR);
    logSpy.mockClear();
    await runMigrations(db, MIGRATIONS_DIR);
    const rows = await db.all('SELECT migration_id FROM schema_migrations');
    expect(rows).toHaveLength(2);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('[MIGRATION] Running 001_initial_schema'));
    logSpy.mockRestore();
  });

  test('should silently succeed when migrations dir does not exist', async () => {
    await runMigrations(db, path.join(tempDir, 'no-migrations'));
    const rows = await db.all('SELECT migration_id FROM schema_migrations');
    expect(rows).toEqual([]);
  });

  test('should throw for a migration missing required exports', async () => {
    const dir = path.join(tempDir, 'migrations');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, '001_bad.cjs'), 'module.exports = { id: "001_bad" };');
    await expect(runMigrations(db, dir)).rejects.toThrow('Invalid migration file');
  });

  test('should throw when migration id prefix does not match filename', async () => {
    const dir = path.join(tempDir, 'migrations');
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, '001_bad.cjs'),
      'module.exports = { id: "999_other", description: "x", up: async () => {} };'
    );
    await expect(runMigrations(db, dir)).rejects.toThrow('Migration id mismatch');
  });

  test('should call process.exit(1) when a migration fails', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    try {
      const callsBefore = exitSpy.mock.calls.length;
      const dir = path.join(tempDir, 'migrations');
      await fs.ensureDir(dir);
      await fs.writeFile(
        path.join(dir, '001_fail.cjs'),
        'module.exports = { id: "001_fail", description: "boom", up: async () => { throw new Error("boom"); } };'
      );
      await runMigrations(db, dir);
      const newCalls = exitSpy.mock.calls.slice(callsBefore);
      expect(newCalls).toContainEqual([1]);
      const committed = await db.all('SELECT migration_id FROM schema_migrations');
      expect(committed).toEqual([]);
    } finally {
      exitSpy.mockRestore();
    }
  });

  test('should execute a new migration after previously executed ones', async () => {
    const dir = path.join(tempDir, 'migrations');
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, '001_first.cjs'),
      'module.exports = { id: "001_first", description: "a", up: async (db) => { await db.run("CREATE TABLE t1 (x INTEGER)"); } };'
    );
    await runMigrations(db, dir);
    await fs.writeFile(
      path.join(dir, '002_second.cjs'),
      'module.exports = { id: "002_second", description: "b", up: async (db) => { await db.run("CREATE TABLE t2 (y INTEGER)"); } };'
    );
    await runMigrations(db, dir);
    const rows = await db.all('SELECT migration_id FROM schema_migrations ORDER BY migration_id');
    expect(rows.map(r => r.migration_id)).toEqual(['001_first', '002_second']);
    const t2 = await db.get("SELECT name FROM sqlite_master WHERE name = 't2'");
    expect(t2).not.toBeNull();
  });
});
