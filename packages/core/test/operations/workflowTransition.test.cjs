const handler = require('../../src/operations/workflowTransition.cjs');

const BEFORE_INSTANCE = {
  id: 'wf_inst_1',
  workflowId: 'wf_1',
  workflow_id: 'wf_1',
  resourceRid: 'res_1',
  resource_rid: 'res_1',
  currentState: 'qa',
  workflowVersion: 2,
  status: 'running',
  metadata: { repo: 'internal' },
};

describe('workflow.transition handler', () => {
  test('exposes type workflow.transition', () => {
    expect(handler.type).toBe('workflow.transition');
  });

  describe('execute', () => {
    test('saves new instance state and transition log', async () => {
      const saveInstance = jest.fn().mockResolvedValue(true);
      const saveTransitionLog = jest.fn().mockResolvedValue(true);
      const store = { saveInstance, saveTransitionLog };

      const params = {
        instanceId: 'wf_inst_1',
        workflowId: 'wf_1',
        resourceRid: 'res_1',
        targetState: 'done',
        status: 'completed',
        workflowVersion: 2,
        actor: 'u1',
        metadata: { note: 'ok' },
        beforeSnapshot: BEFORE_INSTANCE,
      };

      const result = await handler.execute({ workflowStore: store }, params);

      const saved = saveInstance.mock.calls[0][0];
      expect(saved.id).toBe('wf_inst_1');
      expect(saved.currentState).toBe('done');
      expect(saved.status).toBe('completed');
      expect(saved.metadata.note).toBe('ok');
      expect(saved.metadata.lastTransitionAt).toBeDefined();
      expect(saved.updated).toBeDefined();

      expect(saveTransitionLog).toHaveBeenCalledWith({
        instanceId: 'wf_inst_1',
        workflowId: 'wf_1',
        resourceRid: 'res_1',
        fromState: 'qa',
        toState: 'done',
        actor: 'u1',
        metadata: { note: 'ok' },
      });
      expect(result).toMatchObject({
        id: 'wf_inst_1',
        currentState: 'done',
        beforeState: 'qa',
      });
    });

    test('defaults actor to system and metadata to empty object', async () => {
      const saveInstance = jest.fn().mockResolvedValue(true);
      const saveTransitionLog = jest.fn().mockResolvedValue(true);
      const store = { saveInstance, saveTransitionLog };

      await handler.execute({ workflowStore: store }, {
        instanceId: 'wf_inst_1',
        workflowId: 'wf_1',
        resourceRid: 'res_1',
        targetState: 'qa',
        beforeSnapshot: BEFORE_INSTANCE,
      });

      expect(saveTransitionLog).toHaveBeenCalledWith({
        instanceId: 'wf_inst_1',
        workflowId: 'wf_1',
        resourceRid: 'res_1',
        fromState: 'qa',
        toState: 'qa',
        actor: 'system',
        metadata: {},
      });
    });

    test('merges when snapshot metadata is null', async () => {
      const saveInstance = jest.fn().mockResolvedValue(true);
      const saveTransitionLog = jest.fn().mockResolvedValue(true);
      const store = { saveInstance, saveTransitionLog };

      await handler.execute({ workflowStore: store }, {
        instanceId: 'wf_inst_1',
        workflowId: 'wf_1',
        resourceRid: 'res_1',
        targetState: 'done',
        metadata: { note: 'n' },
        beforeSnapshot: { ...BEFORE_INSTANCE, metadata: null },
      });

      expect(saveInstance.mock.calls[0][0].metadata).toEqual({ note: 'n', lastTransitionAt: expect.any(Number) });
    });

    test('falls back to fetching instance when no beforeSnapshot', async () => {
      const getInstance = jest.fn().mockResolvedValue(BEFORE_INSTANCE);
      const saveInstance = jest.fn().mockResolvedValue(true);
      const store = { getInstance, saveInstance, saveTransitionLog: jest.fn() };

      await handler.execute(
        { workflowStore: store },
        { instanceId: 'wf_inst_1', workflowId: 'wf_1', resourceRid: 'res_1', targetState: 'done' },
      );

      expect(getInstance).toHaveBeenCalledWith('wf_inst_1');
      expect(saveInstance.mock.calls[0][0].currentState).toBe('done');
    });

    test('normalizes instance via toJSON when snapshot carries the method', async () => {
      const saveInstance = jest.fn().mockResolvedValue(true);
      const saveTransitionLog = jest.fn().mockResolvedValue(true);
      const store = { saveInstance, saveTransitionLog };

      const withToJSON = {
        ...BEFORE_INSTANCE,
        toJSON() {
          const { toJSON, ...rest } = this;
          return rest;
        },
      };

      const result = await handler.execute({ workflowStore: store }, {
        instanceId: 'wf_inst_1',
        workflowId: 'wf_1',
        resourceRid: 'res_1',
        targetState: 'done',
        status: 'completed',
        beforeSnapshot: withToJSON,
      });

      expect(result.currentState).toBe('done');
      // toJSON 剥离后不应有 toJSON 键
      expect(saveInstance.mock.calls[0][0].toJSON).toBeUndefined();
    });

    test('throws when store missing', async () => {
      await expect(
        handler.execute({}, { instanceId: 'i', targetState: 'x' }),
      ).rejects.toThrow('需要 ctx.workflowStore');
    });

    test('throws when instance not found', async () => {
      const store = { getInstance: jest.fn().mockResolvedValue(null) };
      await expect(
        handler.execute(
          { workflowStore: store },
          { instanceId: 'i', workflowId: 'w', resourceRid: 'r', targetState: 'x' },
        ),
      ).rejects.toThrow('Workflow 实例不存在');
    });

    test('propagates store errors', async () => {
      const store = {
        saveInstance: jest.fn().mockRejectedValue(new Error('disk full')),
        saveTransitionLog: jest.fn(),
      };
      await expect(
        handler.execute(
          { workflowStore: store },
          { instanceId: 'i', workflowId: 'w', resourceRid: 'r', targetState: 'x', beforeSnapshot: BEFORE_INSTANCE },
        ),
      ).rejects.toThrow('disk full');
    });
  });

  describe('undo', () => {
    test('restores instance from operation.before.beforeSnapshot', async () => {
      const saveInstance = jest.fn().mockResolvedValue(true);
      const store = { saveInstance };

      const result = await handler.undo ({ workflowStore: store }, {
        operation: { before: { beforeSnapshot: BEFORE_INSTANCE } },
        operationResult: { id: 'wf_inst_1', currentState: 'done' },
      });

      expect(saveInstance).toHaveBeenCalledTimes(1);
      const saved = saveInstance.mock.calls[0][0];
      expect(saved.id).toBe('wf_inst_1');
      expect(saved.currentState).toBe('qa');
      expect(saved.workflowId).toBe('wf_1');
      expect(saved.resourceRid).toBe('res_1');
      expect(saved.status).toBe('running');
      expect(saved.updated).toBeDefined();
      expect(result).toEqual({ restored: true, currentState: 'qa' });
    });

    test('falls back to snake_case workflow_id/resource_rid when restoring', async () => {
      const saveInstance = jest.fn().mockResolvedValue(true);
      const store = { saveInstance };

      const snapshot = {
        id: 'inst',
        workflow_id: 'wf_9',
        resource_rid: 'res_9',
        currentState: 'draft',
        workflowVersion: 1,
        status: 'pending',
        metadata: null,
      };

      await handler.undo({ workflowStore: store }, {
        operation: { before: { beforeSnapshot: snapshot } },
        operationResult: { id: 'inst' },
      });

      const saved = saveInstance.mock.calls[0][0];
      expect(saved.workflowId).toBe('wf_9');
      expect(saved.resourceRid).toBe('res_9');
      expect(saved.currentState).toBe('draft');
      expect(saved.metadata).toEqual({});
    });

    test('throws when beforeSnapshot missing', async () => {
      await expect(
        handler.undo({ workflowStore: { saveInstance: jest.fn() } }, {
          operation: { before: {} },
          operationResult: { id: 'i' },
        }),
      ).rejects.toThrow('无法撤销 workflow.transition');
    });

    test('throws when operation metadata missing entirely', async () => {
      await expect(
        handler.undo({ workflowStore: { saveInstance: jest.fn() } }, {
          operationResult: { id: 'i' },
        }),
      ).rejects.toThrow('无法撤销 workflow.transition');
    });

    test('throws when store missing', async () => {
      await expect(handler.undo({}, { operationResult: {} })).rejects.toThrow(
        '需要 ctx.workflowStore',
      );
    });
  });
});