const EvolutionEngine = require('../../src/evolution/evolutionEngine.cjs');

describe('EvolutionEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new EvolutionEngine({ logger: { log: jest.fn(), error: jest.fn() } });
  });

  test('constructs all sub components', () => {
    expect(engine.memory).toBeDefined();
    expect(engine.observer).toBeDefined();
    expect(engine.healthAnalyzer).toBeDefined();
    expect(engine.detector).toBeDefined();
    expect(engine.strategy).toBeDefined();
    expect(engine.planner).toBeDefined();
    expect(engine.executor).toBeDefined();
    expect(engine.validator).toBeDefined();
    expect(engine.loop).toBeDefined();
    expect(engine.running).toBe(false);
  });

  test('memory uses repository db when provided', () => {
    const repo = { db: { run: jest.fn() } };
    const e = new EvolutionEngine({ repository: repo });
    expect(e.memory._db).toBe(repo.db);
  });

  test('start, shutdown and running', () => {
    engine.start();
    expect(engine.running).toBe(true);
    engine.shutdown();
    expect(engine.running).toBe(false);
  });

  test('observe delegates to observer', async () => {
    const snapshot = { resources: 1 };
    engine.observer.observe = jest.fn().mockResolvedValue(snapshot);
    await expect(engine.observe()).resolves.toBe(snapshot);
    expect(engine.observer.observe).toHaveBeenCalledTimes(1);
  });

  test('diagnose returns state health opportunities and strategies', async () => {
    const snapshot = { health: 0.7, complexity: 0.2, connectivity: 0.6 };
    engine.observer.observe = jest.fn().mockResolvedValue(snapshot);
    engine.healthAnalyzer.analyze = jest.fn().mockResolvedValue({ healthScore: 70, issues: [] });
    engine.detector.detect = jest.fn().mockResolvedValue([{ type: 'orphan_cleanup', priority: 'high' }]);

    const result = await engine.diagnose();

    expect(result.state).toMatchObject({
      health: 0.7,
      complexity: 0.2,
      connectivity: 0.6,
      snapshot
    });
    expect(typeof result.state.score).toBe('number');
    expect(result.health).toEqual({ healthScore: 70, issues: [] });
    expect(result.opportunities).toEqual([{ type: 'orphan_cleanup', priority: 'high' }]);
    expect(result.strategies[0]).toMatchObject({ name: 'orphan_cleanup', type: 'remove', priority: 'high' });
  });

  test('diagnose with empty snapshot still returns a state', async () => {
    engine.observer.observe = jest.fn().mockResolvedValue({});
    engine.healthAnalyzer.analyze = jest.fn().mockResolvedValue({ healthScore: 0, issues: [] });
    engine.detector.detect = jest.fn().mockResolvedValue([]);
    const result = await engine.diagnose();
    expect(result.state.health).toBe(0.5);
    expect(result.strategies).toEqual([]);
  });

  test('evolve starts engine and delegates to loop', async () => {
    engine.loop.run = jest.fn().mockResolvedValue({ evolved: true });
    const result = await engine.evolve();
    expect(result).toEqual({ evolved: true });
    expect(engine.running).toBe(true);
    expect(engine.loop.run).toHaveBeenCalledTimes(1);
  });

  test('rollback returns last state when history exists', async () => {
    engine.memory.last = jest.fn().mockResolvedValue({ fromState: { health: 0.3 } });
    const result = await engine.rollback();
    expect(result).toEqual({ rolledBack: true, fromState: { health: 0.3 } });
  });

  test('rollback returns failure when no history', async () => {
    engine.memory.last = jest.fn().mockResolvedValue(null);
    const result = await engine.rollback();
    expect(result).toEqual({ rolledBack: false, reason: 'No evolution history' });
  });

  test('history delegates to memory with limit', async () => {
    engine.memory.history = jest.fn().mockResolvedValue([{ id: 1 }]);
    await expect(engine.history(10)).resolves.toEqual([{ id: 1 }]);
    expect(engine.memory.history).toHaveBeenCalledWith(10);
  });

  test('status returns state health and memory stats', async () => {
    const snapshot = { health: 0.9, connectivity: 0.5, complexity: 0.1 };
    engine.observer.observe = jest.fn().mockResolvedValue(snapshot);
    engine.healthAnalyzer.analyze = jest.fn().mockResolvedValue({ healthScore: 90 });
    engine.memory.stats = jest.fn().mockResolvedValue({ totalEvolutions: 3, improvementRate: 66 });

    const result = await engine.status();

    expect(result.state.health).toBe(0.9);
    expect(result.state.connectivity).toBe(0.5);
    expect(result.health).toEqual({ healthScore: 90 });
    expect(result.memory).toEqual({ totalEvolutions: 3, improvementRate: 66 });
  });
});
