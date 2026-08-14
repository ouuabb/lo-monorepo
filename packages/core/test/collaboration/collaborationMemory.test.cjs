const path = require('path');
const Database = require('../../src/repo/database.cjs');
const CollaborationMemory = require('../../src/collaboration/collaborationMemory.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('CollaborationMemory', () => {
  let tempDir, db, memory;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    memory = new CollaborationMemory(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  describe('messages', () => {
    test('saveMessage and getMessages should round-trip object payload', async () => {
      await memory.saveMessage({
        id: 'amsg_1',
        from: 'a',
        to: 'b',
        type: 'request',
        payload: { n: 1 },
        createdAt: 1000
      });
      const rows = await memory.getMessages('b');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        id: 'amsg_1',
        from: 'a',
        to: 'b',
        type: 'request',
        payload: { n: 1 },
        createdAt: 1000
      });
    });

    test('saveMessage should store string payload as-is', async () => {
      await memory.saveMessage({ id: 'amsg_2', from: 'a', to: 'b', type: 'n', payload: 'hello', createdAt: 2000 });
      const rows = await memory.getMessages('b');
      expect(rows[0].payload).toBe('hello');
    });

    test('getMessages should include broadcast messages and messages sent by agent', async () => {
      await memory.saveMessage({ id: 'amsg_3', from: 'x', to: '*', type: 'n', payload: { b: 1 }, createdAt: 1 });
      await memory.saveMessage({ id: 'amsg_4', from: 'a', to: 'c', type: 'n', payload: { s: 1 }, createdAt: 2 });
      await memory.saveMessage({ id: 'amsg_5', from: 'c', to: 'd', type: 'n', payload: {}, createdAt: 3 });
      const rows = await memory.getMessages('a');
      expect(rows.map(r => r.id)).toEqual(['amsg_4', 'amsg_3']);
    });

    test('getMessages should apply limit with DESC order', async () => {
      for (let i = 1; i <= 3; i++) {
        await memory.saveMessage({ id: `amsg_${i}`, from: 'a', to: 'b', type: 'n', payload: {}, createdAt: i });
      }
      const rows = await memory.getMessages('b', 2);
      expect(rows.map(r => r.id)).toEqual(['amsg_3', 'amsg_2']);
    });
  });

  describe('teams', () => {
    test('saveTeam and listTeams should round-trip', async () => {
      await memory.saveTeam({ id: 't1', name: 'Research', strategy: 'pipeline' });
      await memory.saveTeam({ id: 't2', name: 'Review', strategy: 'debate' });
      const rows = await memory.listTeams();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ id: 't1', name: 'Research', strategy: 'pipeline' });
      expect(rows[1]).toEqual({ id: 't2', name: 'Review', strategy: 'debate' });
    });

    test('saveTeam should replace existing row', async () => {
      await memory.saveTeam({ id: 't1', name: 'Old', strategy: 'pipeline' });
      await memory.saveTeam({ id: 't1', name: 'New', strategy: 'broadcast' });
      const rows = await memory.listTeams();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ id: 't1', name: 'New', strategy: 'broadcast' });
    });
  });

  describe('tasks', () => {
    test('saveTask and listTasks should round-trip with result object', async () => {
      await memory.saveTask({
        id: 'task_1',
        teamId: 't1',
        goal: 'research',
        status: 'completed',
        result: { ok: true }
      });
      const rows = await memory.listTasks('t1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        id: 'task_1',
        teamId: 't1',
        goal: 'research',
        status: 'completed',
        result: { ok: true }
      });
    });

    test('saveTask should store null result', async () => {
      await memory.saveTask({ id: 'task_2', teamId: 't1', goal: 'g', status: 'created', result: null });
      const rows = await memory.listTasks('t1');
      expect(rows[0].result).toBeNull();
    });

    test('listTasks should filter by teamId and apply limit', async () => {
      await memory.saveTask({ id: 'task_a', teamId: 't1', goal: 'g', status: 'created', result: null });
      await memory.saveTask({ id: 'task_b', teamId: 't1', goal: 'g', status: 'created', result: null });
      await memory.saveTask({ id: 'task_c', teamId: 't2', goal: 'g', status: 'created', result: null });
      const all = await memory.listTasks();
      expect(all).toHaveLength(3);
      const filtered = await memory.listTasks('t1');
      expect(filtered.map(t => t.id)).toEqual(['task_b', 'task_a']);
      const limited = await memory.listTasks('t1', 1);
      expect(limited).toHaveLength(1);
    });
  });

  describe('guard and error handling', () => {
    test('methods should no-op or return [] when db is missing', async () => {
      const m = new CollaborationMemory();
      await m.saveMessage({ id: 'x', from: 'a', to: 'b', payload: {}, createdAt: 1 });
      expect(await m.getMessages('a')).toEqual([]);
      await m.saveTeam({ id: 't', name: 'n', strategy: 'p' });
      expect(await m.listTeams()).toEqual([]);
      await m.saveTask({ id: 'x', teamId: 't', goal: 'g', status: 'created', result: null });
      expect(await m.listTasks('t')).toEqual([]);
    });

    test('saveMessage should catch db.run errors', async () => {
      const err = console.error;
      console.error = jest.fn();
      try {
        const m = new CollaborationMemory({ run: jest.fn().mockRejectedValue(new Error('run fail')) });
        await m.saveMessage({ id: 'x', from: 'a', to: 'b', payload: {}, createdAt: 1 });
      } finally {
        console.error = err;
      }
    });

    test('saveTeam and saveTask should catch db.run errors', async () => {
      const err = console.error;
      console.error = jest.fn();
      try {
        const m = new CollaborationMemory({ run: jest.fn().mockRejectedValue(new Error('run fail')) });
        await m.saveTeam({ id: 't', name: 'n', strategy: 'p' });
        await m.saveTask({ id: 'x', teamId: 't', goal: 'g', status: 'created', result: null });
      } finally {
        console.error = err;
      }
    });

    test('getMessages and list queries should return [] on db errors', async () => {
      const m = new CollaborationMemory({ all: jest.fn().mockRejectedValue(new Error('all fail')) });
      expect(await m.getMessages('a')).toEqual([]);
      expect(await m.listTeams()).toEqual([]);
      expect(await m.listTasks('t')).toEqual([]);
    });
  });
});
