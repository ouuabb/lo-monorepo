const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Workflow = require('../../src/workflow/workflow.cjs');
const WorkflowInstance = require('../../src/workflow/workflowInstance.cjs');
const WorkflowEngine = require('../../src/workflow/workflowEngine.cjs');
const WorkflowRegistry = require('../../src/workflow/workflowRegistry.cjs');
const RuleEngine = require('../../src/workflow/ruleEngine.cjs');
const Database = require('../../src/repo/database.cjs');

function makeTaskWorkflow() {
  return new Workflow({
    id: 'task',
    name: '任务流程',
    description: '任务状态流转',
    version: 1,
    applicableSchemas: [],
    states: [
      { id: 'todo', name: '待办' },
      { id: 'doing', name: '处理中' },
      { id: 'done', name: '完成' }
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

async function seedSchema(db, id, name) {
  const now = Date.now();
  await db.run(
    `INSERT INTO schemas (id, name, version, fields, relations, status, metadata, behaviors, created, updated)
     VALUES (?, ?, 1, '[]', '[]', 'active', '{}', '{}', ?, ?)`,
    [id, name, now, now]
  );
}

async function bindSchema(db, rid, schemaId, schemaVersion = 1) {
  await db.run(
    `INSERT INTO resource_schemas (resource_rid, schema_id, schema_version, attached_at)
     VALUES (?, ?, ?, ?)`,
    [rid, schemaId, schemaVersion, Date.now()]
  );
}

describe('Workflow definition', () => {
  test('should create workflow with id', () => {
    const workflow = makeTaskWorkflow();
    expect(workflow.id).toBe('task');
    expect(workflow.name).toBe('任务流程');
    expect(workflow.status).toBe('active');
  });

  test('should throw error without id', () => {
    expect(() => new Workflow({ name: 'Test' })).toThrow('Workflow must have an id');
  });

  test('should use id as name when name not provided', () => {
    const workflow = new Workflow({
      id: 'wf',
      states: [{ id: 'a' }, { id: 'b' }],
      transitions: [{ from: 'a', to: 'b' }]
    });
    expect(workflow.name).toBe('wf');
  });

  test('should normalize string states', () => {
    const workflow = new Workflow({
      id: 'wf',
      states: ['a', 'b'],
      transitions: [{ from: 'a', to: 'b' }]
    });
    expect(workflow.states[0].id).toBe('a');
    expect(workflow.states[0].name).toBe('a');
  });

  test('should generate transition id from from/to', () => {
    const workflow = new Workflow({
      id: 'wf',
      states: ['a', 'b'],
      transitions: [{ from: 'a', to: 'b' }]
    });
    expect(workflow.transitions[0].id).toBe('a__b');
  });

  test('should validate transitions reference existing states', () => {
    const workflow = new Workflow({
      id: 'wf',
      states: ['a', 'b'],
      transitions: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'missing' }
      ]
    });
    const errors = workflow.validate();
    expect(errors.some((e) => e.includes("to state 'missing'"))).toBe(true);
  });

  test('should validate duplicate transitions', () => {
    const workflow = new Workflow({
      id: 'wf',
      states: ['a', 'b'],
      transitions: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' }
      ]
    });
    const errors = workflow.validate();
    expect(errors.some((e) => e.includes('重复'))).toBe(true);
  });

  test('should validate missing states', () => {
    const workflow = new Workflow({ id: 'wf' });
    const errors = workflow.validate();
    expect(errors.some((e) => e.includes('at least one state'))).toBe(true);
  });

  test('should serialize and restore via JSON', () => {
    const workflow = makeTaskWorkflow();
    const json = workflow.toJSON();
    expect(json.id).toBe('task');
    expect(json.states.length).toBe(3);
    expect(json.transitions.length).toBe(3);

    const restored = Workflow.fromJSON(json);
    expect(restored.id).toBe('task');
    expect(restored.getTransition('todo', 'doing')).not.toBeNull();
  });

  test('should get initial state', () => {
    const workflow = makeTaskWorkflow();
    expect(workflow.initialState).toBe('todo');
  });

  test('should validate transition missing from/to', () => {
    const workflow = new Workflow({
      id: 'wf',
      states: ['a'],
      transitions: [{ id: 'only' }]
    });
    const errors = workflow.validate();
    expect(errors.some((e) => e.includes('必须包含 from/to'))).toBe(true);
  });

  test('should throw when transition lacks both id and from/to', () => {
    expect(() => new Workflow({
      id: 'wf',
      states: ['a', 'b'],
      transitions: [{}]
    })).toThrow('transition 必须包含 from/to');
  });

  test('should validate transition referencing missing from state', () => {
    const workflow = new Workflow({
      id: 'wf',
      states: ['a', 'b'],
      transitions: [{ from: 'nope', to: 'b' }]
    });
    const errors = workflow.validate();
    expect(errors.some((e) => e.includes("from state 'nope'"))).toBe(true);
  });

  test('should reject duplicate from/to transitions', () => {
    const workflow = new Workflow({
      id: 'wf',
      states: ['a', 'b'],
      transitions: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' }
      ]
    });
    expect(workflow.validate().some((e) => e.includes('重复'))).toBe(true);
  });

  test('should reject business events that collide with system event reserved names', () => {
    const workflow = new Workflow({
      id: 'wf',
      states: ['a', 'b'],
      transitions: [
        { from: 'a', to: 'b', events: ['WorkflowInstanceCompleted'] }
      ]
    });
    const errors = workflow.validate();
    expect(errors.some((e) => e.includes('系统事件保留名'))).toBe(true);
  });
});

