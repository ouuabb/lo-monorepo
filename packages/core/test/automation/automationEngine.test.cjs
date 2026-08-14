const Repository = require('../../src/repo/repository.cjs');
const testUtils = global.testUtils;

describe('AutomationEngine (integration via Repository facade)', () => {
  let tempDir, repo;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });
    await repo.initAutomationSystem();
  });

  afterEach(async () => {
    if (repo) await repo.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('initAutomationSystem registers the builtin knowledge automation', async () => {
    const list = await repo.automationList();
    const builtin = list.find(a => a.id === 'knowledge.maintenance.daily');
    expect(builtin).toBeDefined();
    expect(builtin.status).toBe('active');
    expect(builtin.source.type).toBe('builtin');
  });

  test('automation create / show / enable / disable / run / history facade works', async () => {
    await repo.automationCreate({
      id: 'demo',
      name: 'Demo',
      source: { type: 'user', id: 'demo' },
      trigger: { type: 'external' },
      condition: {},
      actions: [{ id: 's1', type: 'resource.query', params: {}, dependsOn: [] }],
      policy: { requireApproval: false, risk: 'low' }
    });

    const shown = await repo.automationShow('demo');
    expect(shown.id).toBe('demo');

    await repo.automationDisable('demo');
    expect((await repo.automationShow('demo')).status).toBe('inactive');
    await repo.automationEnable('demo');
    expect((await repo.automationShow('demo')).status).toBe('active');

    const run = await repo.automationRun('demo');
    expect(run.automation_id).toBe('demo');
    expect(['completed', 'failed']).toContain(run.status);

    const history = await repo.automationHistory({ automationId: 'demo' });
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].automation_id).toBe('demo');
  });

  test('condition evaluation can skip an automation', async () => {
    await repo.automationCreate({
      id: 'cond',
      source: { type: 'user', id: 'cond' },
      trigger: { type: 'external' },
      condition: { expression: 'resource.type == "book"' },
      actions: [{ id: 's1', type: 'resource.query', params: { resource: 'res1' }, dependsOn: [] }],
      policy: { requireApproval: false, risk: 'low' }
    });
    const run = await repo.automationRun('cond');
    // no resource in context → condition evaluates false → skipped
    expect(run.status).toBe('skipped');
  });

  test('event-triggered automation fires on resource.created', async () => {
    await repo.automationCreate({
      id: 'evt',
      name: 'Evt',
      source: { type: 'user', id: 'evt' },
      trigger: { type: 'event', event: { type: 'resource.created' } },
      condition: {},
      actions: [{ id: 's1', type: 'resource.query', params: {}, dependsOn: [] }],
      policy: { requireApproval: false, risk: 'low' }
    });

    await repo.createResource('note', '# hi', { filename: `evt-${Date.now()}.md` });
    await new Promise((res) => setTimeout(res, 400));

    const history = await repo.automationHistory({ automationId: 'evt' });
    expect(history.length).toBe(1);
    expect(history[0].trigger_source).toBe('event');
  });

  test('builtin knowledge.maintenance runs to completion', async () => {
    const run = await repo.automationRun();
    expect(run.automation_id).toBe('knowledge.maintenance.daily');
    expect(run.status).toBe('completed');
    expect(Array.isArray(run.actions_result)).toBe(true);
  });

  test('inactive automation run fails with status check', async () => {
    await repo.automationCreate({
      id: 'off',
      source: { type: 'user', id: 'off' },
      trigger: { type: 'external' },
      condition: {},
      actions: [{ id: 's1', type: 'resource.query', params: {}, dependsOn: [] }],
      policy: { requireApproval: false, risk: 'low' }
    });
    await repo.automationDisable('off');
    await expect(repo.automationRun('off')).rejects.toThrow(/未启用/);
  });
});
