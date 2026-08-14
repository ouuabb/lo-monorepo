const EvolutionExecutor = require('../../src/evolution/evolutionExecutor.cjs');

describe('EvolutionExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new EvolutionExecutor({ logger: { log: jest.fn(), error: jest.fn() } });
  });

  test('stores services on constructor', () => {
    const ex = new EvolutionExecutor({ repository: {}, agentEngine: {}, workflowEngine: {}, permissionManager: {} });
    expect(ex.repository).toEqual({});
    expect(ex.agentEngine).toEqual({});
    expect(ex.workflowEngine).toEqual({});
    expect(ex.permissionManager).toEqual({});
    expect(executor.repository).toBeNull();
    expect(executor.permissionManager).toBeNull();
  });

  test('executeStep analyze_structure returns lifecycle data', async () => {
    const repository = { getKnowledgeLifecycle: jest.fn().mockResolvedValue({ growing: 3 }) };
    const ex = new EvolutionExecutor({ repository });
    const result = await ex.executeStep({ action: 'analyze_structure', target: 'graph' });
    expect(result).toMatchObject({ action: 'analyze_structure', target: 'graph', status: 'completed' });
    expect(result.data).toEqual({ growing: 3 });
  });

  test('executeStep analyze_structure without repository returns completed', async () => {
    const result = await executor.executeStep({ action: 'analyze_structure' });
    expect(result).toEqual({ action: 'analyze_structure', status: 'completed' });
  });

  test('executeStep suggest_relations returns suggestion count', async () => {
    const repository = { getRelationSuggestions: jest.fn().mockResolvedValue([1, 2]) };
    const ex = new EvolutionExecutor({ repository });
    const result = await ex.executeStep({ action: 'suggest_relations' });
    expect(result).toMatchObject({ status: 'completed', data: { suggestions: 2 } });
  });

  test('executeStep suggest_relations without repository returns completed', async () => {
    const result = await executor.executeStep({ action: 'suggest_relations' });
    expect(result).toEqual({ action: 'suggest_relations', status: 'completed' });
  });

  test('executeStep returns notes for simple actions', async () => {
    const cases = {
      connect_orphans: 'orphan analysis done',
      clean_orphans: 'orphan analysis done',
      detect_duplicates: 'duplicate analysis done',
      merge_concepts: 'duplicate analysis done',
      find_gaps: 'gap analysis done',
      suggest_content: 'content suggestions generated',
      extend_relations: 'relation extensions proposed',
      analyze_performance: 'performance analyzed',
      optimize_workflow: 'workflows optimized',
      extract_patterns: 'patterns extracted',
      update_models: 'models updated',
      adjust_strategies: 'strategies adjusted',
      inspect: 'inspected'
    };
    for (const [action, note] of Object.entries(cases)) {
      const result = await executor.executeStep({ action });
      expect(result.status).toBe('completed');
      expect(result.note).toBe(note);
      expect(result.action).toBe(action);
    }
  });

  test('unknown action is treated as inspect', async () => {
    const result = await executor.executeStep({ action: 'mystery_action' });
    expect(result).toEqual({ action: 'mystery_action', status: 'completed', note: 'inspected' });
  });

  test('retrain_agent with agent engine completes', async () => {
    const ex = new EvolutionExecutor({ agentEngine: { listAgents: jest.fn() } });
    const result = await ex.executeStep({ action: 'retrain_agent' });
    expect(result).toMatchObject({ status: 'completed', note: 'agents retrained' });
  });

  test('retrain_agent without agent engine returns completed without note', async () => {
    const result = await executor.executeStep({ action: 'retrain_agent' });
    expect(result).toEqual({ action: 'retrain_agent', status: 'completed' });
  });

  test('executeStep catches thrown errors', async () => {
    const repository = { getKnowledgeLifecycle: jest.fn().mockRejectedValue(new Error('boom')) };
    const ex = new EvolutionExecutor({ repository });
    const result = await ex.executeStep({ action: 'analyze_structure' });
    expect(result).toEqual({ action: 'analyze_structure', status: 'error', error: 'boom' });
  });

  test('execute denies step when permission manager rejects', async () => {
    const permissionManager = { check: jest.fn().mockResolvedValue(false) };
    const ex = new EvolutionExecutor({ permissionManager });
    const results = await ex.execute({ steps: [{ action: 'inspect' }] });
    expect(results[0]).toMatchObject({ status: 'denied', reason: 'permission' });
    expect(permissionManager.check).toHaveBeenCalledWith('ai-agent', 'inspect');
  });

  test('execute runs step when permission allowed', async () => {
    const permissionManager = { check: jest.fn().mockResolvedValue(true) };
    const ex = new EvolutionExecutor({ permissionManager });
    const results = await ex.execute({ steps: [{ action: 'find_gaps' }] });
    expect(results[0].status).toBe('completed');
    expect(permissionManager.check).toHaveBeenCalledTimes(1);
  });

  test('execute continues after permission check failure', async () => {
    const permissionManager = { check: jest.fn().mockRejectedValue(new Error('perm broken')) };
    const ex = new EvolutionExecutor({ permissionManager, logger: { log: jest.fn(), error: jest.fn() } });
    const results = await ex.execute({ steps: [{ action: 'inspect' }] });
    expect(results[0].status).toBe('completed');
    expect(ex.logger.error).toHaveBeenCalledWith('evolutionExecutor: permission check failed', expect.any(Error));
  });

  test('execute skips permission check when no permission manager', async () => {
    const results = await executor.execute({ steps: [{ action: 'inspect' }] });
    expect(results[0].status).toBe('completed');
  });

  test('execute processes all steps', async () => {
    const results = await executor.execute({ steps: [{ action: 'find_gaps' }, { action: 'inspect' }] });
    expect(results).toHaveLength(2);
    expect(results[0].note).toBe('gap analysis done');
    expect(results[1].note).toBe('inspected');
  });

  test('rollback returns rolled back marker', async () => {
    const result = await executor.rollback('exec-1');
    expect(result).toEqual({ rolledBack: true, executionId: 'exec-1' });
  });
});