describe('WorkflowInstance', () => {
  test('should require id', () => {
    expect(() => new WorkflowInstance({ workflowId: 'wf', resourceRid: 'r', currentState: 'todo' }))
      .toThrow('WorkflowInstance must have an id');
  });

  test('should require workflowId', () => {
    expect(() => new WorkflowInstance({ id: 'i1', resourceRid: 'r', currentState: 'todo' }))
      .toThrow('must have a workflowId');
  });

  test('should require resourceRid', () => {
    expect(() => new WorkflowInstance({ id: 'i1', workflowId: 'wf', currentState: 'todo' }))
      .toThrow('must have a resourceRid');
  });

  test('should require currentState', () => {
    expect(() => new WorkflowInstance({ id: 'i1', workflowId: 'wf', resourceRid: 'r' }))
      .toThrow('must have a currentState');
  });

  test('should serialize and restore', () => {
    const inst = new WorkflowInstance({
      id: 'i1', workflowId: 'wf', workflowVersion: 2, resourceRid: 'r1', currentState: 'doing',
      status: 'active', metadata: { note: 'x' }, created: 100, updated: 200
    });
    const json = inst.toJSON();
    expect(json.currentState).toBe('doing');
    expect(json.workflowVersion).toBe(2);
    expect(json.status).toBe('active');
    expect(json.metadata.note).toBe('x');

    const restored = WorkflowInstance.fromJSON(json);
    expect(restored.id).toBe('i1');
    expect(restored.workflowId).toBe('wf');
    expect(restored.workflowVersion).toBe(2);
    expect(restored.status).toBe('active');
    expect(restored.currentState).toBe('doing');
  });

  test('should default status to active and version to 1', () => {
    const inst = new WorkflowInstance({ id: 'i1', workflowId: 'wf', resourceRid: 'r1', currentState: 'todo' });
    expect(inst.status).toBe('active');
    expect(inst.workflowVersion).toBe(1);
  });

  test('isValidStatus validates lifecycle statuses', () => {
    expect(WorkflowInstance.isValidStatus('active')).toBe(true);
    expect(WorkflowInstance.isValidStatus('detached')).toBe(true);
    expect(WorkflowInstance.isValidStatus('completed')).toBe(true);
    expect(WorkflowInstance.isValidStatus('cancelled')).toBe(true);
    expect(WorkflowInstance.isValidStatus('bogus')).toBe(false);
  });
});

