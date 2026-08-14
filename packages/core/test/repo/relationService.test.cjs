const fs = require('fs-extra');
const path = require('path');
const RelationService = require('../../src/repo/relationService.cjs');
const Database = require('../../src/repo/database.cjs');

describe('RelationService', () => {
  let tempDir;
  let db;
  let relationService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-relation-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.init();
    relationService = new RelationService(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('should create relation', async () => {
    const result = await relationService.create('res_a', 'res_b', 'reference');
    expect(result).not.toBeNull();
    expect(result.from_rid).toBe('res_a');
    expect(result.to_rid).toBe('res_b');
    expect(result.type).toBe('reference');
  });

  test('should create bidirectional relation', async () => {
    const result = await relationService.createBidirectional('res_a', 'res_b', 'reference');
    
    const forward = await relationService.getById(result.a.id);
    expect(forward).not.toBeNull();
    expect(forward.from_rid).toBe('res_a');
    expect(forward.to_rid).toBe('res_b');

    const relations = await relationService.listAll();
    expect(relations.length).toBe(2);
  });

  test('should get relation by ID', async () => {
    const created = await relationService.create('res_a', 'res_b', 'reference');
    const retrieved = await relationService.getById(created.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved.id).toBe(created.id);
  });

  test('should list all relations', async () => {
    await relationService.create('res_a', 'res_b', 'reference');
    await relationService.create('res_b', 'res_c', 'reference');

    const relations = await relationService.listAll();
    expect(relations.length).toBe(2);
  });

  test('should list relations by type', async () => {
    await relationService.create('res_a', 'res_b', 'reference');
    await relationService.create('res_b', 'res_c', 'wikilink');

    const refs = await relationService.listAll({ type: 'reference' });
    expect(refs.length).toBe(1);
    expect(refs[0].type).toBe('reference');
  });

  test('should get outgoing relations', async () => {
    await relationService.create('res_a', 'res_b', 'reference');
    await relationService.create('res_a', 'res_c', 'reference');
    await relationService.create('res_b', 'res_c', 'reference');

    const outgoing = await relationService.getByFromRid('res_a');
    expect(outgoing.length).toBe(2);
  });

  test('should get incoming relations', async () => {
    await relationService.create('res_a', 'res_b', 'reference');
    await relationService.create('res_c', 'res_b', 'reference');
    await relationService.create('res_b', 'res_d', 'reference');

    const incoming = await relationService.getByToRid('res_b');
    expect(incoming.length).toBe(2);
  });

  test('should remove relation by triple', async () => {
    await relationService.create('res_a', 'res_b', 'reference');
    
    await relationService.removeByTriple('res_a', 'res_b', 'reference');
    
    const relations = await relationService.listAll();
    expect(relations.length).toBe(0);
  });

  test('should remove relation by ID', async () => {
    const created = await relationService.create('res_a', 'res_b', 'reference');
    
    await relationService.remove(created.id);
    
    const relations = await relationService.listAll();
    expect(relations.length).toBe(0);
  });

  test('should update relation', async () => {
    const created = await relationService.create('res_a', 'res_b', 'reference', { weight: 1 });
    
    const updated = await relationService.update(created.id, { metadata: { weight: 2, note: 'updated' } });
    
    expect(updated.metadata.weight).toBe(2);
    expect(updated.metadata.note).toBe('updated');
  });

  test('should get outgoing relations by type', async () => {
    await relationService.create('res_a', 'res_b', 'embed', { origin: 'markdown_parser' });
    await relationService.create('res_a', 'res_c', 'wikilink');
    await relationService.create('res_b', 'res_c', 'embed');

    const embeds = await relationService.getByFromRidAndType('res_a', 'embed');
    expect(embeds.length).toBe(1);
    expect(embeds[0].type).toBe('embed');
    expect(embeds[0].metadata.origin).toBe('markdown_parser');
  });

  test('should remove by from_rid and type with origin filter', async () => {
    await relationService.create('res_a', 'res_b', 'embed', { origin: 'markdown_parser' });
    await relationService.create('res_a', 'res_c', 'embed', { origin: 'user' });
    await relationService.create('res_a', 'res_d', 'wikilink');

    const removed = await relationService.removeByFromRidAndType('res_a', 'embed', 'markdown_parser');
    expect(removed.removed).toBe(1);

    // user-created embed should remain
    const remainingEmbeds = await relationService.getByFromRidAndType('res_a', 'embed');
    expect(remainingEmbeds.length).toBe(1);
    expect(remainingEmbeds[0].metadata.origin).toBe('user');
  });

  test('should remove by from_rid and type without origin filter', async () => {
    await relationService.create('res_a', 'res_b', 'embed');
    await relationService.create('res_a', 'res_c', 'embed');
    await relationService.create('res_a', 'res_d', 'wikilink');

    const removed = await relationService.removeByFromRidAndType('res_a', 'embed');
    expect(removed.removed).toBe(2);

    const embeds = await relationService.getByFromRidAndType('res_a', 'embed');
    expect(embeds.length).toBe(0);
  });
});