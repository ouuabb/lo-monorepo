const fs = require('fs-extra');
const path = require('path');
const ResourceService = require('../../src/repo/resourceService.cjs');
const Database = require('../../src/repo/database.cjs');

describe('ResourceService', () => {
  let tempDir;
  let db;
  let resourceService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-resource-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.init();
    resourceService = new ResourceService(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('should create resource', async () => {
    const filePath = path.join(tempDir, 'resources', 'test.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Test');

    const resource = await resourceService.create({
      type: 'note',
      path: filePath,
      name: 'test'
    });

    expect(resource).not.toBeNull();
    expect(resource.type).toBe('note');
    expect(resource.path).toBe(filePath);
    expect(resource.rid).toMatch(/^res_/);
  });

  test('should get resource by RID', async () => {
    const filePath = path.join(tempDir, 'resources', 'test.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Test');

    const created = await resourceService.create({
      type: 'note',
      path: filePath,
      name: 'test'
    });

    const retrieved = await resourceService.getByRid(created.rid);
    expect(retrieved).not.toBeNull();
    expect(retrieved.rid).toBe(created.rid);
  });

  test('should get resource by name', async () => {
    const filePath = path.join(tempDir, 'resources', 'test.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Test');

    await resourceService.create({
      type: 'note',
      path: filePath,
      name: 'unique-name'
    });

    const retrieved = await resourceService.getByName('unique-name');
    expect(retrieved).not.toBeNull();
    expect(retrieved.name).toBe('unique-name');
  });

  test('should get resource by path', async () => {
    const filePath = path.join(tempDir, 'resources', 'test.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Test');

    await resourceService.create({
      type: 'note',
      path: filePath,
      name: 'test'
    });

    const retrieved = await resourceService.getByPath(filePath);
    expect(retrieved).not.toBeNull();
    expect(retrieved.path).toBe(filePath);
  });

  test('should get all resources', async () => {
    const filePath1 = path.join(tempDir, 'resources', 'test1.md');
    const filePath2 = path.join(tempDir, 'resources', 'test2.md');
    await fs.ensureDir(path.dirname(filePath1));
    await fs.writeFile(filePath1, '# Test 1');
    await fs.writeFile(filePath2, '# Test 2');

    await resourceService.create({ type: 'note', path: filePath1, name: 'test1' });
    await resourceService.create({ type: 'note', path: filePath2, name: 'test2' });

    const resources = await resourceService.getAll();
    expect(resources.length).toBeGreaterThanOrEqual(2);
  });

  test('should update resource', async () => {
    const filePath = path.join(tempDir, 'resources', 'test.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Test');

    const created = await resourceService.create({
      type: 'note',
      path: filePath,
      name: 'test',
      metadata: { title: 'Original' }
    });

    const updated = await resourceService.update(created.rid, {
      metadata: { title: 'Updated', tags: ['tag1'] }
    });

    expect(updated.metadata.title).toBe('Updated');
    // tags 已从 metadata JSON 中独立到 resource_tags 表，挂载在顶层 .tags
    expect(updated.tags).toEqual(['tag1']);
  });

  test('should delete resource', async () => {
    const filePath = path.join(tempDir, 'resources', 'test.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Test');

    const created = await resourceService.create({
      type: 'note',
      path: filePath,
      name: 'test'
    });

    await resourceService.delete(created.rid);

    const deleted = await resourceService.getByRid(created.rid);
    expect(deleted).toBeNull();
  });

  test('should import file', async () => {
    const filePath = path.join(tempDir, 'imported.md');
    await fs.writeFile(filePath, '# Imported');

    const resource = await resourceService.importFile(filePath);
    expect(resource).not.toBeNull();
    expect(resource.type).toBe('note');
    expect(resource.path).toBe(filePath);
  });

  test('importFile returns existing resource when path already registered', async () => {
    const filePath = path.join(tempDir, 'resources', 'dup.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Dup');

    const first = await resourceService.importFile(filePath);
    const second = await resourceService.importFile(filePath);
    expect(second.rid).toBe(first.rid);
  });

  test('should create resource with tags, capabilities and container schema', async () => {
    const filePath = path.join(tempDir, 'resources', 'tagged.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Tagged');

    const resource = await resourceService.create({
      type: 'note',
      path: filePath,
      name: 'tagged',
      metadata: { tags: ['alpha', ' beta '], title: 'T' },
      capabilities: ['container'],
      container_schema: { allowed_types: ['note'], ignored_patterns: ['*.tmp'] }
    });

    expect(resource.metadata.tags).toEqual(['alpha', ' beta ']);
    expect(resource.capabilities).toEqual(['container']);

    const loaded = await resourceService.getByRid(resource.rid);
    expect(loaded.tags).toEqual(['alpha', 'beta']);
    expect(loaded.capabilities).toEqual(['container']);
    expect(loaded.container_schema.allowed_types).toEqual(['note']);
    expect(await resourceService._loadIgnorePatterns(resource.rid)).toEqual(['*.tmp']);
  });

  test('create honors preRid and rejects invalid preRid', async () => {
    const filePath = path.join(tempDir, 'resources', 'prerid.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Pre');

    const withRid = await resourceService.create({
      type: 'note', path: filePath, name: 'prerid', rid: 'res_abc123_def456'
    });
    expect(withRid.rid).toBe('res_abc123_def456');

    const badPath = path.join(tempDir, 'resources', 'badrid.md');
    await fs.writeFile(badPath, '# Bad');
    await expect(
      resourceService.create({ type: 'note', path: badPath, name: 'badrid', rid: 'invalid-rid' })
    ).rejects.toThrow(/res_/);
  });

  test('create derives name from type when no path or name given', async () => {
    const resource = await resourceService.create({ type: 'note', path: '' });
    expect(resource.name).toMatch(/^note-\d+$/);
    expect(resource.path).toBe('');
  });

  test('create with schema binds schema and validates values', async () => {
    const SchemaRegistry = require('../../src/repo/schemaRegistry.cjs');
    const schemaRegistry = new SchemaRegistry(db);
    await schemaRegistry.createSchema({
      id: 's1',
      name: 'schema-one',
      fields: [{ name: 'status', type: 'text', required: true }]
    });
    const svc = new ResourceService(db, { getSchemaRegistry: () => schemaRegistry });

    const filePath = path.join(tempDir, 'resources', 'schema1.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Schema');

    const resource = await svc.create({
      type: 'note', path: filePath, name: 'schema1',
      schema: 's1', metadata: { status: 'ok' }
    });
    expect(resource.schema.id).toBe('s1');
    expect(resource.schema.version).toBe(1);

    const loaded = await svc.getByRid(resource.rid);
    expect(loaded.schema.id).toBe('s1');
    expect(loaded.schema.name).toBe('schema-one');

    const missing = path.join(tempDir, 'resources', 'schema-missing.md');
    await fs.writeFile(missing, '# M');
    await expect(
      svc.create({ type: 'note', path: missing, name: 'schema-missing', schema: 'nope', metadata: { status: 'x' } })
    ).rejects.toThrow(/不存在/);

    const invalid = path.join(tempDir, 'resources', 'schema-invalid.md');
    await fs.writeFile(invalid, '# I');
    await expect(
      svc.create({ type: 'note', path: invalid, name: 'schema-invalid', schema: 's1', metadata: {} })
    ).rejects.toThrow(/校验失败/);
  });

  test('create with schema but no registry configured throws', async () => {
    const filePath = path.join(tempDir, 'resources', 'no-reg.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# N');
    await expect(
      resourceService.create({ type: 'note', path: filePath, name: 'no-reg', schema: 's1' })
    ).rejects.toThrow(/SchemaRegistry/);
  });

  test('create runs before/after hooks and can cancel', async () => {
    const filePath = path.join(tempDir, 'resources', 'hook.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Hook');

    const modifying = {
      runBefore: jest.fn(async (name, payload) => {
        if (name === 'beforeResourceCreate') {
          return { cancelled: false, payload: { resource: { ...payload.resource, metadata: { title: 'Hooked' } } } };
        }
        return { cancelled: false, payload };
      }),
      runAfter: jest.fn(async () => {})
    };
    const svc = new ResourceService(db, { getHookManager: () => modifying });
    const resource = await svc.create({ type: 'note', path: filePath, name: 'hook' });
    expect(resource.metadata.title).toBe('Hooked');
    expect(modifying.runAfter).toHaveBeenCalled();

    const cancelled = {
      runBefore: jest.fn(async () => ({ cancelled: true, payload: {} }))
    };
    const svcCancel = new ResourceService(db, { getHookManager: () => cancelled });
    await expect(
      svcCancel.create({ type: 'note', path: filePath, name: 'hook2' })
    ).rejects.toMatchObject({ cancelledByHook: 'beforeResourceCreate' });
  });

  test('should get resource by name layer and stack', async () => {
    const filePath1 = path.join(tempDir, 'resources', 'stack.md');
    await fs.ensureDir(path.dirname(filePath1));
    await fs.writeFile(filePath1, '# Stack 1');
    const r0 = await resourceService.create({ type: 'note', path: filePath1, name: 'stacked' });

    const filePath2 = path.join(tempDir, 'resources', 'stack2.md');
    await fs.writeFile(filePath2, '# Stack 2');
    const r1 = await resourceService.create({ type: 'note', path: filePath2, name: 'stacked' });

    expect(r0.layer).toBe(0);
    expect(r1.layer).toBe(1);

    const byLayer = await resourceService.getByNameLayer('stacked', 1);
    expect(byLayer.rid).toBe(r1.rid);

    const stack = await resourceService.getStack('stacked');
    expect(stack.map(r => r.layer)).toEqual([0, 1]);
  });

  test('promote swaps layers and removeFromStack hard deletes', async () => {
    const filePath1 = path.join(tempDir, 'resources', 'pstack.md');
    await fs.ensureDir(path.dirname(filePath1));
    await fs.writeFile(filePath1, '# P1');
    const r0 = await resourceService.create({ type: 'note', path: filePath1, name: 'pstack' });

    const filePath2 = path.join(tempDir, 'resources', 'pstack2.md');
    await fs.writeFile(filePath2, '# P2');
    const r1 = await resourceService.create({ type: 'note', path: filePath2, name: 'pstack' });

    const promoted = await resourceService.promote(r1.rid);
    expect(promoted.layer).toBe(0);

    const nowActive = await resourceService.getByName('pstack');
    expect(nowActive.rid).toBe(r1.rid);

    await expect(resourceService.promote(r1.rid)).rejects.toThrow(/已经是活跃层/);
    await expect(resourceService.promote('res_missing')).rejects.toThrow(/资源不存在/);

    const removed = await resourceService.removeFromStack(r0.rid);
    expect(removed.removed).toBe(true);
    expect(await resourceService.getByRid(r0.rid)).toBeNull();

    await expect(resourceService.removeFromStack(r1.rid)).rejects.toThrow(/不能移除活跃层/);
    await expect(resourceService.removeFromStack('res_missing')).rejects.toThrow(/资源不存在/);
  });

  test('should get resource by hash', async () => {
    const filePath = path.join(tempDir, 'resources', 'byhash.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# ByHash');
    const created = await resourceService.create({ type: 'note', path: filePath, name: 'byhash' });
    const byHash = await resourceService.getByHash(filePath);
    expect(byHash.rid).toBe(created.rid);
  });

  test('getAll supports filters', async () => {
    const p1 = path.join(tempDir, 'resources', 'f1.md');
    const p2 = path.join(tempDir, 'resources', 'f2.json');
    const p3 = path.join(tempDir, 'resources', 'f3.md');
    await fs.ensureDir(path.dirname(p1));
    await fs.writeFile(p1, '# F1');
    await fs.writeFile(p2, '{}');
    await fs.writeFile(p3, '# F3');
    await resourceService.create({ type: 'note', path: p1, name: 'f1' });
    await resourceService.create({ type: 'json', path: p2, name: 'f2' });
    await resourceService.create({ type: 'note', path: p3, name: 'f3' });

    const onlyNotes = await resourceService.getAll({ type: 'note' });
    expect(onlyNotes.every(r => r.type === 'note')).toBe(true);

    const limited = await resourceService.getAll({ limit: 2, offset: 0 });
    expect(limited.length).toBeLessThanOrEqual(2);

    const active = await resourceService.getAll({ activeOnly: true });
    expect(active.every(r => r.layer === 0)).toBe(true);
  });

  test('getAll with schema filter', async () => {
    const SchemaRegistry = require('../../src/repo/schemaRegistry.cjs');
    const schemaRegistry = new SchemaRegistry(db);
    await schemaRegistry.createSchema({ id: 'sf', name: 'schema-filter', fields: [] });
    const svc = new ResourceService(db, { getSchemaRegistry: () => schemaRegistry });

    const p1 = path.join(tempDir, 'resources', 'sf1.md');
    const p2 = path.join(tempDir, 'resources', 'sf2.md');
    await fs.ensureDir(path.dirname(p1));
    await fs.writeFile(p1, '# SF1');
    await fs.writeFile(p2, '# SF2');
    await svc.create({ type: 'note', path: p1, name: 'sf1', schema: 'sf' });
    await svc.create({ type: 'note', path: p2, name: 'sf2' });

    const bound = await svc.getAll({ schema: 'sf' });
    expect(bound.map(r => r.name)).toEqual(['sf1']);
  });

  test('update supports capabilities, container_schema and type', async () => {
    const filePath = path.join(tempDir, 'resources', 'upd.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Upd');
    const created = await resourceService.create({ type: 'note', path: filePath, name: 'upd' });

    const updated = await resourceService.update(created.rid, {
      capabilities: ['container'],
      container_schema: { allowed_types: ['note'], ignored_patterns: ['*.tmp'] },
      type: 'document'
    });
    expect(updated.capabilities).toEqual(['container']);
    expect(updated.type).toBe('document');
    expect(updated.container_schema.allowed_types).toEqual(['note']);
    expect(await resourceService._loadIgnorePatterns(created.rid)).toEqual(['*.tmp']);
  });

  test('update throws when resource not found', async () => {
    await expect(resourceService.update('res_missing', { metadata: { title: 'x' } })).rejects.toThrow('Resource not found');
  });

  test('update enforces bound schema values', async () => {
    const SchemaRegistry = require('../../src/repo/schemaRegistry.cjs');
    const schemaRegistry = new SchemaRegistry(db);
    await schemaRegistry.createSchema({
      id: 'su',
      name: 'schema-update',
      fields: [{ name: 'status', type: 'text' }]
    });
    const svc = new ResourceService(db, { getSchemaRegistry: () => schemaRegistry });
    const filePath = path.join(tempDir, 'resources', 'supd.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# SUpd');
    const created = await svc.create({ type: 'note', path: filePath, name: 'supd', schema: 'su', metadata: { status: 'ok' } });

    await expect(
      svc.update(created.rid, { metadata: { status: 42 } })
    ).rejects.toThrow(/校验失败/);
  });

  test('soft delete renames name and hard delete removes relations', async () => {
    const filePath = path.join(tempDir, 'resources', 'del.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Del');
    const created = await resourceService.create({ type: 'note', path: filePath, name: 'del' });

    await resourceService.delete(created.rid, true);
    expect(await resourceService.getByRid(created.rid)).toBeNull();
    expect(await resourceService.getByName('del')).toBeNull();

    const aPath = path.join(tempDir, 'resources', 'da.md');
    const bPath = path.join(tempDir, 'resources', 'db.md');
    await fs.writeFile(aPath, '# A');
    await fs.writeFile(bPath, '# B');
    const a = await resourceService.create({ type: 'note', path: aPath, name: 'da' });
    const b = await resourceService.create({ type: 'note', path: bPath, name: 'db' });
    await db.run('INSERT INTO relations (from_rid, to_rid, type, created) VALUES (?, ?, ?, ?)', [a.rid, b.rid, 'reference', Date.now()]);

    await resourceService.delete(a.rid, false);
    const rels = await db.all('SELECT * FROM relations WHERE from_rid = ? OR to_rid = ?', [a.rid, a.rid]);
    expect(rels.length).toBe(0);
  });

  test('move moves file on disk and updates path', async () => {
    const filePath = path.join(tempDir, 'resources', 'move.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Move');
    const created = await resourceService.create({ type: 'note', path: filePath, name: 'move' });

    const newPath = path.join(tempDir, 'resources', 'moved-dest.md');
    const moved = await resourceService.move(created.rid, newPath);
    expect(moved.path).toBe(newPath);
    expect(await fs.pathExists(newPath)).toBe(true);
    expect(await fs.pathExists(filePath)).toBe(false);

    await expect(resourceService.move('res_missing', newPath)).rejects.toThrow('Resource not found');
  });

  test('rehash updates hash after file change', async () => {
    const filePath = path.join(tempDir, 'resources', 'rehash.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Rehash');
    const created = await resourceService.create({ type: 'note', path: filePath, name: 'rehash' });
    const oldHash = created.hash;

    await fs.writeFile(filePath, '# Rehash changed content');
    const rehashed = await resourceService.rehash(created.rid);
    expect(rehashed.hash).not.toBe(oldHash);

    const unchanged = await resourceService.rehash(created.rid);
    expect(unchanged.hash).toBe(rehashed.hash);

    await expect(resourceService.rehash('res_missing')).rejects.toThrow('Resource not found');
  });

  test('refresh merges extracted metadata and updates hash', async () => {
    const filePath = path.join(tempDir, 'resources', 'refresh.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Old');
    const created = await resourceService.create({
      type: 'note', path: filePath, name: 'refresh', metadata: { category: 'manual' }
    });

    await fs.writeFile(filePath, '# New Title');
    const refreshed = await resourceService.refresh(created.rid);
    expect(refreshed.metadata.title).toBe('New Title');
    expect(refreshed.metadata.category).toBe('manual');
    expect(refreshed.hash).not.toBe(created.hash);

    await expect(resourceService.refresh('res_missing')).rejects.toThrow('Resource not found');
  });

  test('_writeFile encrypts with key and encrypt option', async () => {
    const CryptoUtils = require('../../src/utils/crypto.cjs');
    const key = CryptoUtils.generateKey();
    const svc = new ResourceService(db, { getCryptoKey: () => key });

    const plainPath = path.join(tempDir, 'plain.txt');
    await svc._writeFile(plainPath, 'hello');
    expect(CryptoUtils.isEncryptedFile(plainPath)).toBe(false);

    const encPath = path.join(tempDir, 'enc.txt');
    await svc._writeFile(encPath, 'secret', { encrypt: true });
    expect(CryptoUtils.isEncryptedFile(encPath)).toBe(true);
    expect(await svc._readFile(encPath, 'utf-8')).toBe('secret');
  });

  test('create auto-encrypts when crypto key and default policy enabled', async () => {
    const CryptoUtils = require('../../src/utils/crypto.cjs');
    const key = CryptoUtils.generateKey();
    const svc = new ResourceService(db, {
      getCryptoKey: () => key,
      isEncryptByDefault: () => true
    });

    const filePath = path.join(tempDir, 'resources', 'autoenc.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Secret');
    const resource = await svc.create({ type: 'note', path: filePath, name: 'autoenc' });

    expect(resource.encrypted).toBe(true);
    expect(CryptoUtils.isEncryptedFile(filePath)).toBe(true);
    expect(await svc._readFile(filePath, 'utf-8')).toBe('# Secret');
  });

  test('_extractMetadata uses plugin extension handler', async () => {
    const { registerMetadataField } = require('../../src/utils/validateMetadata.cjs');
    registerMetadataField('extraField', { type: 'string', check: (v) => typeof v === 'string' }, { owner: 'test' });
    const svc = new ResourceService(db, {
      getExtensionRegistry: () => ({
        get: (ns, type) => (ns === 'resourceTypes' && type === 'note')
          ? { extractMetadata: async () => ({ extraField: 'yes' }) }
          : null
      })
    });
    const filePath = path.join(tempDir, 'resources', 'ext.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Ext');
    const resource = await svc.create({ type: 'note', path: filePath, name: 'ext' });
    expect(resource.metadata.extraField).toBe('yes');
    expect(resource.metadata.title).toBe('Ext');
  });

  test('_extractMetadata returns empty for directories', async () => {
    const dir = path.join(tempDir, 'a-dir');
    await fs.ensureDir(dir);
    const meta = await resourceService._extractMetadata(dir, 'note');
    expect(meta).toEqual({});
  });

  test('isEncrypted detects encrypted files', async () => {
    const CryptoUtils = require('../../src/utils/crypto.cjs');
    const key = CryptoUtils.generateKey();
    const svc = new ResourceService(db, { getCryptoKey: () => key });
    const filePath = path.join(tempDir, 'detect.txt');
    await fs.writeFile(filePath, 'plain');
    expect(svc.isEncrypted(filePath)).toBe(false);
    await CryptoUtils.writeEncryptedFile(filePath, Buffer.from('secret'), key);
    expect(svc.isEncrypted(filePath)).toBe(true);
  });

  test('delete runs after hook', async () => {
    const afterDelete = jest.fn(async () => {});
    const svc = new ResourceService(db, {
      getHookManager: () => ({
        runBefore: jest.fn(async (name, payload) => ({ cancelled: false, payload })),
        runAfter: async (name, payload) => { if (name === 'afterResourceDelete') afterDelete(payload); }
      })
    });
    const filePath = path.join(tempDir, 'resources', 'hookdel.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# HD');
    const created = await svc.create({ type: 'note', path: filePath, name: 'hookdel' });
    await svc.delete(created.rid, true);
    expect(afterDelete).toHaveBeenCalled();
  });
});