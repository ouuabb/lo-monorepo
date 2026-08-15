const path = require('path');
const Database = require('../../src/repo/database.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const WorkflowStore = require('../../src/workflow/workflowStore.cjs');
const Workflow = require('../../src/workflow/workflow.cjs');
const WorkflowInstance = require('../../src/workflow/workflowInstance.cjs');
const testUtils = global.testUtils;

function makeWorkflow(overrides = {}) {
  return new Workflow({
    id: 'task',
    name: '任务流程',
    description: 'desc',
    version: 1,
    applicableSchemas: ['task'],
    states: [
      { id: 'todo', name: '待办' },
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

async function seedResource(db, rid, metadata = {}) {
  const now = Date.now();
  await db.run(
    `INSERT INTO resources (rid, name, layer, type, location_kind, location, metadata, encrypted, created, updated)
     VALUES (?, ?, 0, 'note', 'local', '', ?, 0, ?, ?)`,
    [rid, rid, JSON.stringify(metadata), now, now]
  );
}

function makeInstance(overrides = {}) {
  return new WorkflowInstance({
    id: 'inst-1',
    workflowId: 'task',
    workflowVersion: 1,
    resourceRid: 'res-1',
    currentState: 'todo',
    status: 'active',
    metadata: { note: 'x' },
    created: 1000,
    updated: 1000,
    ...overrides
  });
}

describe('WorkflowStore', () => {
  let tempDir, db, store;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    store = new WorkflowStore(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  describe('definition persistence', () => {
    test('saveDefinition inserts workflow and version snapshot', async () => {
      const wf = makeWorkflow();
      await store.saveDefinition(wf);

      const row = await db.get('SELECT * FROM workflows WHERE id = ?', ['task']);
      expect(row).not.toBeNull();
      expect(row.name).toBe('任务流程');
      expect(row.version).toBe(1);
      expect(row.status).toBe('active');
      expect(JSON.parse(row.applicable_schemas)).toEqual(['task']);
      expect(JSON.parse(row.definition).states).toHaveLength(3);

      const snap = await db.get(
        'SELECT * FROM workflow_definition_versions WHERE workflow_id = ? AND version = ?',
        ['task', 1]
      );
      expect(snap).not.toBeNull();
      expect(JSON.parse(snap.definition).id).toBe('task');
    });

    test('saveDefinition upserts definition and refreshes same-version snapshot', async () => {
      await store.saveDefinition(makeWorkflow());
      const bumped = makeWorkflow({ description: 'new desc' });
      await store.saveDefinition(bumped);

      const row = await db.get('SELECT * FROM workflows WHERE id = ?', ['task']);
      expect(row.description).toBe('new desc');
      expect(JSON.parse(row.definition).description).toBe('new desc');

      const rows = await db.all('SELECT * FROM workflow_definition_versions WHERE workflow_id = ?', ['task']);
      expect(rows).toHaveLength(1);
    });

    test('getDefinition returns parsed definition or null', async () => {
      await store.saveDefinition(makeWorkflow());
      const def = await store.getDefinition('task');
      expect(def.id).toBe('task');
      expect(def.transitions).toHaveLength(2);
      expect(await store.getDefinition('nope')).toBeNull();
    });

    test('getDefinitionVersion returns snapshot or null', async () => {
      await store.saveDefinition(makeWorkflow());
      const snap = await store.getDefinitionVersion('task', 1);
      expect(snap.id).toBe('task');
      expect(snap.version).toBe(1);
      expect(await store.getDefinitionVersion('task', 99)).toBeNull();
      expect(await store.getDefinitionVersion('nope', 1)).toBeNull();
    });

    test('listDefinitionVersions lists ascending versions', async () => {
      await store.saveDefinition(makeWorkflow());
      await store.saveDefinition(makeWorkflow({ version: 2, description: 'v2' }));
      await store.saveDefinition(makeWorkflow({ version: 3, description: 'v3' }));

      const versions = await store.listDefinitionVersions('task');
      expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
      expect(versions[0].createdAt).toBeDefined();
      expect(await store.listDefinitionVersions('nope')).toEqual([]);
    });

    test('listDefinitions returns summary rows sorted by created_at desc', async () => {
      await store.saveDefinition(makeWorkflow({ id: 'a', version: 2 }));
      const defs = await store.listDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0]).toMatchObject({
        id: 'a',
        name: '任务流程',
        version: 2,
        status: 'active'
      });
      expect(defs[0].createdAt).toBeDefined();
      expect(defs[0].updatedAt).toBeDefined();
    });

    test('updateDefinitionStatus updates status and updated_at', async () => {
      await store.saveDefinition(makeWorkflow());
      const before = await db.get('SELECT updated_at FROM workflows WHERE id = ?', ['task']);
      await store.updateDefinitionStatus('task', 'deprecated');
      const after = await db.get('SELECT status, updated_at FROM workflows WHERE id = ?', ['task']);
      expect(after.status).toBe('deprecated');
      expect(after.updated_at).toBeGreaterThanOrEqual(before.updated_at);
    });

    test('deleteDefinition removes workflow and cascades snapshots', async () => {
      await store.saveDefinition(makeWorkflow());
      await store.deleteDefinition('task');
      expect(await store.getDefinition('task')).toBeNull();
      const snaps = await db.all('SELECT * FROM workflow_definition_versions WHERE workflow_id = ?', ['task']);
      expect(snaps).toHaveLength(0);
    });
  });

  describe('instance persistence', () => {
    test('saveInstance inserts a new instance row', async () => {
      await store.saveDefinition(makeWorkflow());
      await seedResource(db, 'res-1');
      const inst = makeInstance();
      await store.saveInstance(inst);

      const row = await db.get('SELECT * FROM workflow_instances WHERE id = ?', ['inst-1']);
      expect(row.workflow_id).toBe('task');
      expect(row.resource_rid).toBe('res-1');
      expect(row.current_state).toBe('todo');
      expect(row.status).toBe('active');
      expect(JSON.parse(row.metadata)).toEqual({ note: 'x' });
    });

    test('saveInstance updates an existing instance', async () => {
      await store.saveDefinition(makeWorkflow());
      await seedResource(db, 'res-1');
      await store.saveInstance(makeInstance());

      await store.saveInstance(makeInstance({
        currentState: 'doing',
        status: 'active',
        metadata: { note: 'y', extra: 1 },
        updated: 2000
      }));

      const row = await db.get('SELECT * FROM workflow_instances WHERE id = ?', ['inst-1']);
      expect(row.current_state).toBe('doing');
      expect(JSON.parse(row.metadata)).toEqual({ note: 'y', extra: 1 });
      expect(row.updated).toBe(2000);
      const all = await db.all('SELECT * FROM workflow_instances WHERE id = ?', ['inst-1']);
      expect(all).toHaveLength(1);
    });

    test('getInstance returns WorkflowInstance model or null', async () => {
      await store.saveDefinition(makeWorkflow());
      await seedResource(db, 'res-1');
      await store.saveInstance(makeInstance());
      const got = await store.getInstance('inst-1');
      expect(got).toBeInstanceOf(WorkflowInstance);
      expect(got.currentState).toBe('todo');
      expect(got.metadata).toEqual({ note: 'x' });
      expect(await store.getInstance('missing')).toBeNull();
    });

    test('getActiveInstanceByPair returns only active instance', async () => {
      await store.saveDefinition(makeWorkflow());
      await seedResource(db, 'res-1');
      await store.saveInstance(makeInstance());
      await store.saveInstance(makeInstance({
        id: 'inst-2', currentState: 'doing', status: 'detached', created: 2000, updated: 2000
      }));

      const active = await store.getActiveInstanceByPair('task', 'res-1');
      expect(active.id).toBe('inst-1');
      await store.softDeleteInstance('inst-1');
      expect(await store.getActiveInstanceByPair('task', 'res-1')).toBeNull();
    });

    test('getInstanceByPair prefers active, falls back to latest', async () => {
      await store.saveDefinition(makeWorkflow());
      await seedResource(db, 'res-1');
      await store.saveInstance(makeInstance());
      await store.saveInstance(makeInstance({
        id: 'inst-2', currentState: 'doing', status: 'detached', created: 2000, updated: 2000
      }));

      const preferred = await store.getInstanceByPair('task', 'res-1');
      expect(preferred.id).toBe('inst-1');

      await store.softDeleteInstance('inst-1');
      const fallback = await store.getInstanceByPair('task', 'res-1');
      expect(fallback.id).toBe('inst-2');

      expect(await store.getInstanceByPair('task', 'nope')).toBeNull();
    });

    test('listInstances filters by workflowId, resourceRid and status', async () => {
      await store.saveDefinition(makeWorkflow());
      await seedResource(db, 'res-1');
      await seedResource(db, 'res-2');
      await store.saveInstance(makeInstance());
      await store.saveInstance(makeInstance({
        id: 'inst-2', resourceRid: 'res-2', currentState: 'doing', created: 2000, updated: 2000
      }));

      expect(await store.listInstances({ workflowId: 'task' })).toHaveLength(2);
      const byRes = await store.listInstances({ resourceRid: 'res-2' });
      expect(byRes).toHaveLength(1);
      expect(byRes[0].resourceRid).toBe('res-2');

      await store.softDeleteInstance('inst-2');
      const byStatus = await store.listInstances({ status: 'detached' });
      expect(byStatus).toHaveLength(1);
      expect(byStatus[0].id).toBe('inst-2');

      expect(await store.listInstances({ workflowId: 'zzz' })).toEqual([]);
    });

    test('listInstances with empty filter returns all ordered by created desc', async () => {
      await store.saveDefinition(makeWorkflow());
      await seedResource(db, 'res-1');
      await seedResource(db, 'res-2');
      await store.saveInstance(makeInstance({ created: 1000, updated: 1000 }));
      await store.saveInstance(makeInstance({
        id: 'inst-2', resourceRid: 'res-2', created: 2000, updated: 2000
      }));
      const all = await store.listInstances();
      expect(all.map((i) => i.id)).toEqual(['inst-2', 'inst-1']);
    });

    test('softDeleteInstance marks detached and keeps row', async () => {
      await store.saveDefinition(makeWorkflow());
      await seedResource(db, 'res-1');
      await store.saveInstance(makeInstance());
      await store.softDeleteInstance('inst-1');
      const got = await store.getInstance('inst-1');
      expect(got).not.toBeNull();
      expect(got.status).toBe('detached');
    });

    test('deleteInstance removes instance and cascades transition log', async () => {
      await store.saveDefinition(makeWorkflow());
      await seedResource(db, 'res-1');
      await store.saveInstance(makeInstance());
      await store.saveTransitionLog({
        instanceId: 'inst-1', workflowId: 'task', resourceRid: 'res-1',
        fromState: 'todo', toState: 'doing'
      });
      await store.deleteInstance('inst-1');
      expect(await store.getInstance('inst-1')).toBeNull();
      const logs = await db.all('SELECT * FROM workflow_transition_log WHERE instance_id = ?', ['inst-1']);
      expect(logs).toHaveLength(0);
    });

    test('_parseInstance returns null for no row', () => {
      expect(store._parseInstance(null)).toBeNull();
      expect(store._parseInstance(undefined)).toBeNull();
    });
  });

  describe('transition log', () => {
    beforeEach(async () => {
      await store.saveDefinition(makeWorkflow());
      await seedResource(db, 'res-1');
      await store.saveInstance(makeInstance());
    });

    test('saveTransitionLog inserts with defaults for actor, fromState, metadata', async () => {
      await store.saveTransitionLog({
        instanceId: 'inst-1', workflowId: 'task', resourceRid: 'res-1', toState: 'doing'
      });
      const row = await db.get(
        'SELECT * FROM workflow_transition_log WHERE instance_id = ? AND to_state = ?',
        ['inst-1', 'doing']
      );
      expect(row.actor).toBe('system');
      expect(row.from_state).toBeNull();
      expect(JSON.parse(row.metadata)).toEqual({});
    });

    test('saveTransitionLog stores explicit actor, fromState and metadata', async () => {
      await store.saveTransitionLog({
        instanceId: 'inst-1', workflowId: 'task', resourceRid: 'res-1',
        fromState: 'todo', toState: 'doing', actor: 'user-a', metadata: { reason: 'ok' }
      });
      const row = await db.get(
        'SELECT * FROM workflow_transition_log WHERE instance_id = ? AND to_state = ?',
        ['inst-1', 'doing']
      );
      expect(row.from_state).toBe('todo');
      expect(row.actor).toBe('user-a');
      expect(JSON.parse(row.metadata)).toEqual({ reason: 'ok' });
    });

    test('listTransitionLog filters by instanceId, workflowId, resourceRid', async () => {
      const nowSpy = jest.spyOn(Date, 'now');
      let tick = 1000;
      nowSpy.mockImplementation(() => (tick += 1));
      await store.saveTransitionLog({
        instanceId: 'inst-1', workflowId: 'task', resourceRid: 'res-1', toState: 'doing'
      });
      await store.saveTransitionLog({
        instanceId: 'inst-1', workflowId: 'task', resourceRid: 'res-1', toState: 'done'
      });
      const byInst = await store.listTransitionLog({ instanceId: 'inst-1' });
      expect(byInst).toHaveLength(2);
      expect(byInst[0].toState).toBe('done');
      expect(byInst[0].metadata).toEqual({});

      const byWf = await store.listTransitionLog({ workflowId: 'task' });
      expect(byWf).toHaveLength(2);

      const byRes = await store.listTransitionLog({ resourceRid: 'res-1' });
      expect(byRes).toHaveLength(2);

      const none = await store.listTransitionLog({ resourceRid: 'zzz' });
      expect(none).toEqual([]);
      nowSpy.mockRestore();
    });

    test('listTransitionLog applies limit', async () => {
      const nowSpy = jest.spyOn(Date, 'now');
      let tick = 1000;
      nowSpy.mockImplementation(() => (tick += 1));
      for (let i = 0; i < 5; i += 1) {
        await store.saveTransitionLog({
          instanceId: 'inst-1', workflowId: 'task', resourceRid: 'res-1',
          fromState: 'a', toState: `s${i}`
        });
      }
      const limited = await store.listTransitionLog({ instanceId: 'inst-1', limit: 2 });
      expect(limited).toHaveLength(2);
      expect(limited[0].toState).toBe('s4');
      nowSpy.mockRestore();
    });

    test('listTransitionLog maps metadata from parsed string', async () => {
      await store.saveTransitionLog({
        instanceId: 'inst-1', workflowId: 'task', resourceRid: 'res-1',
        fromState: 'todo', toState: 'doing', metadata: { k: [1, 2] }
      });
      const logs = await store.listTransitionLog({ instanceId: 'inst-1' });
      expect(logs[0].metadata).toEqual({ k: [1, 2] });
      expect(logs[0].id).toBeDefined();
    });
  });
});