describe('WorkflowEngine', () => {
  let tempDir;
  let db;
  let registry;
  let engine;
  let emitted;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-workflow-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.init();
    registry = new WorkflowRegistry(db);
    emitted = [];
    engine = new WorkflowEngine({
      db,
      registry,
      ruleEngine: new RuleEngine({ logger: console }),
      eventBus: {
        emit: async (event) => emitted.push(event)
      },
      logger: console
    });
  });

  afterEach(async () => {
    if (db) await db.close();
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('should register workflow', async () => {
    await registry.create(makeTaskWorkflow());
    expect(registry.get('task')).not.toBeNull();
    expect(engine.listWorkflows().length).toBe(1);
  });

  test('should validate workflow on register', async () => {
    const bad = new Workflow({
      id: 'bad',
      states: ['a'],
      transitions: [{ from: 'a', to: 'nope' }]
    });
    await expect(registry.create(bad)).rejects.toThrow('Workflow validation failed');
  });

  test('should attach resource to workflow', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');
    expect(instance.workflowId).toBe('task');
    expect(instance.resourceRid).toBe('res-1');
    expect(instance.currentState).toBe('todo');

    // 重复 attach 复用实例
    const again = await engine.attach('res-1', 'task');
    expect(again.id).toBe(instance.id);
  });

  test('should attach with custom initial state', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task', { initialState: 'doing' });
    expect(instance.currentState).toBe('doing');
  });

  test('should reject unknown initial state', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    await expect(engine.attach('res-1', 'task', { initialState: 'nope' })).rejects.toThrow();
  });

  test('should reject attach to missing resource', async () => {
    await registry.create(makeTaskWorkflow());
    await expect(engine.attach('res-999', 'task')).rejects.toThrow("Resource 'res-999' 不存在");
  });

  test('should perform legal transition', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');

    const next = await engine.transition({
      resourceRid: 'res-1',
      workflowId: 'task',
      targetState: 'doing',
      actor: 'user-a'
    });
    expect(next.currentState).toBe('doing');

    // 事件
    const evt = emitted.find((e) => e.type === 'WorkflowTransitionCompleted');
    expect(evt).toBeDefined();
    expect(evt.payload.from).toBe('todo');
    expect(evt.payload.to).toBe('doing');
    expect(evt.payload.workflowId).toBe('task');
    expect(evt.payload.resourceRid).toBe('res-1');
    expect(evt.payload.actor).toBe('user-a');
    expect(evt.payload.timestamp).toBeDefined();

    // 日志
    const history = await engine.getHistory({ instanceId: instance.id });
    expect(history.length).toBe(2); // attach(initial) + transition
    expect(history[0].toState).toBe('doing');
    expect(history[0].fromState).toBe('todo');
  });

  test('should reject illegal transition', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    await engine.attach('res-1', 'task');

    await expect(engine.transition({
      resourceRid: 'res-1',
      workflowId: 'task',
      targetState: 'done'
    })).rejects.toThrow('不允许转换');
  });

  test('should reject transition when instance missing', async () => {
    await registry.create(makeTaskWorkflow());
    await expect(engine.transition({
      resourceRid: 'res-999',
      workflowId: 'task',
      targetState: 'doing'
    })).rejects.toThrow('实例不存在');
  });

  test('should reject transition to unknown state', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    await engine.attach('res-1', 'task');
    await expect(engine.transition({
      resourceRid: 'res-1',
      workflowId: 'task',
      targetState: 'nope'
    })).rejects.toThrow('不存在状态');
  });

  test('should evaluate transition rules', async () => {
    const wf = new Workflow({
      id: 'review',
      name: '审查流程',
      applicableSchemas: ['article'],
      states: ['draft', 'review', 'published'],
      transitions: [
        { id: 'submit', from: 'draft', to: 'review' },
        {
          id: 'publish',
          from: 'review',
          to: 'published',
          rules: ['$resource.metadata.approved == true']
        }
      ]
    });
    await registry.create(wf);
    await seedResource(db, 'res-1');
    await engine.attach('res-1', 'review');

    // 先到 review
    await engine.transition({
      resourceRid: 'res-1',
      workflowId: 'review',
      targetState: 'review'
    });

    // 规则不满足
    await expect(engine.transition({
      resourceRid: 'res-1',
      workflowId: 'review',
      targetState: 'published'
    })).rejects.toThrow('未满足规则');

    // 资源 approved 后通过
    await db.run(
      `UPDATE resources SET metadata = ? WHERE rid = 'res-1'`,
      [JSON.stringify({ approved: true })]
    );

    const next = await engine.transition({
      resourceRid: 'res-1',
      workflowId: 'review',
      targetState: 'published'
    });
    expect(next.currentState).toBe('published');
  });

  test('should invoke permission hook', async () => {
    let called = false;
    engine.permissionCheck = async (actor, workflowId, action) => {
      called = true;
      return false;
    };

    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    await engine.attach('res-1', 'task');

    await expect(engine.transition({
      resourceRid: 'res-1',
      workflowId: 'task',
      targetState: 'doing',
      actor: 'user-x'
    })).rejects.toThrow('被权限系统拒绝');
    expect(called).toBe(true);
  });

  test('canTransition should respect permission hook', async () => {
    let called = false;
    engine.permissionCheck = async () => {
      called = true;
      return false;
    };

    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    await engine.attach('res-1', 'task');

    const result = await engine.canTransition({
      resourceRid: 'res-1',
      workflowId: 'task',
      targetState: 'doing',
      actor: 'user-x'
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('权限');
    expect(called).toBe(true);
  });

  test('should be idempotent when target equals current state', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    await engine.attach('res-1', 'task');
    const next = await engine.transition({
      resourceRid: 'res-1',
      workflowId: 'task',
      targetState: 'todo'
    });
    expect(next.currentState).toBe('todo');
  });

  test('canTransition pre-check', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    await engine.attach('res-1', 'task');

    const ok = await engine.canTransition({
      resourceRid: 'res-1',
      workflowId: 'task',
      targetState: 'doing'
    });
    expect(ok.allowed).toBe(true);

    const bad = await engine.canTransition({
      resourceRid: 'res-1',
      workflowId: 'task',
      targetState: 'done'
    });
    expect(bad.allowed).toBe(false);
    expect(bad.reason).toContain('不允许转换');
  });

  test('canTransition handles detached instance, unknown state, idempotent target', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');

    // detached 实例不可转换
    await engine.detach(instance.id);
    const detached = await engine.canTransition({
      instanceId: instance.id, targetState: 'doing'
    });
    expect(detached.allowed).toBe(false);
    expect(detached.reason).toContain('无法转换');

    // 未知状态
    await engine.resume(instance.id);
    const unknown = await engine.canTransition({
      instanceId: instance.id, targetState: 'nope'
    });
    expect(unknown.allowed).toBe(false);
    expect(unknown.reason).toContain('不存在');

    // 目标 == 当前状态：幂等允许
    const idempotent = await engine.canTransition({
      instanceId: instance.id, targetState: 'todo'
    });
    expect(idempotent.allowed).toBe(true);
  });

  test('canTransition evaluates rules and returns transition json', async () => {
    await registry.create(new Workflow({
      id: 'review',
      states: ['draft', 'published'],
      transitions: [
        { id: 'publish', from: 'draft', to: 'published', rules: ['$resource.metadata.approved == true'] }
      ]
    }));
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'review');

    // 规则不满足
    const denied = await engine.canTransition({
      instanceId: instance.id, targetState: 'published'
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('未满足规则');

    // 规则满足
    await db.run(
      `UPDATE resources SET metadata = ? WHERE rid = 'res-1'`,
      [JSON.stringify({ approved: true })]
    );
    const allowed = await engine.canTransition({
      instanceId: instance.id, targetState: 'published'
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.transition.id).toBe('publish');
  });

  test('canTransition returns false on unexpected error', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    await engine.attach('res-1', 'task');
    const originalGet = engine.registry.get.bind(engine.registry);
    engine.registry.get = () => { throw new Error('boom'); };
    const result = await engine.canTransition({
      resourceRid: 'res-1', workflowId: 'task', targetState: 'doing'
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('boom');
    engine.registry.get = originalGet;
  });

  test('emitEvent failure does not crash (logger handles)', async () => {
    engine.eventBus = {
      emit: async () => { throw new Error('event bus down'); }
    };
    await expect(engine.emitEvent('TestEvent', {})).resolves.toBeUndefined();
  });

  test('should detach instance (soft delete, history kept)', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');
    const removed = await engine.detach(instance.id);
    expect(removed).toBe(true);

    // 软删：实例仍存在但标记 detached，历史保留
    const loaded = await engine.getInstance(instance.id);
    expect(loaded).not.toBeNull();
    expect(loaded.status).toBe('detached');
    expect(loaded.workflowVersion).toBe(1);
    const history = await engine.getHistory({ instanceId: instance.id });
    expect(history.length).toBeGreaterThanOrEqual(1);

    // detached 实例不能继续转换
    await expect(engine.transition({
      instanceId: instance.id, targetState: 'doing'
    })).rejects.toThrow('无法转换');
  });

  test('should create a NEW instance when re-attaching after detach (history kept)', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const first = await engine.attach('res-1', 'task');
    await engine.transition({ instanceId: first.id, targetState: 'doing' });
    await engine.detach(first.id);

    // 重新 attach = 新实例，不覆盖第一次
    const second = await engine.attach('res-1', 'task');
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('active');
    expect(second.currentState).toBe('todo');
    expect(second.workflowVersion).toBe(1);

    // 两条历史实例都保留
    const all = await engine.listInstances({ resourceRid: 'res-1' });
    expect(all.length).toBe(2);
    expect(all.some((i) => i.id === first.id && i.status === 'detached')).toBe(true);
    expect(all.some((i) => i.id === second.id && i.status === 'active')).toBe(true);
  });

  test('should resume a detached instance preserving state and history', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');
    await engine.transition({ instanceId: instance.id, targetState: 'doing' });
    await engine.detach(instance.id);
    expect((await engine.getInstance(instance.id)).status).toBe('detached');

    // resume 保留当前状态（doing），不重置为初始状态
    const revived = await engine.resume(instance.id);
    expect(revived.id).toBe(instance.id);
    expect(revived.status).toBe('active');
    expect(revived.currentState).toBe('doing');

    // resume 后可以继续转换（历史不丢失）
    const next = await engine.transition({ instanceId: instance.id, targetState: 'done' });
    expect(next.currentState).toBe('done');

    const evt = emitted.find((e) => e.type === 'WorkflowInstanceResumed');
    expect(evt).toBeDefined();
    expect(evt.payload.instanceId).toBe(instance.id);
  });

  test('resume is idempotent for active instance, rejects completed instance', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');

    // active 实例 resume 幂等返回
    const same = await engine.resume(instance.id);
    expect(same.id).toBe(instance.id);
    expect(same.status).toBe('active');
  });

  test('resume rejects completed instance (already reached terminal state)', async () => {
    await registry.create(new Workflow({
      id: 'reading',
      states: ['unread', 'reading', 'finished'],
      transitions: [
        { id: 'start', from: 'unread', to: 'reading' },
        { id: 'finish', from: 'reading', to: 'finished' }
      ]
    }));
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'reading');
    await engine.transition({ instanceId: instance.id, targetState: 'reading' });
    await engine.transition({ instanceId: instance.id, targetState: 'finished' });
    expect((await engine.getInstance(instance.id)).status).toBe('completed');
    await expect(engine.resume(instance.id)).rejects.toThrow('无法恢复');
  });

  test('should persist definitions across engine instances', async () => {
    await registry.create(makeTaskWorkflow());

    const registry2 = new WorkflowRegistry(db);
    await registry2.load();
    expect(registry2.get('task')).not.toBeNull();
    expect(registry2.get('task').getTransition('todo', 'doing')).not.toBeNull();
  });

  test('store can physically delete an instance (deleteInstance)', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');

    await engine.store.deleteInstance(instance.id);
    expect(await engine.getInstance(instance.id)).toBeNull();
    // 历史日志级联删除
    const history = await engine.getHistory({ instanceId: instance.id });
    expect(history.length).toBe(0);
  });

  test('should return instance as WorkflowInstance model', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');
    const loaded = await engine.getInstance(instance.id);
    expect(loaded).toBeInstanceOf(WorkflowInstance);
    expect(loaded.toJSON().currentState).toBe('todo');
  });

  test('should get workflow definition via engine', async () => {
    await registry.create(makeTaskWorkflow());
    const wf = engine.getWorkflow('task');
    expect(wf.id).toBe('task');
    expect(wf.states.length).toBe(3);
    expect(engine.getWorkflow('nope')).toBeNull();
  });

  test('should list instances with filters', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    await seedResource(db, 'res-2');
    await engine.attach('res-1', 'task');
    await engine.attach('res-2', 'task');

    const byWf = await engine.listInstances({ workflowId: 'task' });
    expect(byWf.length).toBe(2);

    const byRid = await engine.listInstances({ resourceRid: 'res-1' });
    expect(byRid.length).toBe(1);
    expect(byRid[0].resourceRid).toBe('res-1');
  });

  test('should list instances filtered by status', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');
    await engine.detach(instance.id);

    const active = await engine.listInstances({ status: 'active' });
    expect(active.length).toBe(0);
    const detached = await engine.listInstances({ status: 'detached' });
    expect(detached.length).toBe(1);
    expect(detached[0].id).toBe(instance.id);
  });

  test('should query transition history by workflow and resource', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    await engine.attach('res-1', 'task');
    await engine.transition({ resourceRid: 'res-1', workflowId: 'task', targetState: 'doing' });

    const byWf = await engine.getHistory({ workflowId: 'task' });
    expect(byWf.length).toBeGreaterThanOrEqual(2);

    const byRid = await engine.getHistory({ resourceRid: 'res-1' });
    expect(byRid.length).toBeGreaterThanOrEqual(2);
  });

  test('should transition by instanceId', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');
    const next = await engine.transition({
      instanceId: instance.id,
      targetState: 'doing'
    });
    expect(next.currentState).toBe('doing');
  });

  test('should require instanceId or resourceRid+workflowId', async () => {
    await registry.create(makeTaskWorkflow());
    await expect(engine.transition({ targetState: 'doing' })).rejects.toThrow('需要 instanceId 或');
  });

  test('should reject transition on inactive workflow', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    await engine.attach('res-1', 'task');
    await registry.update('task', { status: 'inactive' });
    await expect(engine.transition({
      resourceRid: 'res-1', workflowId: 'task', targetState: 'doing'
    })).rejects.toThrow('未激活');
  });

  test('should reject attach to inactive workflow', async () => {
    await registry.create(makeTaskWorkflow());
    await registry.update('task', { status: 'inactive' });
    await seedResource(db, 'res-1');
    await expect(engine.attach('res-1', 'task')).rejects.toThrow('未激活');
  });

  test('should update workflow definition without losing instances', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');

    const updated = await registry.update('task', { description: '新描述' });
    expect(updated.description).toBe('新描述');

    // 实例仍存在（修复 INSERT OR REPLACE 级联删除 bug）
    expect(await engine.getInstance(instance.id)).not.toBeNull();
    // 持久化后仍可取到
    const registry2 = new WorkflowRegistry(db);
    await registry2.load();
    expect(registry2.get('task').description).toBe('新描述');
  });

  test('should remove workflow definition (soft delete → deprecated)', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');

    await registry.remove('task');

    // 软删：定义保留但标记 deprecated，实例/历史不级联删除
    const wf = registry.get('task');
    expect(wf).not.toBeNull();
    expect(wf.status).toBe('deprecated');
    expect(await registry.store.getDefinition('task')).not.toBeNull();
    expect(await engine.getInstance(instance.id)).not.toBeNull();

    // deprecated 工作流不能再 attach / transition
    await seedResource(db, 'res-2');
    await expect(engine.attach('res-2', 'task')).rejects.toThrow('未激活');
    await expect(engine.transition({
      instanceId: instance.id, targetState: 'doing'
    })).rejects.toThrow('未激活');
  });

  test('should hard remove workflow definition (purge)', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');

    await registry.hardRemove('task');
    expect(registry.get('task')).toBeNull();
    expect(await registry.store.getDefinition('task')).toBeNull();
    // FK 级联删除实例
    expect(await engine.getInstance(instance.id)).toBeNull();
  });

  test('should not register duplicate workflow', async () => {
    await registry.create(makeTaskWorkflow());
    await expect(registry.create(makeTaskWorkflow())).rejects.toThrow('is already registered');
  });

  test('detach should return false for missing instance', async () => {
    expect(await engine.detach('missing')).toBe(false);
  });

  test('service-style API aliases work (createDefinition/createInstance/executeTransition)', async () => {
    const def = await engine.createDefinition(makeTaskWorkflow());
    expect(def.id).toBe('task');
    await seedResource(db, 'res-1');
    const instance = await engine.createInstance('res-1', 'task');
    expect(instance.workflowId).toBe('task');
    const next = await engine.executeTransition({ instanceId: instance.id, targetState: 'doing' });
    expect(next.currentState).toBe('doing');

    // emitEvent 对外事件输出
    engine.emitEvent('BookReadingFinished', { instanceId: instance.id });
    const custom = emitted.find((e) => e.type === 'BookReadingFinished');
    expect(custom).toBeDefined();
    expect(custom.payload.instanceId).toBe(instance.id);
  });
});

