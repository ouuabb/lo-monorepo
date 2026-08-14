const path = require('path');
const Database = require('../../src/repo/database.cjs');
const AutomationStore = require('../../src/automation/AutomationStore.cjs');
const AutomationRegistry = require('../../src/automation/AutomationRegistry.cjs');
const Automation = require('../../src/automation/Automation.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('AutomationStore', () => {
  let tempDir, db, store;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    store = new AutomationStore(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('saves and loads an automation definition', async () => {
    const a = new Automation({
      id: 'demo',
      name: 'Demo',
      source: { type: 'user', id: 'demo' },
      trigger: { type: 'schedule', schedule: { cadence: 'daily', time: '22:00' } },
      condition: { expression: 'resource.type == "note"' },
      actions: [{ id: 's1', type: 'resource.tag', params: { tag: 'x' }, dependsOn: [] }],
      policy: { requireApproval: false, risk: 'low' }
    });
    await store.saveAutomation(a);

    const loaded = await store.getAutomation('demo');
    expect(loaded.id).toBe('demo');
    expect(loaded.trigger.type).toBe('schedule');
    expect(loaded.condition.expression).toContain('note');
    expect(loaded.actions[0].params.tag).toBe('x');
  });

  test('listAutomations returns summaries', async () => {
    await store.saveAutomation(new Automation({ id: 'a', actions: [{ id: 's', type: 'resource.query' }] }));
    await store.saveAutomation(new Automation({ id: 'b', actions: [{ id: 's', type: 'resource.query' }] }));
    const list = await store.listAutomations();
    expect(list.map(x => x.id).sort()).toEqual(['a', 'b']);
  });

  test('updateAutomationStatus and deleteAutomation', async () => {
    await store.saveAutomation(new Automation({ id: 'a', actions: [{ id: 's', type: 'resource.query' }] }));
    await store.updateAutomationStatus('a', 'inactive');
    expect((await store.getAutomation('a')).status).toBe('inactive');
    await store.deleteAutomation('a');
    expect(await store.getAutomation('a')).toBeNull();
  });

  test('saveRun and listRuns persist execution history', async () => {
    await store.saveRun({
      id: 'run1', automation_id: 'a', trigger_source: 'cli',
      execution_context: { automationId: 'a' }, actions_result: [{ type: 'resource.query', ok: true }],
      status: 'completed', started: 1000, finished: 1100, error: ''
    });
    const runs = await store.listRuns({ automationId: 'a' });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('completed');
    expect(runs[0].execution_context.automationId).toBe('a');
  });

  test('listRuns filters by status and limit', async () => {
    for (const i of [1, 2, 3]) {
      await store.saveRun({
        id: `run${i}`, automation_id: 'a', trigger_source: 'cli',
        execution_context: {}, actions_result: [], status: i % 2 ? 'completed' : 'failed',
        started: i, finished: i, error: ''
      });
    }
    const failed = await store.listRuns({ status: 'failed' });
    expect(failed.map(r => r.id)).toEqual(['run2']);
    const limited = await store.listRuns({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  test('getRun and deleteRuns', async () => {
    await store.saveRun({ id: 'r1', automation_id: 'a', trigger_source: 'cli', execution_context: {}, actions_result: [], status: 'running', started: 1, finished: null, error: '' });
    expect((await store.getRun('r1')).id).toBe('r1');
    await store.deleteRuns('a');
    expect(await store.getRun('r1')).toBeNull();
  });
});

describe('AutomationRegistry', () => {
  let tempDir, db, registry;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    registry = new AutomationRegistry(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('create validates and persists', async () => {
    const a = await registry.create({ id: 'demo', name: 'Demo', actions: [{ id: 's', type: 'resource.query' }] });
    expect(a.id).toBe('demo');
    expect(registry.get('demo')).not.toBeNull();
    // reload from store
    const r2 = new AutomationRegistry(db);
    await r2.load();
    expect(r2.get('demo')).not.toBeNull();
  });

  test('create rejects duplicate and invalid defs', async () => {
    await registry.create({ id: 'demo', actions: [{ id: 's', type: 'resource.query' }] });
    await expect(registry.create({ id: 'demo', actions: [{ id: 's', type: 'resource.query' }] })).rejects.toThrow(/already registered/);
    await expect(registry.create({ id: 'bad', actions: [] })).rejects.toThrow(/validation failed/);
  });

  test('enable / disable update status', async () => {
    await registry.create({ id: 'demo', actions: [{ id: 's', type: 'resource.query' }] });
    await registry.disable('demo');
    expect(registry.get('demo').status).toBe('inactive');
    await registry.enable('demo');
    expect(registry.get('demo').status).toBe('active');
  });

  test('update patches fields', async () => {
    await registry.create({ id: 'demo', name: 'Old', actions: [{ id: 's', type: 'resource.query' }] });
    await registry.update('demo', { name: 'New' });
    expect(registry.get('demo').name).toBe('New');
  });

  test('remove deletes def and runs', async () => {
    await registry.create({ id: 'demo', actions: [{ id: 's', type: 'resource.query' }] });
    const store = new AutomationStore(db);
    await store.saveRun({ id: 'r1', automation_id: 'demo', trigger_source: 'cli', execution_context: {}, actions_result: [], status: 'completed', started: 1, finished: 1, error: '' });
    await registry.remove('demo');
    expect(registry.get('demo')).toBeNull();
    expect(await store.getRun('r1')).toBeNull();
  });

  test('list returns actionCount', async () => {
    await registry.create({ id: 'demo', actions: [{ id: 's1', type: 'resource.query' }, { id: 's2', type: 'resource.tag' }] });
    const list = registry.list();
    expect(list[0].actionCount).toBe(2);
    expect(list[0].trigger.type).toBe('external');
  });
});
