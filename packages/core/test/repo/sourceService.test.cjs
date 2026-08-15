const path = require('path');
const fs = require('fs-extra');
const Database = require('../../src/repo/database.cjs');
const SourceService = require('../../src/repo/sourceService.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('SourceService', () => {
  let tempDir, db, service;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    service = new SourceService(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function seedResource(rid) {
    const now = Date.now();
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, created, updated, deleted)
       VALUES (?, ?, 0, 'note', ?, ?, NULL, ?, ?, ?)`,
      [rid, rid, 'local', `/virtual/${rid}`, now, now]
    );
  }

  async function seedContainer(rid) {
    await seedResource(rid);
  }

  test('SOURCE_TYPES should expose supported source types', () => {
    expect(SourceService.SOURCE_TYPES).toEqual({
      LOCAL_FOLDER: 'local_folder',
      GIT_REPOSITORY: 'git_repository',
      ZIP_ARCHIVE: 'zip_archive',
      REMOTE_STORAGE: 'remote_storage',
      DATABASE: 'database'
    });
  });

  test('addSource should insert a new source row', async () => {
    await seedResource('r1');
    const result = await service.addSource('r1', 'local_folder', '/a/b', { note: 1 });

    expect(result.added).toBe(true);
    expect(result.id).toBeGreaterThan(0);
    expect(result).toMatchObject({
      resource_rid: 'r1',
      source_type: 'local_folder',
      location: '/a/b',
      metadata: { note: 1 }
    });

    const rows = await db.all('SELECT * FROM resource_sources WHERE resource_rid = ?', ['r1']);
    expect(rows).toHaveLength(1);
    expect(rows[0].source_type).toBe('local_folder');
    expect(rows[0].location).toBe('/a/b');
    expect(rows[0].enabled).toBe(1);
    expect(rows[0].sync_mode).toBe('manual');
    expect(JSON.parse(rows[0].metadata)).toEqual({ note: 1 });
    expect(rows[0].created_at).toBeTruthy();
    expect(rows[0].updated_at).toBeTruthy();
  });

  test('addSource should default metadata to empty object', async () => {
    await seedResource('r1');
    const result = await service.addSource('r1', 'database', 'db://x');
    expect(result.metadata).toEqual({});
    const rows = await db.all('SELECT metadata FROM resource_sources');
    expect(JSON.parse(rows[0].metadata)).toEqual({});
  });

  test('addSource should update existing record for same resource and location', async () => {
    await seedResource('r1');
    const first = await service.addSource('r1', 'local_folder', '/shared', { v: 1 });
    const second = await service.addSource('r1', 'git_repository', '/shared', { v: 2 });

    expect(second.updated).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.source_type).toBe('git_repository');

    const rows = await db.all('SELECT * FROM resource_sources');
    expect(rows).toHaveLength(1);
    expect(rows[0].source_type).toBe('git_repository');
    expect(JSON.parse(rows[0].metadata)).toEqual({ v: 2 });
  });

  test('addLocalFolderSource should throw when directory is missing', async () => {
    await seedResource('r1');
    await expect(
      service.addLocalFolderSource('r1', path.join(tempDir, 'missing-dir'))
    ).rejects.toThrow(`目录不存在`);
  });

  test('addLocalFolderSource should throw when path is not a directory', async () => {
    const filePath = await testUtils.createTestFile(tempDir, 'plain.txt', 'x');
    await seedResource('r1');
    await expect(
      service.addLocalFolderSource('r1', filePath)
    ).rejects.toThrow(`路径不是目录`);
  });

  test('addLocalFolderSource should bind a resolved local folder', async () => {
    const dirPath = path.join(tempDir, 'content');
    await fs.ensureDir(dirPath);
    await seedResource('r1');

    const result = await service.addLocalFolderSource('r1', dirPath, { watch: true });
    expect(result.added).toBe(true);
    expect(result.source_type).toBe('local_folder');
    expect(result.location).toBe(path.resolve(dirPath));
    expect(result.metadata).toEqual({ watch: true });
  });

  test('removeSource should remove by numeric id', async () => {
    await seedResource('r1');
    const added = await service.addSource('r1', 'local_folder', '/x');
    const result = await service.removeSource('r1', added.id);

    expect(result.removed).toBe(true);
    const rows = await db.all('SELECT * FROM resource_sources');
    expect(rows).toHaveLength(0);
  });

  test('removeSource should remove by location string', async () => {
    await seedResource('r1');
    await service.addSource('r1', 'local_folder', '/y');
    const result = await service.removeSource('r1', '/y');

    expect(result.removed).toBe(true);
    const rows = await db.all('SELECT * FROM resource_sources');
    expect(rows).toHaveLength(0);
  });

  test('removeSource should report removed false for unknown id', async () => {
    await seedResource('r1');
    const result = await service.removeSource('r1', 9999);
    expect(result.removed).toBe(false);
  });

  test('removeSource should report removed false for unknown location', async () => {
    await seedResource('r1');
    const result = await service.removeSource('r1', '/not-there');
    expect(result.removed).toBe(false);
  });

  test('removeSource should mark container members as source deleted', async () => {
    await seedResource('r1');
    await seedContainer('container');
    const added = await service.addSource('r1', 'local_folder', '/z');
    await db.run(
      `INSERT INTO container_members (container_rid, source_id, resource_rid, path, name)
       VALUES (?, ?, ?, ?, ?)`,
      ['container', added.id, 'r1', '/z/file.txt', 'file.txt']
    );

    const result = await service.removeSource('r1', added.id);
    expect(result.removed).toBe(true);

    const members = await db.all('SELECT * FROM container_members');
    expect(members).toHaveLength(1);
    expect(members[0].source_deleted_at).not.toBeNull();
    expect(members[0].source_id).toBeNull();
  });

  test('getSources should return hydrated sources with parsed metadata', async () => {
    await seedResource('r1');
    await service.addSource('r1', 'local_folder', '/m', { depth: 2 });

    const sources = await service.getSources('r1');
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      resource_rid: 'r1',
      source_type: 'local_folder',
      location: '/m'
    });
    expect(sources[0].metadata).toEqual({ depth: 2 });
    expect(sources[0]).toHaveProperty('id');
  });

  test('getByType should filter by source type', async () => {
    await seedResource('r1');
    await seedResource('r2');
    await service.addSource('r1', 'local_folder', '/a');
    await service.addSource('r2', 'git_repository', '/b');

    const folders = await service.getByType('local_folder');
    expect(folders).toHaveLength(1);
    expect(folders[0].resource_rid).toBe('r1');

    const git = await service.getByType('git_repository');
    expect(git).toHaveLength(1);
    expect(git[0].resource_rid).toBe('r2');
  });

  test('getByLocation should find all resources bound to a location', async () => {
    await seedResource('r1');
    await seedResource('r2');
    await service.addSource('r1', 'local_folder', '/shared');
    await service.addSource('r2', 'local_folder', '/shared');

    const sources = await service.getByLocation('/shared');
    expect(sources).toHaveLength(2);
  });

  test('getLocalFolderSources should filter by resource and folder type', async () => {
    await seedResource('r1');
    await service.addSource('r1', 'local_folder', '/f1');
    await service.addSource('r1', 'zip_archive', '/z1');

    const folders = await service.getLocalFolderSources('r1');
    expect(folders).toHaveLength(1);
    expect(folders[0].location).toBe('/f1');
  });

  test('getSources should tolerate null metadata', async () => {
    await seedResource('r1');
    await db.run(
      `INSERT INTO resource_sources (resource_rid, source_type, location, metadata, created_at, updated_at)
       VALUES (?, 'database', '/null-meta', NULL, ?, ?)`,
      ['r1', Date.now(), Date.now()]
    );

    const sources = await service.getSources('r1');
    expect(sources[0].metadata).toEqual({});
  });

  test('setEnabled should toggle enabled flag', async () => {
    await seedResource('r1');
    const added = await service.addSource('r1', 'local_folder', '/e');

    const disabled = await service.setEnabled(added.id, false);
    expect(disabled).toEqual({ id: added.id, enabled: false });
    const off = await db.get('SELECT enabled FROM resource_sources WHERE id = ?', [added.id]);
    expect(off.enabled).toBe(0);

    const enabled = await service.setEnabled(added.id, true);
    expect(enabled).toEqual({ id: added.id, enabled: true });
    const on = await db.get('SELECT enabled FROM resource_sources WHERE id = ?', [added.id]);
    expect(on.enabled).toBe(1);
  });

  test('setSyncMode should update sync mode', async () => {
    await seedResource('r1');
    const added = await service.addSource('r1', 'local_folder', '/s');
    await service.setSyncMode(added.id, 'auto');
    const row = await db.get('SELECT sync_mode FROM resource_sources WHERE id = ?', [added.id]);
    expect(row.sync_mode).toBe('auto');
  });

  test('getEnabledSources should return only enabled sources', async () => {
    await seedResource('r1');
    await seedResource('r2');
    const on = await service.addSource('r1', 'local_folder', '/on');
    const off = await service.addSource('r2', 'local_folder', '/off');
    await service.setEnabled(off.id, false);

    const sources = await service.getEnabledSources();
    expect(sources.map(s => s.id)).toEqual([on.id]);
    expect(sources[0].metadata).toEqual({});
  });
});
