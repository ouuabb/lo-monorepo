const path = require('path');
const Database = require('../../src/repo/database.cjs');
const EvolutionMemory = require('../../src/evolution/evolutionMemory.cjs');
const EvolutionState = require('../../src/evolution/evolutionState.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('EvolutionMemory', () => {
  let tempDir, db, memory;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    memory = new EvolutionMemory(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('record inserts a row and returns evolution summary', async () => {
    const state = new EvolutionState({ health: 0.5 });
    const result = await memory.record({
      fromState: state,
      action: 'refactor',
      result: { ok: true },
      improvement: 3
    });

    expect(result.id).toBe('evm_refactor');
    expect(result.action).toBe('refactor');
    expect(result.improvement).toBe(3);
    expect(result.fromState).toBe(JSON.stringify(state.toJSON()));
    expect(typeof result.createdAt).toBe('number');

    const rows = await db.all('SELECT * FROM evolution_actions');
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('evolution');
    expect(rows[0].strategy).toBe(JSON.stringify(state.toJSON()));
    expect(rows[0].action).toBe('refactor');
    expect(rows[0].status).toBe('improved');
    expect(JSON.parse(rows[0].result)).toEqual({ result: { ok: true }, improvement: 3 });
  });

  test('record stores unchanged status when no improvement', async () => {
    const result = await memory.record({ fromState: null, action: 'expand', result: { n: 1 } });
    expect(result.improvement).toBe(0);
    expect(result.fromState).toBeNull();

    const rows = await db.all('SELECT * FROM evolution_actions');
    expect(rows[0].strategy).toBeNull();
    expect(rows[0].status).toBe('unchanged');
  });

  test('record serializes plain object fromState', async () => {
    await memory.record({ fromState: { health: 0.2 }, action: 'merge', result: {} });
    const rows = await db.all('SELECT * FROM evolution_actions');
    expect(rows[0].strategy).toBe('{"health":0.2}');
  });

  test('record generates id from timestamp when action missing', async () => {
    const result = await memory.record({ result: { ok: 1 } });
    expect(result.id).toMatch(/^evm_/);
    expect(result.action).toBeUndefined();
    expect(result.improvement).toBe(0);

    const rows = await db.all('SELECT * FROM evolution_actions');
    expect(rows[0].action).toBeNull();
    expect(rows[0].status).toBe('unchanged');
  });

  test('history returns records oldest first with parsed fields', async () => {
    await db.run(`INSERT INTO evolution_actions (type, strategy, action, status, result, created_at) VALUES ('evolution', '{"v":1}', 'a', 'improved', '{"result":1,"improvement":1}', 1000)`);
    await db.run(`INSERT INTO evolution_actions (type, strategy, action, status, result, created_at) VALUES ('evolution', '{"v":2}', 'b', 'unchanged', '{"result":2,"improvement":0}', 2000)`);

    const history = await memory.history(50);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ action: 'a', fromState: { v: 1 }, result: 1, improvement: 1 });
    expect(history[1]).toMatchObject({ action: 'b', fromState: { v: 2 }, result: 2, improvement: 0 });
  });

  test('history respects limit', async () => {
    await db.run(`INSERT INTO evolution_actions (created_at) VALUES (1)`);
    await db.run(`INSERT INTO evolution_actions (created_at) VALUES (2)`);
    await db.run(`INSERT INTO evolution_actions (created_at) VALUES (3)`);

    const history = await memory.history(2);
    expect(history).toHaveLength(2);
  });

  test('last returns most recent record', async () => {
    await db.run(`INSERT INTO evolution_actions (strategy, action, result, created_at) VALUES ('{"v":1}', 'a', '{"result":1,"improvement":0}', 10)`);
    await db.run(`INSERT INTO evolution_actions (strategy, action, result, created_at) VALUES ('{"v":2}', 'b', '{"result":2,"improvement":0}', 20)`);

    const last = await memory.last();
    expect(last.action).toBe('b');
    expect(last.fromState).toEqual({ v: 2 });
    expect(last.result).toBe(2);
  });

  test('last returns null when empty', async () => {
    await expect(memory.last()).resolves.toBeNull();
  });

  test('stats computes totals and improvement rate', async () => {
    await db.run(`INSERT INTO evolution_actions (status) VALUES ('improved')`);
    await db.run(`INSERT INTO evolution_actions (status) VALUES ('improved')`);
    await db.run(`INSERT INTO evolution_actions (status) VALUES ('unchanged')`);

    const stats = await memory.stats();
    expect(stats).toEqual({ totalEvolutions: 3, improvementRate: 67 });
  });

  test('stats returns zeros when empty', async () => {
    const stats = await memory.stats();
    expect(stats).toEqual({ totalEvolutions: 0, improvementRate: 0 });
  });

  test('hydrate tolerates invalid JSON in strategy and result', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await db.run(`INSERT INTO evolution_actions (strategy, action, result) VALUES ('not-json{', 'a', 'also-bad[')`);
      const history = await memory.history(50);
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('a');
      expect(history[0].fromState).toBe('not-json{');
      expect(history[0].result).toBeUndefined();
      expect(history[0].improvement).toBe(0);
      expect(errorSpy).toHaveBeenCalledTimes(2);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('hydrate handles null strategy and empty result', async () => {
    await db.run(`INSERT INTO evolution_actions (strategy, action, result) VALUES (NULL, 'b', '{"improvement":2}')`);
    const history = await memory.history(50);
    expect(history[0]).toMatchObject({ action: 'b', fromState: null, improvement: 2, result: undefined });
  });
});
