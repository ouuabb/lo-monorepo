const SystemObserver = require('../../src/evolution/systemObserver.cjs');

describe('SystemObserver', () => {
  test('snapshot with no services returns zeros', async () => {
    const observer = new SystemObserver();
    const snap = await observer.snapshot();
    expect(snap).toMatchObject({
      resources: 0,
      relations: 0,
      orphanNodes: 0,
      agents: 0,
      workflows: 0
    });
    expect(typeof snap.timestamp).toBe('number');
  });

  test('snapshot reads repository stats and lifecycle', async () => {
    const repository = {
      getStats: jest.fn().mockResolvedValue({ resourceCount: 12, relationCount: 30 }),
      getKnowledgeLifecycle: jest.fn().mockResolvedValue({ forgotten: 3 })
    };
    const observer = new SystemObserver({ repository });

    const snap = await observer.snapshot();

    expect(snap.resources).toBe(12);
    expect(snap.relations).toBe(30);
    expect(snap.orphanNodes).toBe(3);
  });

  test('snapshot counts agents and workflows', async () => {
    const agentEngine = { listAgents: jest.fn().mockReturnValue([{}, {}, {}]) };
    const workflowEngine = { list: jest.fn().mockReturnValue([{}]) };
    const observer = new SystemObserver({ agentEngine, workflowEngine });

    const snap = await observer.snapshot();

    expect(snap.agents).toBe(3);
    expect(snap.workflows).toBe(1);
  });

  test('workflow engine without list yields zero', async () => {
    const observer = new SystemObserver({ workflowEngine: {} });
    const snap = await observer.snapshot();
    expect(snap.workflows).toBe(0);
  });

  test('workflow engine returning non-array yields zero', async () => {
    const observer = new SystemObserver({ workflowEngine: { list: jest.fn().mockReturnValue(42) } });
    const snap = await observer.snapshot();
    expect(snap.workflows).toBe(0);
  });

  test('snapshot handles repository errors', async () => {
    const logger = { log: jest.fn(), error: jest.fn() };
    const repository = {
      getStats: jest.fn().mockRejectedValue(new Error('stats fail')),
      getKnowledgeLifecycle: jest.fn().mockRejectedValue(new Error('lifecycle fail'))
    };
    const observer = new SystemObserver({ repository, logger });

    const snap = await observer.snapshot();

    expect(snap.resources).toBe(0);
    expect(snap.orphanNodes).toBe(0);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  test('snapshot handles agent and workflow errors', async () => {
    const logger = { log: jest.fn(), error: jest.fn() };
    const agentEngine = { listAgents: jest.fn(() => { throw new Error('agents fail'); }) };
    const workflowEngine = { list: jest.fn(() => { throw new Error('workflows fail'); }) };
    const observer = new SystemObserver({ agentEngine, workflowEngine, logger });

    const snap = await observer.snapshot();

    expect(snap.agents).toBe(0);
    expect(snap.workflows).toBe(0);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  test('observe computes connectivity health and complexity', async () => {
    const repository = {
      getStats: jest.fn().mockResolvedValue({ resourceCount: 10, relationCount: 5 }),
      getKnowledgeLifecycle: jest.fn().mockResolvedValue({ forgotten: 2 })
    };
    const observer = new SystemObserver({ repository });

    const snap = await observer.observe();

    expect(snap.connectivity).toBe(0.17);
    expect(snap.health).toBe(0.8);
    expect(snap.complexity).toBe(0.05);
    expect(snap.resources).toBe(10);
  });

  test('observe with zero resources gives zero connectivity and full health', async () => {
    const observer = new SystemObserver();
    const snap = await observer.observe();
    expect(snap.connectivity).toBe(0);
    expect(snap.health).toBe(1);
    expect(snap.complexity).toBe(0);
  });

  test('observe caps connectivity at 1', async () => {
    const repository = {
      getStats: jest.fn().mockResolvedValue({ resourceCount: 10, relationCount: 100 }),
      getKnowledgeLifecycle: jest.fn().mockResolvedValue({ forgotten: 0 })
    };
    const observer = new SystemObserver({ repository });

    const snap = await observer.observe();

    expect(snap.connectivity).toBe(1);
  });

  test('observe computes complexity for large bases with high relations', async () => {
    const repository = {
      getStats: jest.fn().mockResolvedValue({ resourceCount: 200, relationCount: 1600 }),
      getKnowledgeLifecycle: jest.fn().mockResolvedValue({ forgotten: 0 })
    };
    const observer = new SystemObserver({ repository });

    const snap = await observer.observe();

    expect(snap.complexity).toBe(1);
  });

  test('observe computes complexity for large bases with few relations', async () => {
    const repository = {
      getStats: jest.fn().mockResolvedValue({ resourceCount: 200, relationCount: 100 }),
      getKnowledgeLifecycle: jest.fn().mockResolvedValue({ forgotten: 0 })
    };
    const observer = new SystemObserver({ repository });

    const snap = await observer.observe();

    expect(snap.complexity).toBe(0.13);
  });
});
