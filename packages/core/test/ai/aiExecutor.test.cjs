const AIExecutor = require('../../src/ai/aiExecutor.cjs');

describe('AIExecutor', () => {
  describe('execute', () => {
    test('should execute each step and return summary', async () => {
      const executor = new AIExecutor();
      const plan = [
        { action: 'notify_user', target: 'a' },
        { action: 'unknown_thing' }
      ];
      const result = await executor.execute(plan, {});
      expect(result.success).toBe(true);
      expect(result.total).toBe(2);
      expect(result.results[0].status).toBe('sent');
      expect(result.results[1].status).toBe('skipped');
    });

    test('should treat a string step as its action', async () => {
      const executor = new AIExecutor();
      const result = await executor.execute(['notify_user'], {});
      expect(result.total).toBe(1);
      expect(result.results[0].status).toBe('sent');
    });
  });

  describe('executeStep', () => {
    test('unknown action should be skipped', async () => {
      const executor = new AIExecutor();
      const result = await executor.executeStep('bogus', {});
      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('Unknown: bogus');
    });

    test('string action resolves base action', async () => {
      const executor = new AIExecutor();
      expect((await executor.executeStep('create_resource', {})).reason).toContain('no repository');
    });
  });

  describe('create_resource', () => {
    test('should create a resource via repository', async () => {
      const repository = { createResource: jest.fn().mockResolvedValue({ rid: 'r1' }) };
      const executor = new AIExecutor({ repository });
const result = await executor.executeStep({ action: 'create_resource', payload: { type: 'note', content: 'hi', name: 'T' } }, {});
expect(repository.createResource).toHaveBeenCalledWith('note', 'hi', { name: 'T' });
      expect(result).toMatchObject({ action: 'create_resource', status: 'completed', resourceId: 'r1' });
    });

    test('should handle resource returning null id', async () => {
      const repository = { createResource: jest.fn().mockResolvedValue(null) };
      const executor = new AIExecutor({ repository });
      const result = await executor.executeStep({ action: 'create_resource', payload: { type: 'note', content: 'hi', title: 'T' } }, {});
      expect(result.resourceId).toBe('?');
    });

    test('should report error when repository throws', async () => {
      const repository = { createResource: jest.fn().mockRejectedValue(new Error('boom')) };
      const executor = new AIExecutor({ repository });
      const result = await executor.executeStep({ action: 'create_resource' }, {});
      expect(result.status).toBe('error');
      expect(result.error).toBe('boom');
    });

    test('should skip when no repository', async () => {
      const executor = new AIExecutor();
      const result = await executor.executeStep({ action: 'create_resource' }, {});
      expect(result.status).toBe('skipped');
    });
  });

  describe('create_relation', () => {
    test('should create a relation', async () => {
      const repository = { createRelation: jest.fn().mockResolvedValue({}) };
      const executor = new AIExecutor({ repository });
      const result = await executor.executeStep({ action: 'create_relation', payload: { source: 'a', target: 'b', type: 'links' } }, {});
      expect(repository.createRelation).toHaveBeenCalledWith('a', 'b', 'links');
      expect(result).toMatchObject({ action: 'create_relation', status: 'completed', from: 'a', to: 'b' });
    });

    test('should skip when missing source/target', async () => {
      const repository = { createRelation: jest.fn() };
      const executor = new AIExecutor({ repository });
      const result = await executor.executeStep({ action: 'create_relation', payload: { source: 'a' } }, {});
      expect(result.status).toBe('skipped');
      expect(repository.createRelation).not.toHaveBeenCalled();
    });

    test('should report error when repository throws', async () => {
      const repository = { createRelation: jest.fn().mockRejectedValue(new Error('rel-fail')) };
      const executor = new AIExecutor({ repository });
      const result = await executor.executeStep({ action: 'create_relation', payload: { source: 'a', target: 'b' } }, {});
      expect(result.status).toBe('error');
      expect(result.error).toBe('rel-fail');
    });

    test('should skip when no repository', async () => {
      const executor = new AIExecutor();
      const result = await executor.executeStep({ action: 'create_relation' }, {});
      expect(result.status).toBe('skipped');
    });
  });

  describe('run_workflow', () => {
    test('should skip with state-machine reason when workflow exists', async () => {
      const workflowEngine = { getWorkflow: jest.fn().mockReturnValue({ id: 'wf1' }) };
      const executor = new AIExecutor({ workflowEngine });
      const result = await executor.executeStep({ action: 'run_workflow', payload: { workflowId: 'wf1' } }, {});
      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('状态转换');
    });

    test('should skip when workflow not found', async () => {
      const workflowEngine = { getWorkflow: jest.fn().mockReturnValue(null) };
      const executor = new AIExecutor({ workflowEngine });
      const result = await executor.executeStep({ action: 'run_workflow', workflowId: 'wf1' }, {});
      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('not found');
    });

    test('should skip when engine has no getWorkflow', async () => {
      const workflowEngine = {};
      const executor = new AIExecutor({ workflowEngine });
      const result = await executor.executeStep({ action: 'run_workflow', target: 'wf1' }, {});
      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('不支持 execute');
    });

    test('should report error when engine throws', async () => {
      const workflowEngine = { getWorkflow: jest.fn().mockImplementation(() => { throw new Error('wf-bad'); }) };
      const executor = new AIExecutor({ workflowEngine });
      const result = await executor.executeStep({ action: 'run_workflow', payload: { workflowId: 'wf1' } }, {});
      expect(result.status).toBe('error');
      expect(result.error).toBe('wf-bad');
    });

    test('should skip when no engine or no workflowId', async () => {
      const executor = new AIExecutor();
      const result = await executor.executeStep({ action: 'run_workflow' }, {});
      expect(result.status).toBe('skipped');
    });
  });

  describe('call_agent', () => {
    test('should call agent engine', async () => {
      const agentEngine = { execute: jest.fn().mockResolvedValue('ok') };
      const executor = new AIExecutor({ agentEngine });
      const result = await executor.executeStep({ action: 'call_agent', agentId: 'a1' }, {});
      expect(agentEngine.execute).toHaveBeenCalledWith('a1', {});
      expect(result).toMatchObject({ action: 'call_agent', status: 'completed', agentId: 'a1' });
    });

    test('should report error when agent engine throws', async () => {
      const agentEngine = { execute: jest.fn().mockRejectedValue(new Error('agent-fail')) };
      const executor = new AIExecutor({ agentEngine });
      const result = await executor.executeStep({ action: 'call_agent', payload: { agentId: 'a1' } }, {});
      expect(result.status).toBe('error');
      expect(result.error).toBe('agent-fail');
    });

    test('should skip when no engine or no agentId', async () => {
      const executor = new AIExecutor();
      const result = await executor.executeStep({ action: 'call_agent' }, {});
      expect(result.status).toBe('skipped');
    });
  });

  describe('notify_user', () => {
    test('should log payload and emit event', async () => {
      const eventBus = { emit: jest.fn().mockResolvedValue({}) };
      const logger = { log: jest.fn() };
      const executor = new AIExecutor({ eventBus, logger });
      const result = await executor.executeStep({ action: 'notify_user', payload: { text: 'hello' }, target: 'x' }, {});
      expect(logger.log).toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'ai.notification' }));
      expect(result).toMatchObject({ action: 'notify_user', status: 'sent', target: 'x' });
    });

    test('should tolerate eventBus emit failure', async () => {
      const eventBus = { emit: jest.fn().mockRejectedValue(new Error('emit-fail')) };
      const executor = new AIExecutor({ eventBus, logger: { log: jest.fn() } });
      const result = await executor.executeStep({ action: 'notify_user', target: 't' }, {});
      expect(result.status).toBe('sent');
    });

    test('should work without eventBus', async () => {
      const executor = new AIExecutor({ logger: { log: jest.fn() } });
      const result = await executor.executeStep({ action: 'notification', target: 't' }, {});
      expect(result.status).toBe('sent');
      expect(result.target).toBe('t');
    });
  });

  describe('_execInternal', () => {
    test('find_orphan_nodes should return repository lifecycle', async () => {
      const repository = { getKnowledgeLifecycle: jest.fn().mockResolvedValue({ forgotten: 2 }) };
      const executor = new AIExecutor({ repository });
      const result = await executor.executeStep({ action: 'find_orphan_nodes' }, {});
      expect(result.status).toBe('completed');
      expect(result.data).toEqual({ forgotten: 2 });
    });

    test('find_orphan_nodes should fall back to simulated when repo throws', async () => {
      const repository = { getKnowledgeLifecycle: jest.fn().mockRejectedValue(new Error('lf')) };
      const executor = new AIExecutor({ repository });
      const result = await executor.executeStep({ action: 'find_orphan_nodes' }, {});
      expect(result.status).toBe('completed');
      expect(result.note).toBe('simulated');
    });

    test('other internal actions should return simulated completed', async () => {
      const executor = new AIExecutor();
      const result = await executor.executeStep({ action: 'suggest_relation', target: 'x' }, {});
      expect(result.status).toBe('completed');
      expect(result.note).toBe('simulated');
    });

    test('merge_concept should return simulated completed', async () => {
      const executor = new AIExecutor();
      const result = await executor.executeStep({ action: 'merge_concept' }, {});
      expect(result.status).toBe('completed');
    });
  });
});
