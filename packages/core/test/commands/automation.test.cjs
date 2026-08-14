jest.mock('../../src/repo/repository.cjs', () => jest.fn());

const Repository = require('../../src/repo/repository.cjs');
const automationCmd = require('../../src/commands/automation.cjs');

function buildRepo() {
  return {
    open: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    initAutomationSystem: jest.fn().mockResolvedValue(),
    automationList: jest.fn().mockResolvedValue([]),
    automationShow: jest.fn().mockResolvedValue({
      id: 'demo', name: 'Demo', description: '', source: { type: 'user' },
      trigger: { type: 'schedule', schedule: { cadence: 'daily', time: '22:00' } },
      condition: {}, actions: [{ id: 's1', type: 'resource.query' }],
      policy: { requireApproval: false, risk: 'low' }, status: 'active'
    }),
    automationCreate: jest.fn().mockResolvedValue({ id: 'demo' }),
    automationEnable: jest.fn().mockResolvedValue({ status: 'active' }),
    automationDisable: jest.fn().mockResolvedValue({ status: 'inactive' }),
    automationRun: jest.fn().mockResolvedValue({
      automation_id: 'demo', trigger_source: 'cli', status: 'completed',
      actions_result: [{ id: 's1', type: 'resource.query', ok: true }],
      error: ''
    }),
    automationHistory: jest.fn().mockResolvedValue([])
  };
}

describe('automation command', () => {
  let repo;

  beforeEach(() => {
    repo = buildRepo();
    Repository.mockImplementation(() => repo);
  });

  afterEach(() => jest.clearAllMocks());

  test('automationList prints empty-state', async () => {
    repo.automationList.mockResolvedValue([]);
    automationCmd.automationList({});
    await new Promise(r => setTimeout(r, 10));
    expect(repo.open).toHaveBeenCalled();
    expect(repo.automationList).toHaveBeenCalled();
  });

  test('automationCreate passes parsed trigger and actions', async () => {
    await new Promise((resolve) => {
      // capture the definition passed to repo.automationCreate
      automationCmd.automationCreate({
        id: 'demo',
        name: 'Demo',
        trigger: '{"type":"event","event":"resource.created"}',
        type: 'resource.query',
        source: 'user',
        'require-approval': true
      });
      resolve();
    });
    await new Promise(r => setTimeout(r, 10));
    const def = repo.automationCreate.mock.calls[0][0];
    expect(def.id).toBe('demo');
    expect(def.trigger.type).toBe('event');
    expect(def.policy.requireApproval).toBe(true);
    expect(def.actions[0].type).toBe('resource.query');
  });

  test('automationRun defaults to builtin id when absent', async () => {
    await new Promise((resolve) => {
      automationCmd.automationRun({ id: null });
      resolve();
    });
    await new Promise(r => setTimeout(r, 10));
    const id = repo.automationRun.mock.calls[0][0];
    expect(id).toBeNull();
    expect(repo.automationRun).toHaveBeenCalled();
  });

  test('automationRun with explicit id passes it through', async () => {
    await new Promise((resolve) => {
      automationCmd.automationRun({ id: 'demo' });
      resolve();
    });
    await new Promise(r => setTimeout(r, 10));
    expect(repo.automationRun.mock.calls[0][0]).toBe('demo');
  });

  test('automationHistory calls history facade', async () => {
    await new Promise((resolve) => {
      automationCmd.automationHistory({ id: 'demo', limit: 5 });
      resolve();
    });
    await new Promise(r => setTimeout(r, 10));
    expect(repo.automationHistory).toHaveBeenCalledWith({ automationId: 'demo', limit: 5 });
  });
});