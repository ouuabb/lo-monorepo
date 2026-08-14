const path = require('path');
const Database = require('../../src/repo/database.cjs');
const EventStore = require('../../src/event/eventStore.cjs');
const Event = require('../../src/event/event.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('EventStore', () => {
  let tempDir, db, store;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    store = new EventStore(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function seed(events) {
    for (const e of events) {
      await store.save(new Event(e));
    }
  }

  test('save should insert a row and return id', async () => {
    const event = new Event({
      type: 'resource.created',
      payload: { rid: 'r1' },
      source: 'test',
      metadata: { extra: true },
      timestamp: 1000
    });
    const { id } = await store.save(event);
    expect(id).toMatch(/^evt_/);

    const row = await db.get('SELECT * FROM events WHERE id = ?', [id]);
    expect(row.type).toBe('resource.created');
    expect(row.source).toBe('test');
    expect(JSON.parse(row.payload)).toEqual({ rid: 'r1' });
    expect(JSON.parse(row.metadata)).toEqual({ extra: true });
    expect(row.created_at).toBe(1000);
  });

  test('save should tolerate null payload', async () => {
    const { id } = await store.save(new Event({ type: 'no.payload', payload: undefined }));
    const got = await store.get(id);
    expect(got.payload).toBeNull();
  });

  test('get should return parsed event for existing id', async () => {
    await seed([{ type: 'a.b', payload: { n: 1 }, source: 's', timestamp: 5 }]);
    const rows = await db.all('SELECT id FROM events');
    const got = await store.get(rows[0].id);
    expect(got).toMatchObject({
      type: 'a.b',
      payload: { n: 1 },
      source: 's',
      createdAt: 5
    });
  });

  test('get should return null for missing id', async () => {
    expect(await store.get('evt_missing')).toBeNull();
  });

  test('query should filter by type, source and since', async () => {
    await seed([
      { type: 'a.b', source: 's1', payload: { i: 1 }, timestamp: 10 },
      { type: 'a.b', source: 's2', payload: { i: 2 }, timestamp: 20 },
      { type: 'c.d', source: 's1', payload: { i: 3 }, timestamp: 30 }
    ]);
    const byType = await store.query({ type: 'a.b' });
    expect(byType).toHaveLength(2);

    const bySource = await store.query({ source: 's1' });
    expect(bySource).toHaveLength(2);

    const since = await store.query({ since: 15 });
    expect(since).toHaveLength(2);
    expect(since[0].payload).toEqual({ i: 3 });
  });

  test('query should support limit and offset with DESC ordering', async () => {
    await seed([
      { type: 'a', payload: { i: 1 }, timestamp: 10 },
      { type: 'a', payload: { i: 2 }, timestamp: 20 },
      { type: 'a', payload: { i: 3 }, timestamp: 30 }
    ]);
    const limited = await store.query({ type: 'a', limit: 2, offset: 0 });
    expect(limited).toHaveLength(2);
    expect(limited[0].payload.i).toBe(3);
    expect(limited[1].payload.i).toBe(2);

    const paged = await store.query({ type: 'a', limit: 2, offset: 2 });
    expect(paged).toHaveLength(1);
    expect(paged[0].payload.i).toBe(1);
  });

  test('count should total and filter by type', async () => {
    await seed([
      { type: 'a', payload: {}, timestamp: 1 },
      { type: 'a', payload: {}, timestamp: 2 },
      { type: 'b', payload: {}, timestamp: 3 }
    ]);
    expect(await store.count()).toBe(3);
    expect(await store.count('a')).toBe(2);
    expect(await store.count('zzz')).toBe(0);
  });

  test('typeStats should group counts', async () => {
    await seed([
      { type: 'a', payload: {}, timestamp: 1 },
      { type: 'a', payload: {}, timestamp: 2 },
      { type: 'b', payload: {}, timestamp: 3 }
    ]);
    const stats = await store.typeStats();
    expect(stats).toEqual(expect.arrayContaining([
      { type: 'a', count: 2 },
      { type: 'b', count: 1 }
    ]));
  });

  test('cleanup should delete old events and report changes', async () => {
    await seed([
      { type: 'old', payload: {}, timestamp: 10 },
      { type: 'new', payload: {}, timestamp: 100 }
    ]);
    const result = await store.cleanup(50);
    expect(result.deleted).toBe(1);
    expect(await store.count()).toBe(1);
  });

  test('replay should return ASC-ordered events with filters', async () => {
    await seed([
      { type: 'a', source: 's1', payload: { i: 1 }, timestamp: 10 },
      { type: 'a', source: 's1', payload: { i: 2 }, timestamp: 20 },
      { type: 'a', source: 's2', payload: { i: 3 }, timestamp: 30 }
    ]);
    const all = await store.replay({ type: 'a' });
    expect(all.map(e => e.payload.i)).toEqual([1, 2, 3]);

    const ranged = await store.replay({ since: 15, until: 25 });
    expect(ranged.map(e => e.payload.i)).toEqual([2]);

    const limited = await store.replay({ limit: 2 });
    expect(limited).toHaveLength(2);
  });
});