describe('Workflow versioning', () => {
  let tempDir;
  let db;
  let registry;
  let engine;
  let emitted;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-wfver-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.init();
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
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('definition defaults to version 1 and records it on instance', async () => {
    const wf = makeTaskWorkflow();
    expect(wf.version).toBe(1);
    await registry.create(wf);
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');
    expect(instance.workflowVersion).toBe(1);

    const loaded = await engine.getInstance(instance.id);
    expect(loaded.workflowVersion).toBe(1);
  });

  test('bumping version keeps old instances on their recorded version', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const old = await engine.attach('res-1', 'task');
    expect(old.workflowVersion).toBe(1);

    // 升版到 v2
    await registry.update('task', { version: 2 });
    expect(registry.get('task').version).toBe(2);

    // 旧实例保留 v1，新实例记录 v2
    expect((await engine.getInstance(old.id)).workflowVersion).toBe(1);
    await seedResource(db, 'res-2');
    const fresh = await engine.attach('res-2', 'task');
    expect(fresh.workflowVersion).toBe(2);
  });

  test('transition emits version in payload', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');
    await engine.transition({ instanceId: instance.id, targetState: 'doing' });

    const evt = emitted.find((e) => e.type === 'WorkflowTransitionCompleted');
    expect(evt).toBeDefined();
    expect(evt.payload.version).toBe(1);
    expect(evt.payload.transitionId).toBe('start');
  });

  test('freezes a definition snapshot per version (history explainable)', async () => {
    await registry.create(makeTaskWorkflow());

    // v1 快照冻结
    const snapV1 = await engine.getWorkflowVersion('task', 1);
    expect(snapV1).not.toBeNull();
    expect(snapV1.version).toBe(1);
    expect(snapV1.transitions).toHaveLength(3);
    expect(snapV1.transitions.some((t) => t.to === 'review')).toBe(false);

    // 升版到 v2（结构变化），生成 v2 快照；v1 保持冻结
    await registry.update('task', {
      version: 2,
      states: ['todo', 'doing', 'review', 'done'],
      transitions: [
        { id: 'start', from: 'todo', to: 'doing' },
        { id: 'to-review', from: 'doing', to: 'review' },
        { id: 'finish', from: 'review', to: 'done' },
        { id: 'reopen', from: 'done', to: 'todo' }
      ]
    });

    const snapV2 = await engine.getWorkflowVersion('task', 2);
    expect(snapV2).not.toBeNull();
    expect(snapV2.transitions.some((t) => t.to === 'review')).toBe(true);

    // v1 快照未被 v2 覆盖（历史实例可用 v1 定义解释）
    const v1Still = await engine.getWorkflowVersion('task', 1);
    expect(v1Still.transitions.some((t) => t.to === 'review')).toBe(false);

    // 版本历史列表
    const versions = await engine.listWorkflowVersions('task');
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
  });

  test('resume records nothing new in version snapshot but keeps instance version', async () => {
    await registry.create(makeTaskWorkflow());
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'task');
    await engine.detach(instance.id);
    const revived = await engine.resume(instance.id);
    expect(revived.workflowVersion).toBe(1);
  });
});

