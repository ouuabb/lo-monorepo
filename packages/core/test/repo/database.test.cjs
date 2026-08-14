const path = require('path');
const Database = require('../../src/repo/database.cjs');
const testUtils = global.testUtils;

describe('Database', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
  });

  afterEach(async () => {
    await testUtils.cleanupTempDir(tempDir);
  });

  describe('constructor', () => {
    test('should set repoPath and dbPath', () => {
      const db = new Database(tempDir);
      expect(db.repoPath).toBe(tempDir);
      expect(db.dbPath).toBe(path.join(tempDir, '.repo', 'database.sqlite'));
      expect(db.db).toBeNull();
    });
  });

  describe('open', () => {
    test('should throw when .repo directory is missing', async () => {
      const missing = path.join(tempDir, 'not-a-repo');
      const db = new Database(missing);
      await expect(db.open()).rejects.toThrow('不是 lo 仓库');
    });

    test('should open and resolve with instance', async () => {
      const db = new Database(tempDir);
      const result = await db.open();
      expect(result).toBe(db);
      expect(db.db).not.toBeNull();
      await db.close();
    });
  });

  describe('init', () => {
    test('should open and run migrations', async () => {
      const db = new Database(tempDir);
      await db.init();
      const row = await db.get('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', ['table', 'resources']);
      expect(row).not.toBeNull();
      const migrations = await db.all('SELECT * FROM schema_migrations');
      expect(migrations.length).toBeGreaterThan(0);
      await db.close();
    });
  });

  describe('run', () => {
    test('should insert and return lastID and changes', async () => {
      const db = new Database(tempDir);
      await db.init();
      const result = await db.run(
        'INSERT INTO resources (rid, name, layer, type, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['res_1', 'note-1', 0, 'note', '/a.md', 1, 1]
      );
      expect(result.lastID).toBeGreaterThan(0);
      expect(result.changes).toBe(1);
      await db.close();
    });

    test('should reject on invalid SQL', async () => {
      const db = new Database(tempDir);
      await db.init();
      await expect(db.run('INSERT INTO missing_table (x) VALUES (1)')).rejects.toThrow();
      await db.close();
    });
  });

  describe('exec', () => {
    test('should execute multiple statements', async () => {
      const db = new Database(tempDir);
      await db.init();
      await db.exec('CREATE TABLE tmp_test (a INTEGER); CREATE TABLE tmp_test2 (b INTEGER);');
      const row = await db.get('SELECT name FROM sqlite_master WHERE name = ?', ['tmp_test2']);
      expect(row).not.toBeNull();
      await db.close();
    });

    test('should reject on invalid SQL', async () => {
      const db = new Database(tempDir);
      await db.init();
      await expect(db.exec('THIS IS NOT SQL')).rejects.toThrow();
      await db.close();
    });
  });

  describe('get and all', () => {
    test('get should return a single row or undefined', async () => {
      const db = new Database(tempDir);
      await db.init();
      const row = await db.get('SELECT rid FROM resources WHERE rid = ?', ['__system__']);
      expect(row.rid).toBe('__system__');
      expect(await db.get('SELECT rid FROM resources WHERE rid = ?', ['nope'])).toBeUndefined();
      await db.close();
    });

    test('all should return all matching rows', async () => {
      const db = new Database(tempDir);
      await db.init();
      await db.run('INSERT INTO resources (rid, name, layer, type, path, created, updated) VALUES (?, ?, 0, ?, ?, 1, 1)', ['res_a', 'a', 'note', '/a.md']);
      await db.run('INSERT INTO resources (rid, name, layer, type, path, created, updated) VALUES (?, ?, 0, ?, ?, 1, 1)', ['res_b', 'b', 'note', '/b.md']);
      const rows = await db.all('SELECT rid FROM resources WHERE type = ? ORDER BY rid', ['note']);
      expect(rows.map(r => r.rid)).toEqual(['res_a', 'res_b']);
      await db.close();
    });

    test('get and all should reject on invalid SQL', async () => {
      const db = new Database(tempDir);
      await db.init();
      await expect(db.get('SELECT * FROM nope')).rejects.toThrow();
      await expect(db.all('SELECT * FROM nope')).rejects.toThrow();
      await db.close();
    });
  });

  describe('close', () => {
    test('should resolve when db is open', async () => {
      const db = new Database(tempDir);
      await db.open();
      await expect(db.close()).resolves.toBeUndefined();
    });

    test('should resolve when db was never opened', async () => {
      const db = new Database(tempDir);
      await expect(db.close()).resolves.toBeUndefined();
    });
  });
});
