const path = require('path');
const Database = require('../../src/repo/database.cjs');
const SyncConfigService = require('../../src/repo/syncConfigService.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('SyncConfigService', () => {
  let tempDir, db, service;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    service = new SyncConfigService(db);

    const now = Date.now();
    for (const rid of ['container1', 'container2']) {
      await db.run(
        `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [rid,                                       rid,                                       0,                                       'container', 'local',                                       '',                                       null,                                       now,                                       now]
      );
    }
    for (const [id, rid] of [[1, 'container1'], [2, 'container1'], [3, 'container2']]) {
      await db.run(
        `INSERT INTO resource_sources (id, resource_rid, source_type, location, enabled, sync_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, rid, 'filesystem', '/path', 1, 'manual', now, now]
      );
    }
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('constructor should store the db', () => {
    expect(service.db).toBe(db);
  });

  test('getConfig should return null when no config exists', async () => {
    expect(await service.getConfig('container1', 1)).toBeNull();
  });

  test('getConfig should return the row when a config exists', async () => {
    await service.setConfig('container1', 1, { sync_mode: 'auto', delete_policy: 'hard' });
    const config = await service.getConfig('container1', 1);
    expect(config).toMatchObject({
      container_rid: 'container1',
      source_id: 1,
      sync_mode: 'auto',
      delete_policy: 'hard',
      conflict_policy: 'local'
    });
  });

  test('getConfigsForContainer should return all configs for a container', async () => {
    await service.setConfig('container1', 1, {});
    await service.setConfig('container1', 2, { sync_mode: 'auto' });
    await service.setConfig('container2', 3, {});
    const configs = await service.getConfigsForContainer('container1');
    expect(configs).toHaveLength(2);
    expect(configs.map((c) => c.source_id).sort()).toEqual([1, 2]);
  });

  test('getConfigsForContainer should return an empty array when none exist', async () => {
    expect(await service.getConfigsForContainer('container1')).toEqual([]);
  });

  test('setConfig should insert a new config with defaults', async () => {
    const result = await service.setConfig('container1', 1);
    expect(result.added).toBe(true);
    expect(result.container_rid).toBe('container1');
    expect(result.source_id).toBe(1);
    expect(result.id).toBeTruthy();

    const row = await db.get(
      'SELECT * FROM container_sync_configs WHERE container_rid = ? AND source_id = ?',
      ['container1', 1]
    );
    expect(row.sync_mode).toBe('manual');
    expect(row.delete_policy).toBe('soft');
    expect(row.conflict_policy).toBe('local');
    expect(row.interval_ms).toBeNull();
  });

  test('setConfig should insert a new config with provided values', async () => {
    const result = await service.setConfig('container1', 1, {
      sync_mode: 'auto',
      delete_policy: 'hard',
      conflict_policy: 'remote',
      interval_ms: 5000
    });
    expect(result.added).toBe(true);
    expect(result).toMatchObject({
      container_rid: 'container1',
      source_id: 1,
      sync_mode: 'auto',
      delete_policy: 'hard',
      conflict_policy: 'remote',
      interval_ms: 5000
    });

    const row = await db.get(
      'SELECT * FROM container_sync_configs WHERE container_rid = ? AND source_id = ?',
      ['container1', 1]
    );
    expect(row.sync_mode).toBe('auto');
    expect(row.delete_policy).toBe('hard');
    expect(row.conflict_policy).toBe('remote');
    expect(row.interval_ms).toBe(5000);
  });

  test('setConfig should update an existing config', async () => {
    await service.setConfig('container1', 1, { sync_mode: 'manual', delete_policy: 'soft' });
    const result = await service.setConfig('container1', 1, { sync_mode: 'auto' });
    expect(result.updated).toBe(true);
    expect(result.sync_mode).toBe('auto');
    expect(result.delete_policy).toBe('soft');

    const row = await db.get(
      'SELECT * FROM container_sync_configs WHERE container_rid = ? AND source_id = ?',
      ['container1', 1]
    );
    expect(row.sync_mode).toBe('auto');
    expect(row.delete_policy).toBe('soft');
    expect(row.conflict_policy).toBe('local');
  });

  test('setConfig should keep existing values when updating partially', async () => {
    await service.setConfig('container1', 1, { sync_mode: 'auto', interval_ms: 3000 });
    const result = await service.setConfig('container1', 1, { delete_policy: 'hard' });
    expect(result.sync_mode).toBe('auto');
    expect(result.delete_policy).toBe('hard');
    expect(result.interval_ms).toBe(3000);

    const row = await db.get(
      'SELECT * FROM container_sync_configs WHERE container_rid = ? AND source_id = ?',
      ['container1', 1]
    );
    expect(row.sync_mode).toBe('auto');
    expect(row.interval_ms).toBe(3000);
    expect(row.delete_policy).toBe('hard');
  });

  test('setConfig should allow an interval_ms of 0 on update', async () => {
    await service.setConfig('container1', 1, { sync_mode: 'auto', interval_ms: 3000 });
    const result = await service.setConfig('container1', 1, { interval_ms: 0 });
    expect(result.interval_ms).toBe(0);

    const row = await db.get(
      'SELECT * FROM container_sync_configs WHERE container_rid = ? AND source_id = ?',
      ['container1', 1]
    );
    expect(row.interval_ms).toBe(0);
  });

  test('removeConfig should delete the config', async () => {
    await service.setConfig('container1', 1, {});
    const result = await service.removeConfig('container1', 1);
    expect(result).toEqual({ removed: true });
    expect(await service.getConfig('container1', 1)).toBeNull();
  });

  test('removeConfig should not throw for a missing config', async () => {
    const result = await service.removeConfig('container1', 99);
    expect(result).toEqual({ removed: true });
  });
});
