const path = require('path');
const Database = require('../../src/repo/database.cjs');
const RuntimeStore = require('../../src/runtime/runtimeStore.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('RuntimeStore', () => {
  let tempDir, db, store;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    store = new RuntimeStore(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('saveInstance inserts and getInstance reads it back', async () => {
    await store.saveInstance({ id: 'inst-1', type: 'agent', state: { x: 1 } });
    const got = await store.getInstance('inst-1');
    expect(got).toMatchObject({ id: 'inst-1', type: 'agent' });
    expect(JSON.parse(got.state)).toEqual({ x: 1 });
    expect(got.created_at).toBeTruthy();
    expect(got.updated_at).toBeTruthy();
  });

  test('saveInstance preserves created_at on update', async () => {
    await store.saveInstance({ id: 'i1', type: 't', state: { v: 1 } });
    const first = await store.getInstance('i1');
    await new Promise(r => setTimeout(r, 5));
    await store.saveInstance({ id: 'i1', type: 't', state: { v: 2 } });
    const second = await store.getInstance('i1');
    expect(second.created_at).toBe(first.created_at);
    expect(JSON.parse(second.state)).toEqual({ v: 2 });
  });

  test('saveInstance defaults type and state', async () => {
    await store.saveInstance({ id: 'inst-2' });
    const got = await store.getInstance('inst-2');
    expect(got.type).toBe('unknown');
    expect(JSON.parse(got.state)).toEqual({});
  });

  test('getInstance returns undefined for a missing id', async () => {
    expect(await store.getInstance('nope')).toBeUndefined();
  });

  test('listInstances returns all instances or filters by type', async () => {
    await store.saveInstance({ id: 'a', type: 'agent', state: {} });
    await store.saveInstance({ id: 'b', type: 'resource', state: {} });
    expect(await store.listInstances()).toHaveLength(2);
    const agents = await store.listInstances('agent');
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('a');
  });

  test('listInstances without a type lists everything', async () => {
    await store.saveInstance({ id: 'a', type: 'agent', state: {} });
    expect(await store.listInstances()).toHaveLength(1);
  });

  test('deleteInstance removes the row', async () => {
    await store.saveInstance({ id: 'a', type: 'agent', state: {} });
    await store.deleteInstance('a');
    expect(await store.getInstance('a')).toBeUndefined();
  });

  test('saveEvent inserts a row with a generated id', async () => {
    await store.saveEvent({ runtimeId: 'r1', event: 'started', payload: { n: 1 } });
    const rows = await db.all('SELECT * FROM runtime_events');
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe('started');
    expect(rows[0].runtime_id).toBe('r1');
    expect(JSON.parse(rows[0].payload)).toEqual({ n: 1 });
    expect(rows[0].id).toMatch(/^rte_/);
    expect(rows[0].created_at).toBeTruthy();
  });

  test('saveEvent accepts an explicit id and type field', async () => {
    await store.saveEvent({ id: 'evt-1', runtimeId: 'r1', type: 'stopped', payload: {} });
    const rows = await db.all('SELECT * FROM runtime_events');
    expect(rows[0].id).toBe('evt-1');
    expect(rows[0].event).toBe('stopped');
  });

  test('saveEvent defaults runtimeId and payload', async () => {
    await store.saveEvent({ event: 'plain' });
    const rows = await db.all('SELECT * FROM runtime_events');
    expect(rows[0].runtime_id).toBe('');
    expect(rows[0].payload).toBe('{}');
  });

  test('getEvents filters by runtimeId and orders by created_at DESC', async () => {
    await store.saveEvent({ id: 'e1', runtimeId: 'r1', event: 'a', payload: {} });
    await store.saveEvent({ id: 'e2', runtimeId: 'r2', event: 'b', payload: {} });
    await store.saveEvent({ id: 'e3', runtimeId: 'r1', event: 'c', payload: {} });
    const forR1 = await store.getEvents({ runtimeId: 'r1' });
    expect(forR1).toHaveLength(2);
    expect(forR1[0].event).toBe('c');
    expect(forR1[1].event).toBe('a');
  });

  test('getEvents supports since filter and limit', async () => {
    await store.saveEvent({ id: 'e1', runtimeId: 'r1', event: 'a', payload: {} });
    await store.saveEvent({ id: 'e2', runtimeId: 'r1', event: 'b', payload: {} });
    const allSince = await store.getEvents({ since: 0 });
    expect(allSince).toHaveLength(2);
    const futureSince = await store.getEvents({ since: Date.now() + 100000 });
    expect(futureSince).toEqual([]);
    const limited = await store.getEvents({ runtimeId: 'r1', limit: 1 });
    expect(limited).toHaveLength(1);
  });

  test('getEvents with no options returns all events', async () => {
    await store.saveEvent({ id: 'e1', event: 'a', payload: {} });
    await store.saveEvent({ id: 'e2', event: 'b', payload: {} });
    expect(await store.getEvents()).toHaveLength(2);
  });

  test('saveState and getState round trip JSON values', async () => {
    await store.saveState('key1', { a: 1, list: [1, 2] });
    expect(await store.getState('key1')).toEqual({ a: 1, list: [1, 2] });
  });

  test('saveState replaces an existing key', async () => {
    await store.saveState('key1', { v: 1 });
    await store.saveState('key1', { v: 2 });
    expect(await store.getState('key1')).toEqual({ v: 2 });
  });

  test('getState returns null for a missing key', async () => {
    expect(await store.getState('missing')).toBeNull();
  });

  test('getState returns null for corrupt stored JSON', async () => {
    await db.run('INSERT INTO runtime_state (key, value, updated_at) VALUES (?, ?, ?)', ['corrupt', '{bad json', Date.now()]);
    expect(await store.getState('corrupt')).toBeNull();
  });

  test('stats returns instance and event counts', async () => {
    expect(await store.stats()).toEqual({ instances: 0, events: 0 });
    await store.saveInstance({ id: 'a', type: 'agent', state: {} });
    await store.saveEvent({ id: 'e1', event: 'x', payload: {} });
    expect(await store.stats()).toEqual({ instances: 1, events: 1 });
  });

  test('_newId generates a random prefixed id', () => {
    const id = store._newId();
    expect(id).toMatch(/^rte_[0-9a-f]{16}$/);
    expect(id).not.toBe(store._newId());
  });

  describe('error paths', () => {
    test('read methods return safe defaults when db fails', async () => {
      const broken = {
        run: jest.fn(async () => { throw new Error('db boom'); }),
        get: jest.fn(async () => { throw new Error('db boom'); }),
        all: jest.fn(async () => { throw new Error('db boom'); })
      };
      const s = new RuntimeStore(broken);
      expect(await s.getInstance('x')).toBeNull();
      expect(await s.listInstances()).toEqual([]);
      expect(await s.listInstances('agent')).toEqual([]);
      expect(await s.getEvents({ runtimeId: 'r1' })).toEqual([]);
      expect(await s.getState('k')).toBeNull();
      expect(await s.stats()).toEqual({ instances: 0, events: 0 });
    });

    test('write methods propagate db failures', async () => {
      const broken = {
        run: jest.fn(async () => { throw new Error('db boom'); })
      };
      const s = new RuntimeStore(broken);
      await expect(s.saveInstance({ id: 'a' })).rejects.toThrow('db boom');
      await expect(s.saveEvent({ event: 'x' })).rejects.toThrow('db boom');
      await expect(s.saveState('k', 'v')).rejects.toThrow('db boom');
      await expect(s.deleteInstance('a')).rejects.toThrow('db boom');
    });
  });
});
