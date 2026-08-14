const path = require('path');
const Database = require('../../src/repo/database.cjs');
const SharedMemory = require('../../src/collaboration/sharedMemory.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('SharedMemory', () => {
  let tempDir, db, memory;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    memory = new SharedMemory(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('write should insert and return entry with defaults', async () => {
    const entry = await memory.write({ content: { hello: 'world' } });
    expect(entry.id).toMatch(/^sm_/);
    expect(entry.scope).toBe('team');
    expect(entry.type).toBe('knowledge');
    expect(entry.content).toEqual({ hello: 'world' });
    expect(entry.owner).toBe('system');
    expect(entry.visibility).toBe('all');

    const rows = await db.all('SELECT * FROM shared_memory');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].content)).toEqual({ hello: 'world' });
  });

  test('write should preserve explicit options and string content', async () => {
    await memory.write({ scope: 'team:research', type: 'decision', content: 'plain text', owner: 'agent-1', visibility: 'team' });
    const rows = await db.all('SELECT * FROM shared_memory');
    expect(rows[0].scope).toBe('team:research');
    expect(rows[0].type).toBe('decision');
    expect(rows[0].content).toBe('plain text');
    expect(rows[0].owner).toBe('agent-1');
    expect(rows[0].visibility).toBe('team');
  });

  test('read should filter by scope prefix', async () => {
    await memory.write({ scope: 'team:a', type: 'knowledge', content: { i: 1 } });
    await memory.write({ scope: 'team:a.task:1', type: 'knowledge', content: { i: 2 } });
    await memory.write({ scope: 'global', type: 'knowledge', content: { i: 3 } });
    const rows = await memory.read({ scope: 'team:a' });
    expect(rows).toHaveLength(2);
  });

  test('read should filter by exact type and respect limit with DESC order', async () => {
    await memory.write({ scope: 'team:a', type: 'knowledge', content: { i: 1 } });
    await memory.write({ scope: 'team:a', type: 'decision', content: { i: 2 } });
    await memory.write({ scope: 'team:a', type: 'knowledge', content: { i: 3 } });
    const byType = await memory.read({ scope: 'team:a', type: 'decision' });
    expect(byType).toHaveLength(1);
    expect(byType[0].content).toEqual({ i: 2 });

    const ids = await db.all('SELECT entry_id FROM shared_memory ORDER BY id');
    await db.run('UPDATE shared_memory SET created_at = 100 WHERE entry_id = ?', [ids[0].entry_id]);
    await db.run('UPDATE shared_memory SET created_at = 200 WHERE entry_id = ?', [ids[1].entry_id]);
    await db.run('UPDATE shared_memory SET created_at = 300 WHERE entry_id = ?', [ids[2].entry_id]);

    const limited = await memory.read({ scope: 'team:a', limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0].content.i).toBe(3);
  });

  test('read should return empty array for no matches', async () => {
    await memory.write({ scope: 'team:a', content: { i: 1 } });
    const rows = await memory.read({ scope: 'nope' });
    expect(rows).toEqual([]);
  });

  test('read should hydrate non-JSON content gracefully', async () => {
    const err = console.error;
    console.error = jest.fn();
    try {
      await memory.write({ content: 'not-json' });
      const rows = await memory.read({});
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe('not-json');
    } finally {
      console.error = err;
    }
  });

  test('clear with scope should delete matching rows only', async () => {
    await memory.write({ scope: 'team:a', content: {} });
    await memory.write({ scope: 'team:b', content: {} });
    await memory.clear('team:a');
    const rows = await db.all('SELECT * FROM shared_memory');
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('team:b');
  });

  test('clear without scope should delete everything', async () => {
    await memory.write({ scope: 'team:a', content: {} });
    await memory.write({ scope: 'global', content: {} });
    await memory.clear();
    const rows = await db.all('SELECT * FROM shared_memory');
    expect(rows).toHaveLength(0);
  });

  test('stats should report entry and scope counts', async () => {
    await memory.write({ scope: 'team:a', content: {} });
    await memory.write({ scope: 'team:a', content: {} });
    await memory.write({ scope: 'global', content: {} });
    const stats = await memory.stats();
    expect(stats.entryCount).toBe(3);
    expect(stats.scopeCount).toBe(2);
  });
});
