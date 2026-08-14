const path = require('path');
const Database = require('../../src/repo/database.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const AgentMemory = require('../../src/agent/agentMemory.cjs');
const testUtils = global.testUtils;

describe('AgentMemory', () => {
  let tempDir, db, memory;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    memory = new AgentMemory(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('save inserts a memory row and returns id', async () => {
    const res = await memory.save({ agentId: 'a1', type: 'decision', content: { decision: 'x' } });
    expect(res.id).toContain('mem_');
    const rows = await db.all('SELECT * FROM agent_memory');
    expect(rows).toHaveLength(1);
    expect(rows[0].agent_id).toBe('a1');
    expect(rows[0].type).toBe('decision');
    expect(JSON.parse(rows[0].content)).toEqual({ decision: 'x' });
  });

  test('getRecent returns memories newest first', async () => {
    await memory.save({ agentId: 'a1', type: 'observation', content: { n: 1 } });
    await memory.save({ agentId: 'a1', type: 'observation', content: { n: 2 } });
    await memory.save({ agentId: 'a2', type: 'observation', content: { n: 99 } });
    const list = await memory.getRecent('a1');
    expect(list).toHaveLength(2);
    expect(list[0].content.n).toBe(2);
    expect(list[1].content.n).toBe(1);
    expect(list[0]).toMatchObject({ id: expect.any(String), agentId: 'a1', type: 'observation' });
    expect(list[0].createdAt).toBeGreaterThan(0);
  });

  test('getRecent respects limit', async () => {
    for (let i = 0; i < 5; i++) await memory.save({ agentId: 'a1', type: 'observation', content: { i } });
    const list = await memory.getRecent('a1', 2);
    expect(list).toHaveLength(2);
  });

  test('getRecent returns empty array for unknown agent', async () => {
    expect(await memory.getRecent('nope')).toEqual([]);
  });

  test('getByType filters by type', async () => {
    await memory.save({ agentId: 'a1', type: 'observation', content: { a: 1 } });
    await memory.save({ agentId: 'a1', type: 'decision', content: { b: 2 } });
    const obs = await memory.getByType('a1', 'observation');
    expect(obs).toHaveLength(1);
    expect(obs[0].type).toBe('observation');
  });

  test('getByType handles null content', async () => {
    await db.run(
      'INSERT INTO agent_memory (id, agent_id, type, content, created_at) VALUES (?,?,?,?,?)',
      ['m1', 'a1', 'observation', null, 1]
    );
    const list = await memory.getByType('a1', 'observation');
    expect(list[0].content).toBeNull();
  });

  test('returns null/empty when db is missing', async () => {
    const m = new AgentMemory(null);
    expect(await m.save({ agentId: 'a1', type: 'x', content: {} })).toBeNull();
    expect(await m.getRecent('a1')).toEqual([]);
    expect(await m.getByType('a1', 'x')).toEqual([]);
  });

  test('swallows errors when table missing', async () => {
    await db.run('DROP TABLE agent_memory');
    const res = await memory.save({ agentId: 'a1', type: 'x', content: {} });
    expect(res).toBeNull();
    expect(await memory.getRecent('a1')).toEqual([]);
    expect(await memory.getByType('a1', 'x')).toEqual([]);
  });
});