describe('Workflow applicableSchemas', () => {
  let tempDir;
  let db;
  let registry;
  let engine;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-wfscope-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.init();
    registry = new WorkflowRegistry(db);
    engine = new WorkflowEngine({
      db,
      registry,
      ruleEngine: new RuleEngine({ logger: console }),
      logger: console,
      schemaResolver: async (rid) => {
        const row = await db.get('SELECT schema_id FROM resource_schemas WHERE resource_rid = ?', [rid]);
        return row ? [row.schema_id] : [];
      }
    });
  });

  afterEach(async () => {
    if (db) await db.close();
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('workflow is not bound to a schema by default (applicableSchemas empty)', async () => {
    const wf = new Workflow({ id: 'w', states: ['a', 'b'], transitions: [{ from: 'a', to: 'b' }] });
    expect(wf.applicableSchemas).toEqual([]);
    expect(wf.schemaId).toBeUndefined();
  });

  test('empty applicableSchemas = open: resource with NO schema binding can attach', async () => {
    // 空数组 = 不限制 Schema，不需要先建立 Schema 世界
    await registry.create(new Workflow({
      id: 'open-flow',
      states: ['todo', 'done'],
      transitions: [{ from: 'todo', to: 'done' }],
      applicableSchemas: []
    }));

    await seedResource(db, 'res-naked');
    const ok = await engine.attach('res-naked', 'open-flow');
    expect(ok.currentState).toBe('todo');
  });

  test('attach respects applicableSchemas scope', async () => {
    await registry.create(new Workflow({
      id: 'task-flow',
      states: ['todo', 'done'],
      transitions: [{ from: 'todo', to: 'done' }],
      applicableSchemas: ['task']
    }));

    await seedSchema(db, 'task', 'Task');
    await seedSchema(db, 'issue', 'Issue');

    await seedResource(db, 'res-task');
    await bindSchema(db, 'res-task', 'task');
    await seedResource(db, 'res-issue');
    await bindSchema(db, 'res-issue', 'issue');
    await seedResource(db, 'res-naked');

    // 作用域内允许
    const ok = await engine.attach('res-task', 'task-flow');
    expect(ok.currentState).toBe('todo');

    // 作用域外拒绝
    await expect(engine.attach('res-issue', 'task-flow')).rejects.toThrow('仅适用于');

    // 无 schema 绑定的 resource 拒绝
    await expect(engine.attach('res-naked', 'task-flow')).rejects.toThrow('仅适用于');
  });
});

