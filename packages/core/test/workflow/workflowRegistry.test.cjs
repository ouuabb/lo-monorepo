const path = require('path');
const Database = require('../../src/repo/database.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const WorkflowRegistry = require('../../src/workflow/workflowRegistry.cjs');
const Workflow = require('../../src/workflow/workflow.cjs');
const testUtils = global.testUtils;

function makeWorkflow(overrides = {}) {
  return new Workflow({
    id: 'task',
    name: '任务流程',
    description: 'desc',
    version: 1,
    applicableSchemas: ['task'],
    states: [
      { id: 'todo' },
      { id: 'doing' },
      { id: 'done' }
    ],
    transitions: [
      { id: 'start', from: 'todo', to: 'doing' },
      { id: 'finish', from: 'doing', to: 'done' }
    ],
    ...overrides
  });
}

describe('WorkflowRegistry', () => {
  let tempDir, db, registry;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    registry = new WorkflowRegistry(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  describe('create/register', () => {
    test('register is an alias for create', async () => {
      const wf = await registry.register(makeWorkflow());
      expect(wf).toBeInstanceOf(Workflow);
      expect(registry.get('task')).not.toBeNull();
    });

    test('create accepts a Workflow instance', async () => {
      const wf = makeWorkflow();
      const created = await registry.create(wf);
      expect(created).toBe(wf);
      expect(created.updatedAt).toBeDefined();
    });

    test('create accepts a plain object definition', async () => {
      const created = await registry.create({
        id: 'objwf',
        states: ['a', 'b'],
        transitions: [{ from: 'a', to: 'b' }]
      });
      expect(created).toBeInstanceOf(Workflow);
      expect(created.id).toBe('objwf');
    });

    test('create rejects duplicate id', async () => {
      await registry.create(makeWorkflow());
      await expect(registry.create(makeWorkflow())).rejects.toThrow("Workflow 'task' is already registered");
    });

    test('create rejects invalid workflow definition', async () => {
      const bad = new Workflow({
        id: 'bad',
        states: ['a'],
        transitions: [{ from: 'a', to: 'missing' }]
      });
      await expect(registry.create(bad)).rejects.toThrow('Workflow validation failed');
    });

    test('create persists definition to store', async () => {
      await registry.create(makeWorkflow());
      const def = await registry.store.getDefinition('task');
      expect(def.id).toBe('task');
      expect(def.states).toHaveLength(3);
    });
  });

  describe('update', () => {
    test('update throws for unknown id', async () => {
      await expect(registry.update('nope')).rejects.toThrow("Workflow 'nope' not found");
    });

    test('update applies partial patch', async () => {
      await registry.create(makeWorkflow());
      const next = await registry.update('task', { description: 'updated desc' });
      expect(next.description).toBe('updated desc');
      expect(next.name).toBe('任务流程');
      expect(next.states).toHaveLength(3);
    });

    test('update applies full structural patch and bumps version', async () => {
      await registry.create(makeWorkflow());
      const next = await registry.update('task', {
        version: 2,
        states: ['todo', 'done'],
        transitions: [{ from: 'todo', to: 'done' }]
      });
      expect(next.version).toBe(2);
      expect(next.states).toHaveLength(2);
      expect(next.transitions).toHaveLength(1);
      const loaded = await registry.store.getDefinition('task');
      expect(loaded.version).toBe(2);
      expect(loaded.states).toHaveLength(2);
    });

    test('update preserves createdAt and refreshes updatedAt', async () => {
      const wf = await registry.create(makeWorkflow());
      const originalCreated = wf.createdAt;
      const next = await registry.update('task', { description: 'x' });
      expect(next.createdAt).toBe(originalCreated);
      expect(next.updatedAt).toBeGreaterThanOrEqual(originalCreated);
    });

    test('update rejects invalid patch', async () => {
      await registry.create(makeWorkflow());
      await expect(registry.update('task', {
        states: ['todo'],
        transitions: [{ from: 'todo', to: 'nope' }]
      })).rejects.toThrow('Workflow validation failed');
    });

    test('update replaces registry entry and persists', async () => {
      await registry.create(makeWorkflow());
      await registry.update('task', { status: 'inactive' });
      expect(registry.get('task').status).toBe('inactive');
      const fresh = new WorkflowRegistry(db);
      await fresh.load();
      expect(fresh.get('task').status).toBe('inactive');
    });
  });

  describe('remove/hardRemove', () => {
    test('remove throws for unknown id', async () => {
      await expect(registry.remove('nope')).rejects.toThrow("Workflow 'nope' not found");
    });

    test('remove marks workflow deprecated and persists status', async () => {
      await registry.create(makeWorkflow());
      await registry.remove('task');
      expect(registry.get('task').status).toBe('deprecated');
      const row = await db.get('SELECT status FROM workflows WHERE id = ?', ['task']);
      expect(row.status).toBe('deprecated');
    });

    test('hardRemove deletes from memory and store', async () => {
      await registry.create(makeWorkflow());
      await registry.hardRemove('task');
      expect(registry.get('task')).toBeNull();
      expect(await registry.store.getDefinition('task')).toBeNull();
    });

    test('hardRemove tolerates id not in memory', async () => {
      await registry.hardRemove('ghost');
      expect(registry.get('ghost')).toBeNull();
    });
  });

  describe('query', () => {
    test('get returns workflow or null', async () => {
      await registry.create(makeWorkflow());
      expect(registry.get('task')).toBeInstanceOf(Workflow);
      expect(registry.get('nope')).toBeNull();
    });

    test('list returns summary objects', async () => {
      await registry.create(makeWorkflow());
      await registry.create({
        id: 'wf2',
        states: ['a', 'b'],
        transitions: [{ from: 'a', to: 'b' }]
      });
      const list = registry.list();
      expect(list).toHaveLength(2);
      const task = list.find((w) => w.id === 'task');
      expect(task).toMatchObject({
        id: 'task',
        name: '任务流程',
        description: 'desc',
        version: 1,
        status: 'active',
        applicableSchemas: ['task'],
        stateCount: 3,
        transitionCount: 2
      });
    });

    test('getVersion delegates to store', async () => {
      await registry.create(makeWorkflow());
      const snap = await registry.getVersion('task', 1);
      expect(snap.id).toBe('task');
      expect(await registry.getVersion('task', 9)).toBeNull();
    });

    test('listVersions delegates to store', async () => {
      await registry.create(makeWorkflow());
      await registry.update('task', { version: 2, description: 'v2' });
      const versions = await registry.listVersions('task');
      expect(versions.map((v) => v.version)).toEqual([1, 2]);
    });
  });

  describe('load', () => {
    test('load returns count of loaded workflows', async () => {
      await registry.create(makeWorkflow());
      await registry.create({
        id: 'wf2',
        states: ['a', 'b'],
        transitions: [{ from: 'a', to: 'b' }]
      });
      const fresh = new WorkflowRegistry(db);
      const count = await fresh.load();
      expect(count).toBe(2);
    });

    test('load restores full definitions via fromJSON', async () => {
      await registry.create(makeWorkflow());
      const fresh = new WorkflowRegistry(db);
      await fresh.load();
      const wf = fresh.get('task');
      expect(wf).toBeInstanceOf(Workflow);
      expect(wf.getTransition('todo', 'doing')).not.toBeNull();
      expect(wf.applicableSchemas).toEqual(['task']);
      expect(wf.states).toHaveLength(3);
    });

    test('load returns 0 for empty store', async () => {
      const fresh = new WorkflowRegistry(db);
      expect(await fresh.load()).toBe(0);
    });

    test('load skips definitions whose full record is missing', async () => {
      await registry.create(makeWorkflow());
      await db.run('DELETE FROM workflows WHERE id = ?', ['task']);
      const fresh = new WorkflowRegistry(db);
      const count = await fresh.load();
      expect(count).toBe(0);
    });
  });
});
