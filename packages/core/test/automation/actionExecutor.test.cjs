const ActionExecutor = require('../../src/automation/action/ActionExecutor.cjs');

describe('ActionExecutor', () => {
  function makeExecutor({ suggestionEngine } = {}) {
    const repo = {
      resolveResource: jest.fn(async (ref) => ({ rid: 'res1', type: 'note', path: '/x', metadata: {}, name: 'n' })),
      getResource: jest.fn(async () => ({ rid: 'res1', type: 'note', path: '/x', metadata: {}, name: 'n' })),
      updateResource: jest.fn(async (rid, u) => ({ rid, ...u })),
      deleteResource: jest.fn(async () => ({ deleted: true })),
      addTag: jest.fn(async () => ({ ok: true })),
      runAutomation: jest.fn(async () => ({ lifecycle: { active: 1 }, repair: { brokenCount: 0 }, suggestions: [] })),
      scanForgottenResources: jest.fn(async () => ({ forgotten: [], suggestions: [] })),
      analyzeKnowledgeHealth: jest.fn(async () => ({ score: 1 })),
      runKnowledgeReport: jest.fn(async () => ({ report: 'ok' })),
      runKnowledgeRepair: jest.fn(async () => ({ repair: 'ok' })),
      createSuggestion: jest.fn(async (p) => ({ id: 'sug1', ...p }))
    };
    const extensionRegistry = {
      commands: {},
      getCommand: jest.fn(),
      executeCommand: jest.fn()
    };
    return { executor: new ActionExecutor({ repo, extensionRegistry, suggestionEngine }), repo };
  }

  test('registers all builtin action types', () => {
    const { executor } = makeExecutor();
    const types = executor.registry.list();
    for (const t of ['resource.query', 'resource.tag', 'resource.delete', 'workflow.transition', 'suggestion.create', 'plugin.invoke', 'agent.execute', 'knowledge.maintenance']) {
      expect(types).toContain(t);
    }
  });

  test('isHighRisk flags destructive actions', () => {
    const { executor } = makeExecutor();
    expect(executor.isHighRisk('resource.delete')).toBe(true);
    expect(executor.isHighRisk('resource.move')).toBe(true);
    expect(executor.isHighRisk('resource.merge')).toBe(true);
    expect(executor.isHighRisk('workflow.transition')).toBe(true);
    expect(executor.isHighRisk('resource.query')).toBe(false);
  });

  test('high-risk action + requireApproval routes to suggestion', async () => {
    const sugEngine = { create: jest.fn(async (p) => ({ id: 'sug9', ...p })) };
    const { executor, repo } = makeExecutor({ suggestionEngine: sugEngine });
    const results = await executor.executeActions(
      [{ id: 'del', type: 'resource.delete', params: { resource: 'res1' }, dependsOn: [] }],
      { automationId: 'a' },
      { requireApproval: true }
    );
    expect(results[0].result.needApproval).toBe(true);
    expect(repo.deleteResource).not.toHaveBeenCalled();
    expect(sugEngine.create).toHaveBeenCalled();
  });

  test('low-risk action executes directly', async () => {
    const { executor } = makeExecutor();
    const results = await executor.executeActions(
      [{ id: 'tag', type: 'resource.tag', params: { resource: 'res1', tag: 'x' }, dependsOn: [] }],
      { automationId: 'a' }
    );
    expect(results[0].ok).toBe(true);
  });

  test('resource.query with no resource ref fails cleanly (error isolation)', async () => {
    const { executor } = makeExecutor();
    const results = await executor.executeActions(
      [{ id: 'q', type: 'resource.query', params: {}, dependsOn: [] }],
      { automationId: 'a' }
    );
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toBeTruthy();
  });

  test('respects dependsOn ordering', async () => {
    const { executor } = makeExecutor();
    const order = [];
    executor.registry.register('a.test', async () => { order.push('a'); return { ok: true }; });
    executor.registry.register('b.test', async () => { order.push('b'); return { ok: true }; });
    const results = await executor.executeActions(
      [
        { id: 'a', type: 'a.test', dependsOn: [] },
        { id: 'b', type: 'b.test', dependsOn: ['a'] }
      ],
      { automationId: 'x' }
    );
    expect(order).toEqual(['a', 'b']);
    expect(results).toHaveLength(2);
  });

  test('failFast stops on first error', async () => {
    const { executor } = makeExecutor();
    executor.registry.register('x.fail', async () => { throw new Error('boom'); });
    executor.registry.register('x.ok', async () => ({ ok: true }));
    const results = await executor.executeActions(
      [
        { id: 'a', type: 'x.fail', dependsOn: [] },
        { id: 'b', type: 'x.ok', dependsOn: [] }
      ],
      { automationId: 'x' },
      { failFast: true }
    );
    expect(results._interrupted).toBe(true);
    expect(results.filter(r => r.ok === false).length).toBe(1);
  });

  test('unknown action type is isolated', async () => {
    const { executor } = makeExecutor();
    const results = await executor.executeActions(
      [{ id: 'z', type: 'nope.unknown', params: {}, dependsOn: [] }],
      { automationId: 'x' }
    );
    expect(results[0].ok).toBe(false);
  });
});