describe('Workflow events and completion', () => {
  let tempDir;
  let db;
  let registry;
  let engine;
  let emitted;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-wfevt-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.init();
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
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('transition emits embedded custom events as external interface', async () => {
    const wf = new Workflow({
      id: 'reading',
      states: ['unread', 'reading', 'finished'],
      transitions: [
        { id: 'start', from: 'unread', to: 'reading' },
        {
          id: 'finish',
          from: 'reading',
          to: 'finished',
          events: ['BookReadingFinished', 'BookShelfUpdated']
        }
      ]
    });
    await registry.create(wf);
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'reading');
    await engine.transition({ instanceId: instance.id, targetState: 'reading' });
    await engine.transition({ instanceId: instance.id, targetState: 'finished' });

    const custom = emitted.filter((e) => e.type === 'BookReadingFinished' || e.type === 'BookShelfUpdated');
    expect(custom).toHaveLength(2);
    for (const evt of custom) {
      expect(evt.payload.workflowId).toBe('reading');
      expect(evt.payload.workflowName).toBe('reading');
      expect(evt.payload.from).toBe('reading');
      expect(evt.payload.to).toBe('finished');
      expect(evt.payload.version).toBe(1);
    }
  });

  test('instance marked completed on reaching a terminal state', async () => {
    const wf = new Workflow({
      id: 'reading',
      states: ['unread', 'reading', 'finished'],
      transitions: [
        { id: 'start', from: 'unread', to: 'reading' },
        { id: 'finish', from: 'reading', to: 'finished' }
      ]
    });
    await registry.create(wf);
    await seedResource(db, 'res-1');
    const instance = await engine.attach('res-1', 'reading');

    await engine.transition({ instanceId: instance.id, targetState: 'reading' });
    let loaded = await engine.getInstance(instance.id);
    expect(loaded.status).toBe('active'); // reading 有出边

    await engine.transition({ instanceId: instance.id, targetState: 'finished' });
    loaded = await engine.getInstance(instance.id);
    expect(loaded.status).toBe('completed'); // finished 无出边 → 终态

    const evt = emitted.find((e) => e.type === 'WorkflowInstanceCompleted');
    expect(evt).toBeDefined();
    expect(evt.payload.to).toBe('finished');

    // completed 实例禁止继续转换
    await expect(engine.transition({ instanceId: instance.id, targetState: 'unread' }))
      .rejects.toThrow('实例状态为');
  });
});
