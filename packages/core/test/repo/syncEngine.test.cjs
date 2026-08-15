const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Database = require('../../src/repo/database.cjs');
const SyncEngine = require('../../src/repo/syncEngine.cjs');
const { v4: uuidv4 } = require('uuid');

describe('SyncEngine', () => {
  let testDir, db, syncEngine;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `lo-test-syncengine-${  Date.now()  }-${  uuidv4()}`);
    fs.ensureDirSync(path.join(testDir, '.repo'));
    db = new Database(testDir);
    await db.open();
    const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    syncEngine = new SyncEngine(db, testDir);
  });

  afterEach(async () => {
    if (db) await db.close();
    if (testDir && await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  // ─── 1. Constructor ───
  describe('constructor', () => {
    test('should instantiate with db and repoPath', () => {
      const engine = new SyncEngine(db, testDir);
      expect(engine).toBeDefined();
      expect(engine.db).toBe(db);
      expect(engine.repoPath).toBe(testDir);
    });
  });

  // ─── 2. pull - new resources ───
  describe('pull', () => {
    let sourceDir, sourceDb;

    beforeEach(async () => {
      // Create a separate source repo with resources
      sourceDir = path.join(os.tmpdir(), `lo-test-syncengine-source-${  Date.now()  }-${  uuidv4()}`);
      fs.ensureDirSync(path.join(sourceDir, '.repo'));
      sourceDb = new Database(sourceDir);
      await sourceDb.open();
      const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
      await runMigrations(sourceDb, path.join(__dirname, '../../src/repo/migrations'));

      // Insert some test resources into the source DB
      const now = Date.now();
      await sourceDb.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        ['res_source_1',  'source-note-1',  0,  'note', 'local',  '/src/note1.md',  'hash_src_1', 
         '{}',  0,  now - 5000,  now - 5000]
      );
      await sourceDb.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        ['res_source_2',  'source-note-2',  0,  'note', 'local',  '/src/note2.md',  'hash_src_2', 
         '{}',  0,  now - 4000,  now - 4000]
      );
    });

    afterEach(async () => {
      if (sourceDb) await sourceDb.close();
      if (sourceDir && await fs.pathExists(sourceDir)) {
        await fs.remove(sourceDir);
      }
    });

    test('should import resources from source repo', async () => {
      const result = await syncEngine.pull(sourceDir, 'test-ns');

      // Source has 2 test resources + 1 __system__ seed = 3 total
      expect(result.imported.length).toBe(3);
      expect(result.conflicts).toEqual([]);
      expect(result.status.imported).toBe(3);
      expect(result.status.conflicts).toBe(0);
      expect(result.status.namespace).toBe('test-ns');

      // Verify resources are in remote_resources table
      const imported = await db.all('SELECT * FROM remote_resources');
      expect(imported.length).toBe(3);
      expect(imported[0].namespace).toBe('test-ns');
      expect(imported[1].namespace).toBe('test-ns');
      expect(imported[2].namespace).toBe('test-ns');
    });

    test('should record sync in sync_records', async () => {
      await syncEngine.pull(sourceDir, 'test-ns-record');

      const records = await db.all('SELECT * FROM sync_records ORDER BY created DESC LIMIT 1');
      expect(records.length).toBe(1);
      expect(records[0].repository).toBe('test-ns-record');
      expect(records[0].type).toBe('pull');
      expect(records[0].status).toBe('success');
      expect(records[0].changes).toBe(3); // 2 test + 1 __system__
    });
  });

  // ─── 3. pull - update detection (conflict) ───
  describe('pull - conflict detection', () => {
    let sourceDir, sourceDb;

    beforeEach(async () => {
      // Create source repo
      sourceDir = path.join(os.tmpdir(), `lo-test-syncengine-conflict-${  Date.now()  }-${  uuidv4()}`);
      fs.ensureDirSync(path.join(sourceDir, '.repo'));
      sourceDb = new Database(sourceDir);
      await sourceDb.open();
      const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
      await runMigrations(sourceDb, path.join(__dirname, '../../src/repo/migrations'));

      const now = Date.now();
      await sourceDb.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        ['res_conflict_1',  'conflict-note',  0,  'note', 'local',  '/src/conflict.md',  'hash_v2', 
         '{}',  0,  now - 5000,  now - 5000]
      );

      // Pre-populate the target with the same remote resource but different hash
      const GlobalRID = require('../../src/domain/globalResourceId.cjs');
      const globalId = GlobalRID.create('test-ns-conflict', 'res_conflict_1');
      await db.run(
        `INSERT INTO remote_resources (global_id, namespace, metadata, hash, updated)
         VALUES (?, ?, ?, ?, ?)`,
        [globalId, 'test-ns-conflict',
         JSON.stringify({ title: 'conflict-note', type: 'note', source: 'old-source' }),
         'hash_v1', now - 10000]
      );
    });

    afterEach(async () => {
      if (sourceDb) await sourceDb.close();
      if (sourceDir && await fs.pathExists(sourceDir)) {
        await fs.remove(sourceDir);
      }
    });

    test('should detect conflict when same resource has different hash', async () => {
      const result = await syncEngine.pull(sourceDir, 'test-ns-conflict');

      // __system__ is imported as new, res_conflict_1 is a conflict
      expect(result.imported.length).toBe(1); // __system__
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].type).toBe('content_conflict');

      // Verify conflict is stored in conflicts table
      const conflictRows = await db.all("SELECT * FROM conflicts WHERE status = 'pending'");
      expect(conflictRows.length).toBe(1);
    });
  });

  // ─── 4. pull - no change ───
  describe('pull - no change', () => {
    let sourceDir, sourceDb;

    beforeEach(async () => {
      // Create source repo
      sourceDir = path.join(os.tmpdir(), `lo-test-syncengine-nochange-${  Date.now()  }-${  uuidv4()}`);
      fs.ensureDirSync(path.join(sourceDir, '.repo'));
      sourceDb = new Database(sourceDir);
      await sourceDb.open();
      const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
      await runMigrations(sourceDb, path.join(__dirname, '../../src/repo/migrations'));

      const now = Date.now();
      await sourceDb.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        ['res_unchanged',  'unchanged-note',  0,  'note', 'local',  '/src/unchanged.md',  'same_hash', 
         '{}',  0,  now - 5000,  now - 5000]
      );

      // Pre-populate the target with the same remote resource with same hash
      const GlobalRID = require('../../src/domain/globalResourceId.cjs');
      const globalId = GlobalRID.create('test-ns-nochange', 'res_unchanged');
      await db.run(
        `INSERT INTO remote_resources (global_id, namespace, metadata, hash, updated)
         VALUES (?, ?, ?, ?, ?)`,
        [globalId, 'test-ns-nochange',
         JSON.stringify({ title: 'unchanged-note', type: 'note', source: sourceDir }),
         'same_hash', now - 10000]
      );
    });

    afterEach(async () => {
      if (sourceDb) await sourceDb.close();
      if (sourceDir && await fs.pathExists(sourceDir)) {
        await fs.remove(sourceDir);
      }
    });

    test('should not create conflict when same resource has same hash', async () => {
      const result = await syncEngine.pull(sourceDir, 'test-ns-nochange');

      // __system__ is new, res_unchanged has same hash (no conflict)
      expect(result.imported.length).toBe(1); // __system__
      expect(result.conflicts.length).toBe(0);

      // Verify the hash was updated with new timestamp
      const GlobalRID = require('../../src/domain/globalResourceId.cjs');
      const globalId = GlobalRID.create('test-ns-nochange', 'res_unchanged');
      const row = await db.get('SELECT * FROM remote_resources WHERE global_id = ?', [globalId]);
      expect(row.hash).toBe('same_hash');
      const now = Date.now();
      expect(row.updated).toBeGreaterThan(now - 10000);
    });
  });
});
