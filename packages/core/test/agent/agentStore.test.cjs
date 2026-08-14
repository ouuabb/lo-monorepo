const path = require('path');
const Database = require('../../src/repo/database.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const AgentStore = require('../../src/agent/agentStore.cjs');
const testUtils = global.testUtils;

describe('AgentStore', () => {
  let tempDir, db, store;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    store = new AgentStore(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  const agent = () => ({
    id: 'a1',
    name: 'Agent One',
    type: 'research',
    status: 'running',
    toJSON: () => ({ id: 'a1', name: 'Agent One' }),
    createdAt: 111,
    updatedAt: 222
  });

  test('saveAgent inserts a row', async () => {
    await store.saveAgent(agent());
    const row = await db.get('SELECT * FROM agents WHERE id = ?', ['a1']);
    expect(row).toBeTruthy();
    expect(row.type).toBe('research');
    expect(row.status).toBe('running');
    expect(JSON.parse(row.config)).toEqual({ id: 'a1', name: 'Agent One' });
  });

  test('saveAgent replaces existing row', async () => {
    await store.saveAgent(agent());
    await store.saveAgent({ ...agent(), status: 'disabled' });
    const rows = await db.all('SELECT * FROM agents');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('disabled');
  });

  test('getAgent returns parsed config', async () => {
    await store.saveAgent(agent());
    const got = await store.getAgent('a1');
    expect(got).toEqual({ id: 'a1', name: 'Agent One' });
  });

  test('getAgent returns null when missing or broken', async () => {
    expect(await store.getAgent('nope')).toBeNull();
    await db.run("INSERT INTO agents (id, config) VALUES ('x', 'not json')");
    expect(await store.getAgent('x')).toBeNull();
  });

  test('listAgents returns summaries ordered by created_at', async () => {
    await store.saveAgent(agent());
    await store.saveAgent({ ...agent(), id: 'a2', name: 'Two', createdAt: 1, updatedAt: 2 });
    const list = await store.listAgents();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('a2');
    expect(list[0]).toMatchObject({ name: 'Two', type: 'research', status: 'running' });
    expect(list[0].createdAt).toBe(1);
  });

  test('saveRun inserts a run', async () => {
    await store.saveRun({ id: 'r1', agentId: 'a1', status: 'completed', input: { goal: 'x' }, output: { ok: true }, createdAt: 5 });
    const row = await db.get('SELECT * FROM agent_runs WHERE id = ?', ['r1']);
    expect(row.status).toBe('completed');
    expect(JSON.parse(row.input)).toEqual({ goal: 'x' });
    expect(JSON.parse(row.output)).toEqual({ ok: true });
  });

  test('listRuns returns runs newest first', async () => {
    await store.saveRun({ id: 'r1', agentId: 'a1', status: 'completed', input: {}, output: {}, createdAt: 1 });
    await store.saveRun({ id: 'r2', agentId: 'a1', status: 'failed', input: {}, output: {}, createdAt: 3 });
    await store.saveRun({ id: 'r3', agentId: 'a2', status: 'completed', input: {}, output: {}, createdAt: 2 });
    const runs = await store.listRuns('a1');
    expect(runs.map(r => r.id)).toEqual(['r2', 'r1']);
    expect(runs[0]).toMatchObject({ agentId: 'a1', status: 'failed' });
    expect(runs[0].createdAt).toBe(3);
  });

  test('listRuns without agentId returns all', async () => {
    await store.saveRun({ id: 'r1', agentId: 'a1', status: 'completed', input: {}, output: {}, createdAt: 1 });
    await store.saveRun({ id: 'r2', agentId: 'a2', status: 'completed', input: {}, output: {}, createdAt: 2 });
    const runs = await store.listRuns(null, 10);
    expect(runs).toHaveLength(2);
  });

  test('listRuns respects limit', async () => {
    for (let i = 0; i < 4; i++) {
      await store.saveRun({ id: `r${i}`, agentId: 'a1', status: 'x', input: {}, output: {}, createdAt: i });
    }
    expect(await store.listRuns('a1', 2)).toHaveLength(2);
  });

  test('handles null output/input JSON', async () => {
    await db.run(
      "INSERT INTO agent_runs (id, agent_id, status, input, output, created_at) VALUES ('r1','a1','ok',NULL,NULL,1)"
    );
    const runs = await store.listRuns('a1');
    expect(runs[0].input).toBeNull();
    expect(runs[0].output).toBeNull();
  });

  test('returns empty when db missing', async () => {
    const s = new AgentStore(null);
    expect(await s.getAgent('a1')).toBeNull();
    expect(await s.listAgents()).toEqual([]);
    expect(await s.listRuns('a1')).toEqual([]);
    await expect(s.saveAgent(agent())).resolves.toBeUndefined();
    await expect(s.saveRun({})).resolves.toBeUndefined();
  });
});
