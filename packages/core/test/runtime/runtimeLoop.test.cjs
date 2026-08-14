const RuntimeLoop = require('../../src/runtime/runtimeLoop.cjs');
const RuntimeState = require('../../src/runtime/runtimeState.cjs');
const RuntimeContext = require('../../src/runtime/runtimeContext.cjs');
const RuntimeRegistry = require('../../src/runtime/runtimeRegistry.cjs');
const RuntimeScheduler = require('../../src/runtime/runtimeScheduler.cjs');

describe('RuntimeLoop', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function makeLoop(opts = {}) {
    const state = opts.state || new RuntimeState();
    state.transition('starting');
    state.transition('running');
    const context = new RuntimeContext({
      eventBus: opts.eventBus || null,
      repository: opts.repository || null
    });
    const registry = opts.registry || new RuntimeRegistry();
    const scheduler = opts.scheduler || new RuntimeScheduler(context);
    const logger = opts.logger || { log: jest.fn() };
    const loop = new RuntimeLoop({ state, context, registry, scheduler, logger });
    return { loop, state, context, registry, scheduler, logger };
  }

  test('constructor defaults scheduler and logger', () => {
    const state = runningOnly();
    const loop = new RuntimeLoop({ state });
    expect(loop.scheduler).toBeNull();
    expect(loop.logger).toBe(console);
    expect(loop._tickInterval).toBeNull();
    expect(loop._tickMs).toBe(1000);
  });

  function runningOnly() {
    const state = new RuntimeState();
    state.transition('starting');
    state.transition('running');
    return state;
  }

  test('start invokes an immediate tick and sets an interval', () => {
    const { loop } = makeLoop();
    const spy = jest.spyOn(loop, '_tick');
    loop.start(100);
    expect(spy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(2);
    loop.stop();
    spy.mockRestore();
  });

  test('start without tickMs keeps the default of 1000', () => {
    const { loop } = makeLoop();
    loop.start();
    expect(loop._tickMs).toBe(1000);
    loop.stop();
  });

  test('start with tickMs overrides the default', () => {
    const { loop } = makeLoop();
    loop.start(250);
    expect(loop._tickMs).toBe(250);
    loop.stop();
  });

  test('stop clears the interval and logs', () => {
    const { loop, logger } = makeLoop();
    const spy = jest.spyOn(loop, '_tick');
    loop.start(50);
    loop.stop();
    expect(loop._tickInterval).toBeNull();
    jest.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith('[runtime] Loop stopped');
    spy.mockRestore();
  });

  test('stop is harmless when never started', () => {
    const { loop } = makeLoop();
    expect(() => loop.stop()).not.toThrow();
  });

  test('setTickMs changes the tick frequency', () => {
    const { loop } = makeLoop();
    loop.start(100);
    const spy = jest.spyOn(loop, '_tick');
    loop.setTickMs(50);
    jest.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(2);
    loop.stop();
    spy.mockRestore();
  });

  test('setTickMs when not started only records the value', () => {
    const { loop } = makeLoop();
    loop.setTickMs(75);
    expect(loop._tickMs).toBe(75);
    expect(loop._tickInterval).toBeNull();
  });

  test('_tick is a no-op when state is not running', async () => {
    const state = new RuntimeState();
    const loop = new RuntimeLoop({ state, logger: { log: jest.fn() } });
    const observeSpy = jest.spyOn(loop, '_observe');
    await loop._tick();
    expect(observeSpy).not.toHaveBeenCalled();
    observeSpy.mockRestore();
  });

  test('full tick runs observe-analyze-react-execute-learn', async () => {
    const { loop, state, scheduler } = makeLoop({ eventBus: { emit: jest.fn() } });
    scheduler.schedule('task', jest.fn(), { intervalMs: 100 });
    const observe = jest.spyOn(loop, '_observe');
    const analyze = jest.spyOn(loop, '_analyze');
    const react = jest.spyOn(loop, '_react');
    const execute = jest.spyOn(loop, '_execute');
    const learn = jest.spyOn(loop, '_learn');
    await loop._tick();
    expect(observe).toHaveBeenCalled();
    expect(analyze).toHaveBeenCalled();
    expect(react).toHaveBeenCalled();
    expect(execute).toHaveBeenCalled();
    expect(learn).toHaveBeenCalled();
    expect(state.stats.eventsProcessed).toBe(1);
    expect(state.stats.tasksExecuted).toBe(2);
    observe.mockRestore();
    analyze.mockRestore();
    react.mockRestore();
    execute.mockRestore();
    learn.mockRestore();
  });

  test('_observe emits an observed snapshot event', async () => {
    const emit = jest.fn();
    const { loop } = makeLoop({ eventBus: { emit } });
    await loop._observe();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'runtime.loop.observed',
      source: 'runtime',
      payload: expect.objectContaining({ registry: expect.anything(), state: expect.anything() })
    }));
  });

  test('_observe tolerates eventBus errors', async () => {
    const emit = jest.fn(() => { throw new Error('bus down'); });
    const { loop } = makeLoop({ eventBus: { emit } });
    await expect(loop._observe()).resolves.toBeUndefined();
  });

  test('_observe works without a context', async () => {
    const state = runningOnly();
    const loop = new RuntimeLoop({ state, logger: { log: jest.fn() } });
    await expect(loop._observe()).resolves.toBeUndefined();
  });

  test('_analyze collects pending task and event bus insights', async () => {
    const { loop, scheduler } = makeLoop({ eventBus: { emit: jest.fn() } });
    scheduler.schedule('t', jest.fn(), { intervalMs: 100 });
    const insights = await loop._analyze();
    expect(insights).toContainEqual({ type: 'pending_tasks', count: 1 });
    expect(insights.some(i => i.type === 'event_bus_active')).toBe(true);
  });

  test('_analyze returns empty without scheduler or event bus', async () => {
    const state = runningOnly();
    const loop = new RuntimeLoop({ state, logger: { log: jest.fn() } });
    expect(await loop._analyze()).toEqual([]);
  });

  test('_react maps known insights to actions and skips others', async () => {
    const { loop } = makeLoop();
    const actions = await loop._react([
      { type: 'pending_tasks', count: 3 },
      { type: 'event_bus_active', timestamp: 123 },
      { type: 'other', x: 1 }
    ]);
    expect(actions).toEqual([
      { type: 'process_tasks', count: 3 },
      { type: 'acknowledge_events', timestamp: 123 }
    ]);
  });

  test('_react returns empty for no insights', async () => {
    const { loop } = makeLoop();
    expect(await loop._react([])).toEqual([]);
  });

  test('_execute processes task actions and counts executions', async () => {
    const { loop, state, scheduler } = makeLoop();
    scheduler.schedule('t', jest.fn(), { intervalMs: 100 });
    const tickSpy = jest.spyOn(scheduler, 'tick').mockResolvedValue();
    await loop._execute([
      { type: 'process_tasks', count: 1 },
      { type: 'acknowledge_events', timestamp: 1 }
    ]);
    expect(tickSpy).toHaveBeenCalled();
    expect(state.stats.tasksExecuted).toBe(2);
    tickSpy.mockRestore();
  });

  test('_execute records an error when scheduler tick fails', async () => {
    const { loop, state, scheduler } = makeLoop();
    scheduler.schedule('t', jest.fn(), { intervalMs: 100 });
    const tickSpy = jest.spyOn(scheduler, 'tick').mockRejectedValue(new Error('tick boom'));
    await loop._execute([{ type: 'process_tasks', count: 1 }]);
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].message).toBe('tick boom');
    tickSpy.mockRestore();
  });

  test('_execute does nothing for empty actions', async () => {
    const { loop, state } = makeLoop();
    await loop._execute([]);
    expect(state.stats.tasksExecuted).toBe(0);
  });

  test('_learn emits a learned event when actions were executed', async () => {
    const emit = jest.fn();
    const { loop } = makeLoop({ eventBus: { emit } });
    await loop._learn([{ type: 'a' }]);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'runtime.loop.learned' }));
  });

  test('_learn emits nothing without actions', async () => {
    const emit = jest.fn();
    const { loop } = makeLoop({ eventBus: { emit } });
    await loop._learn([]);
    expect(emit).not.toHaveBeenCalled();
  });

  test('_learn tolerates eventBus errors', async () => {
    const emit = jest.fn(() => { throw new Error('bus'); });
    const { loop } = makeLoop({ eventBus: { emit } });
    await expect(loop._learn([{ type: 'a' }])).resolves.toBeUndefined();
  });

  test('_tick records an error when a step throws', async () => {
    const { loop, state } = makeLoop();
    const observeSpy = jest.spyOn(loop, '_observe').mockRejectedValue(new Error('observe boom'));
    await loop._tick();
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].message).toBe('observe boom');
    observeSpy.mockRestore();
  });
});
