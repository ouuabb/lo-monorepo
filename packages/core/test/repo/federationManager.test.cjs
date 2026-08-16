const path = require('path');
const fs = require('fs-extra');
const Database = require('../../src/repo/database.cjs');
const FederationManager = require('../../src/repo/federationManager.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('FederationManager', () => {
  let tempDir, db, manager, remoteRepoPath;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    manager = new FederationManager(db, tempDir);
    remoteRepoPath = path.join(tempDir, 'remote-repo');
    fs.ensureDirSync(path.join(remoteRepoPath, '.repo'));
    fs.writeFileSync(path.join(remoteRepoPath, '.repo', 'database.sqlite'), '');
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function seedLocalResource(overrides) {
    const now = Date.now();
    const data = {rid: `res_${  Math.random().toString(36).slice(2)}`,
      name: 'note.md',
      layer: 0,
      type: 'note',
      path: '',
      hash: null,
      created: now,
      updated: now, ...overrides};
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, created, updated, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [data.rid,                                       data.name,                                       data.layer,                                       data.type, 'local',                                       data.path,                                       data.hash,                                       data.created,                                       data.updated]
    );
    return data;
  }

  test('constructor should store db and repoPath', () => {
    expect(manager.db).toBe(db);
    expect(manager.repoPath).toBe(tempDir);
  });

  test('register should insert a repository and return metadata', async () => {
    const result = await manager.register({ name: 'Repo A', namespace: 'ns-a', repoPath: remoteRepoPath });
    expect(result.name).toBe('Repo A');
    expect(result.namespace).toBe('ns-a');
    expect(result.path).toBe(remoteRepoPath);
    expect(result.id).toMatch(/^repo_/);

    const row = await db.get('SELECT * FROM repositories WHERE namespace = ?', ['ns-a']);
    expect(row).toBeTruthy();
    expect(row.name).toBe('Repo A');
    expect(row.path).toBe(remoteRepoPath);
  });

  test('register should throw when required fields are missing', async () => {
    await expect(manager.register({ name: 'x', namespace: 'y' }))
      .rejects.toThrow('register: name, namespace, and path are required');
    await expect(manager.register({ name: 'x', repoPath: remoteRepoPath }))
      .rejects.toThrow('register: name, namespace, and path are required');
    await expect(manager.register({ namespace: 'y', repoPath: remoteRepoPath }))
      .rejects.toThrow('register: name, namespace, and path are required');
  });

  test('register should throw for an invalid repo path', async () => {
    await expect(manager.register({ name: 'x', namespace: 'y', repoPath: path.join(tempDir, 'nope') }))
      .rejects.toThrow('Not a valid lo repository');
  });

  test('register should throw when namespace or path already registered', async () => {
    await manager.register({ name: 'Repo A', namespace: 'ns-a', repoPath: remoteRepoPath });
    const other = path.join(tempDir, 'other-repo');
    fs.ensureDirSync(path.join(other, '.repo'));
    fs.writeFileSync(path.join(other, '.repo', 'database.sqlite'), '');
    await expect(manager.register({ name: 'Repo B', namespace: 'ns-a', repoPath: other }))
      .rejects.toThrow('Repository already registered');
    await expect(manager.register({ name: 'Repo C', namespace: 'ns-c', repoPath: remoteRepoPath }))
      .rejects.toThrow('Repository already registered');
  });

  test('remove should delete the repository and cascade remote data', async () => {
    const result = await manager.register({ name: 'Repo A', namespace: 'ns-a', repoPath: remoteRepoPath });
    await db.run(
      'INSERT INTO remote_resources (global_id, namespace, metadata) VALUES (?, ?, ?)',
      ['g1', 'ns-a', '{}']
    );
    await db.run(
      'INSERT INTO sync_records (repository, type, status) VALUES (?, ?, ?)',
      [result.id, 'pull', 'success']
    );

    const removed = await manager.remove('ns-a');
    expect(removed).toEqual({ removed: 'ns-a' });
    expect(await db.get('SELECT * FROM repositories WHERE namespace = ?', ['ns-a'])).toBeUndefined();
    expect(await db.all('SELECT * FROM remote_resources WHERE namespace = ?', ['ns-a'])).toHaveLength(0);
    expect(await db.all('SELECT * FROM sync_records WHERE repository = ?', [result.id])).toHaveLength(0);
  });

  test('remove by name should also work', async () => {
    await manager.register({ name: 'Repo A', namespace: 'ns-a', repoPath: remoteRepoPath });
    const removed = await manager.remove('Repo A');
    expect(removed).toEqual({ removed: 'ns-a' });
  });

  test('remove should throw when repository is not found', async () => {
    await expect(manager.remove('missing')).rejects.toThrow('Repository not found: missing');
  });

  test('list should return an empty array initially', async () => {
    expect(await manager.list()).toEqual([]);
  });

  test('list should return registered repositories ordered by created', async () => {
    await manager.register({ name: 'Repo A', namespace: 'ns-a', repoPath: remoteRepoPath });
    const other = path.join(tempDir, 'other-repo');
    fs.ensureDirSync(path.join(other, '.repo'));
    fs.writeFileSync(path.join(other, '.repo', 'database.sqlite'), '');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await manager.register({ name: 'Repo B', namespace: 'ns-b', repoPath: other });

    const list = await manager.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ name: 'Repo A', namespace: 'ns-a', path: remoteRepoPath });
    expect(list[1]).toMatchObject({ name: 'Repo B', namespace: 'ns-b', path: other });
    expect(list[0].created).toBeDefined();
  });

  test('resolveResource should find a local resource by rid', async () => {
    await seedLocalResource({ rid: 'loc1', name: 'Local Note', type: 'note' });
    const results = await manager.resolveResource('loc1');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      globalId: 'loc1',
      source: 'local',
      namespace: 'local',
      rid: 'loc1',
      name: 'Local Note',
      type: 'note'
    });
  });

  test('resolveResource should find a local resource by name（名称查询统一 normalize）', async () => {
    await seedLocalResource({ rid: 'loc2', name: 'find-me' });
    const results = await manager.resolveResource('Find Me');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: 'local', rid: 'loc2' });
  });

  test('resolveResource should find remote resources by global_id and parse metadata', async () => {
    await db.run(
      'INSERT INTO remote_resources (global_id, namespace, metadata, hash, updated) VALUES (?, ?, ?, ?, ?)',
      ['ns-a:r1', 'ns-a', JSON.stringify({ type: 'doc', name: 'Remote Doc' }), 'h1', 123]
    );
    const results = await manager.resolveResource('ns-a:r1');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      globalId: 'ns-a:r1',
      source: 'remote',
      namespace: 'ns-a',
      type: 'doc',
      name: 'Remote Doc'
    });
  });

  test('resolveResource should find remote resources by namespace', async () => {
    await db.run(
      'INSERT INTO remote_resources (global_id, namespace, metadata) VALUES (?, ?, ?)',
      ['ns-b:r2', 'ns-b', '{}']
    );
    const results = await manager.resolveResource('ns-b');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ namespace: 'ns-b', type: 'note', name: 'ns-b:r2' });
  });

  test('resolveResource should tolerate invalid remote metadata', async () => {
    await db.run(
      'INSERT INTO remote_resources (global_id, namespace, metadata) VALUES (?, ?, ?)',
      ['ns-c:r3', 'ns-c', 'not json']
    );
    const results = await manager.resolveResource('ns-c:r3');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ namespace: 'ns-c', type: 'note' });
  });

  test('resolveResource should return empty when nothing matches', async () => {
    expect(await manager.resolveResource('nothing')).toEqual([]);
  });

  test('getNamespace should return the namespace for an existing repo', async () => {
    await manager.register({ name: 'Repo A', namespace: 'ns-a', repoPath: remoteRepoPath });
    const repo = await db.get('SELECT * FROM repositories WHERE namespace = ?', ['ns-a']);
    expect(await manager.getNamespace(repo.id)).toBe('ns-a');
  });

  test('getNamespace should return null for a missing repo', async () => {
    expect(await manager.getNamespace('missing')).toBeNull();
  });

  test('getDBPath should join the repo path', () => {
    expect(manager.getDBPath('/foo/bar')).toBe(path.join('/foo/bar', '.repo', 'database.sqlite'));
  });

  test('getByNamespace should return repo info for an existing namespace', async () => {
    await manager.register({ name: 'Repo A', namespace: 'ns-a', repoPath: remoteRepoPath });
    const info = await manager.getByNamespace('ns-a');
    expect(info).toMatchObject({ name: 'Repo A', namespace: 'ns-a', path: remoteRepoPath });
    expect(info.id).toBeDefined();
  });

  test('getByNamespace should return null for a missing namespace', async () => {
    expect(await manager.getByNamespace('nope')).toBeNull();
  });
});
