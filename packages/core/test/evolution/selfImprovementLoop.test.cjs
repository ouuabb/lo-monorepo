const SelfImprovementLoop = require('../../src/evolution/selfImprovementLoop.cjs');

function makeServices(overrides = {}) {
  return {
    observer: { observe: jest.fn().mockResolvedValue({ health: 0.6, complexity: 0.3, connectivity: 0.5 }) },
    healthAnalyzer: { analyze: jest.fn().mockResolvedValue({ healthScore: 60, issues: [] }) },
    detector: { detect: jest.fn().mockResolvedValue([]) },
    strategy: { generate: jest.fn().mockReturnValue([]) },
    planner: { plan: jest.fn().mockReturnValue({ goal: 'g', steps: [] }) },
    executor: { execute: jest.fn().mockResolvedValue([]) },
    validator: { validate: jest.fn().mockReturnValue({ success: true, improvement: 0.1 }) },
    memory: { record: jest.fn().mockResolvedValue({}) },
    eventBus: { emit: jest.fn() },
    logger: { log: jest.fn(), error: jest.fn() },
    ...overrides
  };
}

describe('SelfImprovementLoop', () => {
  test('stores services on constructor', () => {
    const services = makeServices();
    const loop = new SelfImprovementLoop(services);
    expect(loop.observer).toBe(services.observer);
    expect(loop.eventBus).toBe(services.eventBus);
    expect(loop.logger).toBe(services.logger);
    expect(new SelfImprovementLoop().eventBus).toBeNull();
  });

  test('run returns no-evolution when no opportunities', async () => {
    const services = makeServices();
    const loop = new SelfImprovementLoop(services);

    const result = await loop.run();

    expect(result.evolved).toBe(false);
    expect(result.reason).toBe('No improvements needed');
    expect(result.before).toMatchObject({ health: 0.6, complexity: 0.3, connectivity: 0.5 });
    expect(services.observer.observe).toHaveBeenCalledTimes(1);
    expect(services.strategy.generate).not.toHaveBeenCalled();
    expect(services.planner.plan).not.toHaveBeenCalled();
    expect(services.executor.execute).not.toHaveBeenCalled();
    expect(services.validator.validate).not.toHaveBeenCalled();
    expect(services.memory.record).not.toHaveBeenCalled();
    expect(services.logger.log).toHaveBeenCalledWith('[evolution] Self-improvement loop started');
    expect(services.logger.log).toHaveBeenCalledWith('[evolution] No improvements needed.');
  });

  test('run emits lifecycle events even without opportunities', async () => {
    const services = makeServices();
    const loop = new SelfImprovementLoop(services);
    await loop.run();

    const emitted = services.eventBus.emit.mock.calls.map(c => c[0].type);
    expect(emitted).toEqual([
      'evolution.started',
      'system.snapshot.created',
      'knowledge.health.analyzed',
      'evolution.detected',
      'evolution.completed'
    ]);
  });

  test('run executes full loop when opportunities exist', async () => {
    const services = makeServices({
      detector: { detect: jest.fn().mockResolvedValue([{ type: 'orphan_cleanup', priority: 'high' }]) },
      planner: { plan: jest.fn().mockReturnValue({ goal: 'cleanup', steps: [{ action: 'clean_orphans' }] }) },
      executor: { execute: jest.fn().mockResolvedValue([{ action: 'clean_orphans', status: 'completed' }]) }
    });
    services.strategy.generate.mockReturnValue([{ type: 'remove', priority: 'high' }]);
    const loop = new SelfImprovementLoop(services);

    const result = await loop.run();

    expect(result.evolved).toBe(true);
    expect(result.before).toMatchObject({ health: 0.6 });
    expect(result.after).toMatchObject({ health: 0.6 });
    expect(result.validation).toEqual({ success: true, improvement: 0.1 });
    expect(result.results).toEqual([{ action: 'clean_orphans', status: 'completed' }]);
    expect(services.observer.observe).toHaveBeenCalledTimes(2);
    expect(services.strategy.generate).toHaveBeenCalledWith([{ type: 'orphan_cleanup', priority: 'high' }]);
    expect(services.planner.plan).toHaveBeenCalled();
    expect(services.executor.execute).toHaveBeenCalled();
    expect(services.validator.validate).toHaveBeenCalled();
    expect(services.memory.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'cleanup',
      improvement: 0.1,
      result: [{ action: 'clean_orphans', status: 'completed' }]
    }));
  });

  test('run emits system.improved on success', async () => {
    const services = makeServices({
      detector: { detect: jest.fn().mockResolvedValue([{ type: 'x' }]) }
    });
    const loop = new SelfImprovementLoop(services);
    await loop.run();

    const emitted = services.eventBus.emit.mock.calls.map(c => c[0].type);
    expect(emitted).toContain('system.improved');
    expect(emitted).toContain('evolution.completed');
  });

  test('run emits evolution.failed when validation fails', async () => {
    const services = makeServices({
      detector: { detect: jest.fn().mockResolvedValue([{ type: 'x' }]) },
      validator: { validate: jest.fn().mockReturnValue({ success: false, improvement: 0 }) }
    });
    const loop = new SelfImprovementLoop(services);

    const result = await loop.run();

    expect(result.evolved).toBe(true);
    const emitted = services.eventBus.emit.mock.calls.map(c => c[0].type);
    expect(emitted).toContain('evolution.failed');
    expect(services.memory.record).toHaveBeenCalledWith(expect.objectContaining({ improvement: 0 }));
  });

  test('emit swallows event bus errors', async () => {
    const services = makeServices({
      eventBus: { emit: jest.fn(() => { throw new Error('emit broken'); }) },
      detector: { detect: jest.fn().mockResolvedValue([]) }
    });
    const loop = new SelfImprovementLoop(services);

    const result = await loop.run();

    expect(result.evolved).toBe(false);
    expect(services.logger.error).toHaveBeenCalledWith(
      'selfImprovementLoop: event emit failed',
      expect.any(Error)
    );
  });

  test('run works without an event bus', async () => {
    const services = makeServices({ eventBus: null });
    const loop = new SelfImprovementLoop(services);

    const result = await loop.run();

    expect(result.evolved).toBe(false);
  });
});
