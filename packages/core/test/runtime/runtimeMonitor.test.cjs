const RuntimeMonitor = require('../../src/runtime/runtimeMonitor.cjs');
const RuntimeState = require('../../src/runtime/runtimeState.cjs');
const RuntimeRegistry = require('../../src/runtime/runtimeRegistry.cjs');

describe('RuntimeMonitor', () => {
  function runningState() {
    const state = new RuntimeState();
    state.transition('starting');
    state.transition('running');
    return state;
  }

  test('status reflects state and registry', () => {
    const state = runningState();
    state.incrementStats('eventsProcessed', 5);
    state.incrementStats('tasksExecuted', 2);
    state.recordError(new Error('x'));
    const registry = new RuntimeRegistry();
    registry.registerResource('r1', {});
    const monitor = new RuntimeMonitor({ state, registry });
    const status = monitor.status();
    expect(status.status).toBe('running');
    expect(status.resources).toBe(1);
    expect(status.agents).toBe(0);
    expect(status.workflows).toBe(0);
    expect(status.plugins).toBe(0);
    expect(status.events).toBe(5);
    expect(status.tasksExecuted).toBe(2);
    expect(status.errors).toBe(1);
    expect(status.startedAt).toBeTruthy();
    expect(status.timestamp).toBeGreaterThan(0);
  });

  test('status handles missing state and registry', () => {
    const monitor = new RuntimeMonitor();
    const status = monitor.status();
    expect(status.status).toBe('unknown');
    expect(status.uptime).toBe(0);
    expect(status.resources).toBe(0);
    expect(status.events).toBe(0);
    expect(status.tasksExecuted).toBe(0);
    expect(status.errors).toBe(0);
  });

  test('snapshot pushes and returns a status snapshot', () => {
    const monitor = new RuntimeMonitor({ state: runningState(), registry: new RuntimeRegistry() });
    const snap = monitor.snapshot();
    expect(snap.status).toBe('running');
    expect(monitor.history()).toEqual([snap]);
  });

  test('history returns the last n snapshots', () => {
    const monitor = new RuntimeMonitor({ state: runningState(), registry: new RuntimeRegistry() });
    const snaps = [];
    for (let i = 0; i < 5; i++) snaps.push(monitor.snapshot());
    expect(monitor.history(2)).toEqual([snaps[3], snaps[4]]);
  });

  test('history defaults to the last 10 snapshots', () => {
    const monitor = new RuntimeMonitor({ state: runningState(), registry: new RuntimeRegistry() });
    for (let i = 0; i < 15; i++) monitor.snapshot();
    expect(monitor.history()).toHaveLength(10);
  });

  test('snapshot list caps at 60', () => {
    const monitor = new RuntimeMonitor({ state: runningState(), registry: new RuntimeRegistry() });
    for (let i = 0; i < 65; i++) monitor.snapshot();
    expect(monitor._snapshots).toHaveLength(60);
    expect(monitor.history(100)).toHaveLength(60);
  });

  test('trends returns null with fewer than 2 snapshots', () => {
    const monitor = new RuntimeMonitor({ state: runningState(), registry: new RuntimeRegistry() });
    monitor.snapshot();
    expect(monitor.trends()).toBeNull();
  });

  test('trends computes deltas between first and last snapshot', () => {
    const state = runningState();
    const registry = new RuntimeRegistry();
    const monitor = new RuntimeMonitor({ state, registry });
    monitor.snapshot();
    registry.registerResource('r2', {});
    state.incrementStats('eventsProcessed', 3);
    state.incrementStats('tasksExecuted', 1);
    monitor.snapshot();
    const trends = monitor.trends();
    expect(trends.resourceDelta).toBe(1);
    expect(trends.eventsDelta).toBe(3);
    expect(trends.tasksDelta).toBe(1);
    expect(trends.errorsDelta).toBe(0);
    expect(typeof trends.duration).toBe('number');
  });

  test('persist saves a snapshot via the store', async () => {
    const store = { saveState: jest.fn().mockResolvedValue() };
    const state = runningState();
    const monitor = new RuntimeMonitor({ state, registry: new RuntimeRegistry(), store });
    await monitor.persist();
    expect(store.saveState).toHaveBeenCalledWith('monitor:lastSnapshot', expect.objectContaining({ status: 'running' }));
    expect(monitor.history()).toHaveLength(1);
  });

  test('persist is a no-op without a store', async () => {
    const monitor = new RuntimeMonitor();
    await monitor.persist();
    expect(monitor._snapshots).toHaveLength(0);
  });

  test('constructor defaults store and logger', () => {
    const monitor = new RuntimeMonitor({ state: runningState(), registry: new RuntimeRegistry() });
    expect(monitor.store).toBeNull();
    expect(monitor.logger).toBe(console);
    expect(monitor._maxSnapshots).toBe(60);
  });
});
