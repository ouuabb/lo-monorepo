const path = require('path');
const Database = require('../../src/repo/database.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const WorkflowEngine = require('../../src/workflow/workflowEngine.cjs');
const WorkflowRegistry = require('../../src/workflow/workflowRegistry.cjs');
const Workflow = require('../../src/workflow/workflow.cjs');
const WorkflowInstance = require('../../src/workflow/workflowInstance.cjs');
const RuleEngine = require('../../src/workflow/ruleEngine.cjs');
const testUtils = global.testUtils;

function makeTaskWorkflow() {
  return new Workflow({
    id: 'task',
    name: '任务流程',
    states: [
      { id: 'todo' },
      { id: 'doing' },
      { id: 'done' }
    ],
    transitions: [
      { id: 'start', from: 'todo', to: 'doing' },
      { id: 'finish', from: 'doing', to: 'done' },
      { id: 'reopen', from: 'done', to: 'todo' }
    ]
  });
}

async function seedResource(db, rid, metadata = {}) {
  const now = Date.now();
  await db.run(
    `INSERT INTO resources (rid, name, layer, type, path, metadata, encrypted, created, updated)
     VALUES (?, ?, 0, 'note', '', ?, 0, ?, ?)`,
    [rid, rid, JSON.stringify(metadata), now, now]
  );
}

describe('WorkflowEngine', () => {
  let tempDir, db, registry, engine, emitted;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    registry = new WorkflowRegistry(db);
    emitted = [];
    engine = new WorkflowEngine({
      db,
      registry,
      ruleEngine: new RuleEngine({ logger: console }),
      eventBus: { emit: async (event) => emitted.push(event) },
      logger: console
    });
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  describe('constructor and internals', () => {
    test('constructor defaults eventBus, logger and permission hook', () => {
      const bare = new WorkflowEngine();
      expect(bare.eventBus).toBeNull();
      expect(bare.logger).toBe(console);
      expect(bare.permissionCheck).toBeNull();
      expect(bare.schemaResolver).toBeNull();
      expect(bare.store).toBeDefined();
    });

    test('_resolveInstance resolves by instanceId first', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      const resolved = await engine._resolveInstance({ instanceId: inst.id });
      expect(resolved.id).toBe(inst.id);
    });

    test('_resolveInstance resolves by workflowId + resourceRid pair', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      await engine.attach('res-1', 'task');
      const resolved = await engine._resolveInstance({ workflowId: 'task', resourceRid: 'res-1' });
      expect(resolved.resourceRid).toBe('res-1');
    });

    test('_resolveInstance throws when neither identifier is present', async () => {
      await expect(engine._resolveInstance({})).rejects.toThrow('需要 instanceId 或');
    });

    test('_checkApplicableSchemas passes for empty applicableSchemas', async () => {
      const wf = makeTaskWorkflow();
      await expect(engine._checkApplicableSchemas(wf, 'res-1')).resolves.toBeUndefined();
    });

    test('_checkApplicableSchemas passes when no schemaResolver configured', async () => {
      const wf = makeTaskWorkflow();
      wf.applicableSchemas = ['task'];
      await expect(engine._checkApplicableSchemas(wf, 'res-1')).resolves.toBeUndefined();
    });

    test('_checkApplicableSchemas allows in-scope resource', async () => {
      engine.schemaResolver = jest.fn(async () => ['task', 'issue']);
      const wf = makeTaskWorkflow();
      wf.applicableSchemas = ['task'];
      await expect(engine._checkApplicableSchemas(wf, 'res-1')).resolves.toBeUndefined();
      expect(engine.schemaResolver).toHaveBeenCalledWith('res-1');
    });

    test('_checkApplicableSchemas rejects out-of-scope resource', async () => {
      engine.schemaResolver = jest.fn(async () => ['issue']);
      const wf = makeTaskWorkflow();
      wf.applicableSchemas = ['task'];
      await expect(engine._checkApplicableSchemas(wf, 'res-1')).rejects.toThrow('仅适用于');
    });

    test('_buildContext loads resource and parses metadata', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1', { approved: true });
      const inst = await engine.attach('res-1', 'task');
      const context = await engine._buildContext(registry.get('task'), inst, 'user-a', { extra: 1 });
      expect(context.resource).toMatchObject({ rid: 'res-1', type: 'note' });
      expect(context.resource.metadata).toEqual({ approved: true });
      expect(context.instance).toBeInstanceOf(WorkflowInstance);
      expect(context.workflow.id).toBe('task');
      expect(context.actor).toBe('user-a');
      expect(context.extra).toBe(1);
    });

    test('_buildContext falls back to {rid} when resource missing', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await db.run('DELETE FROM resources WHERE rid = ?', ['res-1']);
      const context = await engine._buildContext(registry.get('task'), inst, 'user');
      expect(context.resource).toEqual({ rid: 'res-1' });
    });

    test('_buildContext returns empty resource when no db', async () => {
      const noDbEngine = new WorkflowEngine({ registry, ruleEngine: new RuleEngine() });
      const inst = new WorkflowInstance({ id: 'i', workflowId: 'w', resourceRid: 'r', currentState: 's' });
      const context = await noDbEngine._buildContext(null, inst, 'user', { z: 9 });
      expect(context.resource).toEqual({});
      expect(context.workflow).toBeNull();
      expect(context.z).toBe(9);
    });
  });

  describe('attach', () => {
    test('throws for unknown workflow', async () => {
      await expect(engine.attach('res-1', 'nope')).rejects.toThrow("Workflow 'nope' not found");
    });

    test('throws for inactive workflow', async () => {
      const wf = makeTaskWorkflow();
      wf.status = 'inactive';
      await registry.create(wf);
      await seedResource(db, 'res-1');
      await expect(engine.attach('res-1', 'task')).rejects.toThrow('未激活');
    });

    test('creates instance, records initial log and emits created event', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task', { actor: 'alice', metadata: { prio: 1 } });
      expect(inst).toBeInstanceOf(WorkflowInstance);
      expect(inst.currentState).toBe('todo');
      expect(inst.workflowVersion).toBe(1);
      expect(inst.metadata).toEqual({ prio: 1 });

      const loaded = await engine.getInstance(inst.id);
      expect(loaded.currentState).toBe('todo');

      const history = await engine.getHistory({ instanceId: inst.id });
      expect(history).toHaveLength(1);
      expect(history[0].fromState).toBeNull();
      expect(history[0].toState).toBe('todo');
      expect(history[0].actor).toBe('alice');

      const evt = emitted.find((e) => e.type === 'WorkflowInstanceCreated');
      expect(evt).toBeDefined();
      expect(evt.payload.workflowId).toBe('task');
      expect(evt.payload.state).toBe('todo');
      expect(evt.payload.actor).toBeUndefined();
    });

    test('reuses existing active instance', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const first = await engine.attach('res-1', 'task');
      const second = await engine.attach('res-1', 'task');
      expect(second.id).toBe(first.id);
    });

    test('throws when resource does not exist', async () => {
      await registry.create(makeTaskWorkflow());
      await expect(engine.attach('missing', 'task')).rejects.toThrow("Resource 'missing' 不存在");
    });

    test('throws when initial state is unknown', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      await expect(engine.attach('res-1', 'task', { initialState: 'nope' })).rejects.toThrow('无初始状态');
    });

    test('supports custom initial state', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task', { initialState: 'doing' });
      expect(inst.currentState).toBe('doing');
    });

    test('enforces applicableSchemas scope when resolver provided', async () => {
      engine.schemaResolver = jest.fn(async () => ['issue']);
      await registry.create(new Workflow({
        id: 'scoped',
        applicableSchemas: ['task'],
        states: ['a', 'b'],
        transitions: [{ from: 'a', to: 'b' }]
      }));
      await seedResource(db, 'res-1');
      await expect(engine.attach('res-1', 'scoped')).rejects.toThrow('仅适用于');
    });
  });

  describe('resume', () => {
    test('throws for missing instance', async () => {
      await expect(engine.resume('nope')).rejects.toThrow("实例 'nope' 不存在");
    });

    test('returns same instance when already active', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      const revived = await engine.resume(inst.id);
      expect(revived.id).toBe(inst.id);
      expect(revived.status).toBe('active');
    });

    test('throws when instance is not detached', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await db.run('UPDATE workflow_instances SET status = ? WHERE id = ?', ['completed', inst.id]);
      await expect(engine.resume(inst.id)).rejects.toThrow('无法恢复');
    });

    test('revives detached instance preserving state and emits event', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await engine.detach(inst.id);
      const revived = await engine.resume(inst.id, { actor: 'bob' });
      expect(revived.id).toBe(inst.id);
      expect(revived.status).toBe('active');
      expect(revived.currentState).toBe('todo');
      const evt = emitted.find((e) => e.type === 'WorkflowInstanceResumed');
      expect(evt).toBeDefined();
      expect(evt.payload.actor).toBe('bob');
    });
  });

  describe('detach', () => {
    test('returns false for missing instance', async () => {
      expect(await engine.detach('nope')).toBe(false);
    });

    test('soft deletes instance and emits event', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      const result = await engine.detach(inst.id);
      expect(result).toBe(true);
      expect((await engine.getInstance(inst.id)).status).toBe('detached');
      const evt = emitted.find((e) => e.type === 'WorkflowInstanceDetached');
      expect(evt).toBeDefined();
      expect(evt.payload.instanceId).toBe(inst.id);
    });
  });

  describe('transition', () => {
    test('throws when targetState missing', async () => {
      await expect(engine.transition({ instanceId: 'x' })).rejects.toThrow('需要 targetState');
    });

    test('throws when instance cannot be resolved', async () => {
      await expect(engine.transition({
        workflowId: 'task', resourceRid: 'res-1', targetState: 'doing'
      })).rejects.toThrow('实例不存在');
    });

    test('throws when instance is not active', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await engine.detach(inst.id);
      await expect(engine.transition({ instanceId: inst.id, targetState: 'doing' }))
        .rejects.toThrow('实例状态为');
    });

    test('throws when workflow is missing from registry', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      registry._workflows.delete('task');
      await expect(engine.transition({ instanceId: inst.id, targetState: 'doing' }))
        .rejects.toThrow("Workflow 'task' not found");
    });

    test('throws when workflow is not active', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await registry.update('task', { status: 'inactive' });
      await expect(engine.transition({ instanceId: inst.id, targetState: 'doing' }))
        .rejects.toThrow('未激活');
    });

    test('throws for unknown target state', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await expect(engine.transition({ instanceId: inst.id, targetState: 'nope' }))
        .rejects.toThrow('不存在状态');
    });

    test('is idempotent when target equals current state', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      const next = await engine.transition({ instanceId: inst.id, targetState: 'todo' });
      expect(next.id).toBe(inst.id);
      expect(next.currentState).toBe('todo');
    });

    test('throws for illegal transition', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await expect(engine.transition({ instanceId: inst.id, targetState: 'done' }))
        .rejects.toThrow('不允许转换');
    });

    test('rejects when transition rules not satisfied', async () => {
      await registry.create(new Workflow({
        id: 'review',
        states: ['draft', 'published'],
        transitions: [
          { id: 'publish', from: 'draft', to: 'published', rules: ['$resource.metadata.approved == true'] }
        ]
      }));
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'review');
      await expect(engine.transition({ instanceId: inst.id, targetState: 'published' }))
        .rejects.toThrow('未满足规则');
    });

    test('performs transition, merges metadata and emits completed event', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      const next = await engine.transition({
        instanceId: inst.id,
        targetState: 'doing',
        actor: 'carol',
        metadata: { reason: 'approved' }
      });
      expect(next.currentState).toBe('doing');
      expect(next.status).toBe('active');
      expect(next.workflowVersion).toBe(1);
      expect(next.metadata).toMatchObject({ reason: 'approved' });
      expect(next.metadata.lastTransitionAt).toBeDefined();

      const evt = emitted.find((e) => e.type === 'WorkflowTransitionCompleted');
      expect(evt).toBeDefined();
      expect(evt.payload).toMatchObject({
        from: 'todo',
        to: 'doing',
        actor: 'carol',
        transitionId: 'start',
        workflowId: 'task'
      });
    });

    test('denies transition via permissionCheck', async () => {
      engine.permissionCheck = jest.fn(async () => false);
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await expect(engine.transition({ instanceId: inst.id, targetState: 'doing', actor: 'denied' }))
        .rejects.toThrow('被权限系统拒绝');
      expect(engine.permissionCheck).toHaveBeenCalledWith('denied', 'task', 'workflow:transition:task');
    });

    test('allows transition when permissionCheck returns true', async () => {
      engine.permissionCheck = jest.fn(async () => true);
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      const next = await engine.transition({ instanceId: inst.id, targetState: 'doing' });
      expect(next.currentState).toBe('doing');
    });

    test('marks instance completed on terminal state and emits completion event', async () => {
      await registry.create(new Workflow({
        id: 'reading',
        states: ['unread', 'reading', 'finished'],
        transitions: [
          { id: 'start', from: 'unread', to: 'reading' },
          { id: 'finish', from: 'reading', to: 'finished' }
        ]
      }));
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'reading');
      await engine.transition({ instanceId: inst.id, targetState: 'reading' });
      const next = await engine.transition({ instanceId: inst.id, targetState: 'finished' });
      expect(next.status).toBe('completed');
      const evt = emitted.find((e) => e.type === 'WorkflowInstanceCompleted');
      expect(evt).toBeDefined();
      expect(evt.payload.to).toBe('finished');
    });

    test('keeps status active when target state has outgoing transitions', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await engine.transition({ instanceId: inst.id, targetState: 'doing' });
      const done = await engine.transition({ instanceId: inst.id, targetState: 'done' });
      expect(done.status).toBe('active');
    });

    test('emits embedded custom events on transition', async () => {
      await registry.create(new Workflow({
        id: 'flow',
        states: ['a', 'b'],
        transitions: [
          { id: 'go', from: 'a', to: 'b', events: ['CustomDone'] }
        ]
      }));
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'flow');
      await engine.transition({ instanceId: inst.id, targetState: 'b' });
      const custom = emitted.find((e) => e.type === 'CustomDone');
      expect(custom).toBeDefined();
      expect(custom.payload.workflowName).toBe('flow');
    });
  });

  describe('canTransition', () => {
    test('returns false with reason when instance missing', async () => {
      const result = await engine.canTransition({ workflowId: 'task', resourceRid: 'res-1', targetState: 'doing' });
      expect(result).toEqual({ allowed: false, reason: '实例不存在' });
    });

    test('returns false when workflow missing', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      registry._workflows.delete('task');
      const result = await engine.canTransition({ instanceId: inst.id, targetState: 'doing' });
      expect(result).toMatchObject({ allowed: false, reason: "Workflow 'task' not found" });
    });

    test('returns false when workflow inactive', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await registry.update('task', { status: 'inactive' });
      const result = await engine.canTransition({ instanceId: inst.id, targetState: 'doing' });
      expect(result).toMatchObject({ allowed: false, reason: 'Workflow 未激活' });
    });

    test('returns false when instance not active', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await engine.detach(inst.id);
      const result = await engine.canTransition({ instanceId: inst.id, targetState: 'doing' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('实例状态为');
    });

    test('returns false for unknown target state', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      const result = await engine.canTransition({ instanceId: inst.id, targetState: 'nope' });
      expect(result).toMatchObject({ allowed: false, reason: "状态 'nope' 不存在" });
    });

    test('returns allowed with null transition for idempotent target', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      const result = await engine.canTransition({ instanceId: inst.id, targetState: 'todo' });
      expect(result).toEqual({ allowed: true, transition: null });
    });

    test('returns false for illegal transition', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      const result = await engine.canTransition({ instanceId: inst.id, targetState: 'done' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('不允许转换');
    });

    test('returns false when rules not satisfied', async () => {
      await registry.create(new Workflow({
        id: 'review',
        states: ['draft', 'published'],
        transitions: [
          { id: 'publish', from: 'draft', to: 'published', rules: ['approved == true'] }
        ]
      }));
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'review');
      const result = await engine.canTransition({ instanceId: inst.id, targetState: 'published' });
      expect(result).toMatchObject({ allowed: false, reason: '未满足规则条件' });
    });

    test('returns false when permission hook denies', async () => {
      engine.permissionCheck = jest.fn(async () => false);
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      const result = await engine.canTransition({ instanceId: inst.id, targetState: 'doing' });
      expect(result).toMatchObject({ allowed: false, reason: '转换被权限系统拒绝' });
    });

    test('returns allowed with transition json on success', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      const result = await engine.canTransition({ instanceId: inst.id, targetState: 'doing' });
      expect(result.allowed).toBe(true);
      expect(result.transition).toMatchObject({ id: 'start', from: 'todo', to: 'doing' });
    });

    test('catches unexpected errors and reports reason', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      engine.registry.get = () => { throw new Error('boom'); };
      const result = await engine.canTransition({ instanceId: inst.id, targetState: 'doing' });
      expect(result).toEqual({ allowed: false, reason: 'boom' });
    });
  });

  describe('queries', () => {
    test('getWorkflow returns json or null', async () => {
      await registry.create(makeTaskWorkflow());
      expect(engine.getWorkflow('task').id).toBe('task');
      expect(engine.getWorkflow('nope')).toBeNull();
    });

    test('listWorkflows delegates to registry list', async () => {
      await registry.create(makeTaskWorkflow());
      const list = engine.listWorkflows();
      expect(list).toHaveLength(1);
      expect(list[0].stateCount).toBe(3);
    });

    test('getInstance returns model or null', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      expect((await engine.getInstance(inst.id)).currentState).toBe('todo');
      expect(await engine.getInstance('nope')).toBeNull();
    });

    test('listInstances applies filters', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      await engine.attach('res-1', 'task');
      expect(await engine.listInstances({ workflowId: 'task' })).toHaveLength(1);
      expect(await engine.listInstances({ resourceRid: 'res-1' })).toHaveLength(1);
      expect(await engine.listInstances({ status: 'active' })).toHaveLength(1);
    });

    test('getHistory passes limit to store', async () => {
      await registry.create(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.attach('res-1', 'task');
      await engine.transition({ instanceId: inst.id, targetState: 'doing' });
      await engine.transition({ instanceId: inst.id, targetState: 'done' });
      const history = await engine.getHistory({ instanceId: inst.id }, 2);
      expect(history).toHaveLength(2);
      expect(history[0].toState).toBe('done');
    });

    test('getWorkflowVersion and listWorkflowVersions delegate to store', async () => {
      await registry.create(makeTaskWorkflow());
      const snap = await engine.getWorkflowVersion('task', 1);
      expect(snap.id).toBe('task');
      await registry.update('task', { version: 2, description: 'v2' });
      const versions = await engine.listWorkflowVersions('task');
      expect(versions.map((v) => v.version)).toEqual([1, 2]);
    });
  });

  describe('service-style aliases and events', () => {
    test('createDefinition accepts plain object', async () => {
      const def = await engine.createDefinition({
        id: 'plain',
        states: ['a', 'b'],
        transitions: [{ from: 'a', to: 'b' }]
      });
      expect(def.id).toBe('plain');
      expect(def.states).toHaveLength(2);
    });

    test('createDefinition accepts a Workflow instance', async () => {
      const def = await engine.createDefinition(makeTaskWorkflow());
      expect(def.id).toBe('task');
    });

    test('createInstance and executeTransition alias attach and transition', async () => {
      await engine.createDefinition(makeTaskWorkflow());
      await seedResource(db, 'res-1');
      const inst = await engine.createInstance('res-1', 'task');
      expect(inst.currentState).toBe('todo');
      const next = await engine.executeTransition({ instanceId: inst.id, targetState: 'doing' });
      expect(next.currentState).toBe('doing');
    });

    test('emitEvent with no eventBus is a no-op', async () => {
      const noBus = new WorkflowEngine({ registry, ruleEngine: new RuleEngine() });
      await expect(noBus.emitEvent('X', {})).resolves.toBeUndefined();
    });

    test('emitEvent forwards to eventBus', async () => {
      const emit = jest.fn(async () => {});
      engine.eventBus = { emit };
      await engine.emitEvent('MyEvent', { a: 1 });
      expect(emit).toHaveBeenCalledWith({ type: 'MyEvent', payload: { a: 1 } });
    });

    test('_emitEvent logs and swallows eventBus errors', async () => {
      const error = jest.fn();
      engine.logger = { error };
      engine.eventBus = { emit: jest.fn(async () => { throw new Error('bus down'); }) };
      await expect(engine.emitEvent('Bad', {})).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('bus down'));
    });
  });
});
