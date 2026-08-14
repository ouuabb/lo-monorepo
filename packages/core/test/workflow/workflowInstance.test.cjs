const WorkflowInstance = require('../../src/workflow/workflowInstance.cjs');

describe('WorkflowInstance', () => {
  test('constructor requires id', () => {
    expect(() => new WorkflowInstance({
      workflowId: 'wf',
      resourceRid: 'r1',
      currentState: 'todo'
    })).toThrow('WorkflowInstance must have an id');
  });

  test('constructor requires workflowId', () => {
    expect(() => new WorkflowInstance({
      id: 'i1',
      resourceRid: 'r1',
      currentState: 'todo'
    })).toThrow('WorkflowInstance must have a workflowId');
  });

  test('constructor requires resourceRid', () => {
    expect(() => new WorkflowInstance({
      id: 'i1',
      workflowId: 'wf',
      currentState: 'todo'
    })).toThrow('WorkflowInstance must have a resourceRid');
  });

  test('constructor requires currentState', () => {
    expect(() => new WorkflowInstance({
      id: 'i1',
      workflowId: 'wf',
      resourceRid: 'r1'
    })).toThrow('WorkflowInstance must have a currentState');
  });

  test('constructor throws with no options at all', () => {
    expect(() => new WorkflowInstance()).toThrow('WorkflowInstance must have an id');
  });

  test('defaults workflowVersion to 1, status to active, metadata to {}', () => {
    const inst = new WorkflowInstance({
      id: 'i1',
      workflowId: 'wf',
      resourceRid: 'r1',
      currentState: 'todo'
    });
    expect(inst.workflowVersion).toBe(1);
    expect(inst.status).toBe('active');
    expect(inst.metadata).toEqual({});
    expect(inst.created).toBeDefined();
    expect(inst.updated).toBe(inst.created);
  });

  test('preserves supplied values', () => {
    const inst = new WorkflowInstance({
      id: 'i1',
      workflowId: 'wf',
      workflowVersion: 3,
      resourceRid: 'r1',
      currentState: 'doing',
      status: 'detached',
      metadata: { note: 'x' },
      created: 100,
      updated: 200
    });
    expect(inst.id).toBe('i1');
    expect(inst.workflowId).toBe('wf');
    expect(inst.workflowVersion).toBe(3);
    expect(inst.resourceRid).toBe('r1');
    expect(inst.currentState).toBe('doing');
    expect(inst.status).toBe('detached');
    expect(inst.metadata).toEqual({ note: 'x' });
    expect(inst.created).toBe(100);
    expect(inst.updated).toBe(200);
  });

  test('toJSON serializes all fields', () => {
    const inst = new WorkflowInstance({
      id: 'i1',
      workflowId: 'wf',
      workflowVersion: 2,
      resourceRid: 'r1',
      currentState: 'done',
      status: 'completed',
      metadata: { score: 5 },
      created: 10,
      updated: 20
    });
    expect(inst.toJSON()).toEqual({
      id: 'i1',
      workflowId: 'wf',
      workflowVersion: 2,
      resourceRid: 'r1',
      currentState: 'done',
      status: 'completed',
      metadata: { score: 5 },
      created: 10,
      updated: 20
    });
  });

  test('fromJSON restores instance', () => {
    const restored = WorkflowInstance.fromJSON({
      id: 'i1',
      workflowId: 'wf',
      workflowVersion: 4,
      resourceRid: 'r1',
      currentState: 'review',
      status: 'active',
      metadata: { a: 1 },
      created: 5,
      updated: 6
    });
    expect(restored).toBeInstanceOf(WorkflowInstance);
    expect(restored.id).toBe('i1');
    expect(restored.workflowVersion).toBe(4);
    expect(restored.currentState).toBe('review');
    expect(restored.status).toBe('active');
    expect(restored.metadata).toEqual({ a: 1 });
  });

  test('fromJSON round-trips through toJSON', () => {
    const inst = new WorkflowInstance({
      id: 'i1', workflowId: 'wf', resourceRid: 'r1', currentState: 'todo'
    });
    const restored = WorkflowInstance.fromJSON(inst.toJSON());
    expect(restored.toJSON()).toEqual(inst.toJSON());
  });

  test('isValidStatus accepts all lifecycle statuses', () => {
    expect(WorkflowInstance.isValidStatus('active')).toBe(true);
    expect(WorkflowInstance.isValidStatus('detached')).toBe(true);
    expect(WorkflowInstance.isValidStatus('completed')).toBe(true);
    expect(WorkflowInstance.isValidStatus('cancelled')).toBe(true);
  });

  test('isValidStatus rejects unknown statuses', () => {
    expect(WorkflowInstance.isValidStatus('bogus')).toBe(false);
    expect(WorkflowInstance.isValidStatus('')).toBe(false);
    expect(WorkflowInstance.isValidStatus(null)).toBe(false);
    expect(WorkflowInstance.isValidStatus(undefined)).toBe(false);
  });

  test('fromJSON throws when required fields are missing', () => {
    expect(() => WorkflowInstance.fromJSON({ workflowId: 'wf' }))
      .toThrow('WorkflowInstance must have an id');
  });
});
