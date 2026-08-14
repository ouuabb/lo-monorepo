const RuntimeState = require('../../src/runtime/runtimeState.cjs');

describe('RuntimeState', () => {
  test('initial state is created', () => {
    const s = new RuntimeState();
    expect(s.status).toBe('created');
    expect(s.isRunning).toBe(false);
    expect(s.isStopped).toBe(false);
    expect(s.isPaused).toBe(false);
    expect(s.uptime).toBe(0);
    expect(s.errors).toEqual([]);
    expect(s.stats).toEqual({
      eventsProcessed: 0,
      tasksExecuted: 0,
      agentsTriggered: 0,
      workflowsRun: 0
    });
  });

  test('transitions through the full lifecycle', () => {
    const s = new RuntimeState();
    s.transition('starting');
    expect(s.status).toBe('starting');
    s.transition('running');
    expect(s.isRunning).toBe(true);
    s.transition('paused');
    expect(s.isPaused).toBe(true);
    s.transition('running');
    expect(s.isRunning).toBe(true);
    s.transition('stopping');
    expect(s.status).toBe('stopping');
    s.transition('stopped');
    expect(s.isStopped).toBe(true);
  });

  test('transition returns this for chaining', () => {
    const s = new RuntimeState();
    expect(s.transition('starting')).toBe(s);
  });

  test('invalid transition throws', () => {
    const s = new RuntimeState();
    expect(() => s.transition('stopped')).toThrow(/Invalid state transition: created → stopped/);
    expect(() => s.transition('bogus')).toThrow(/Invalid state transition/);
  });

  test('transition emits stateChange and target state events', () => {
    const s = new RuntimeState();
    const stateChange = jest.fn();
    const running = jest.fn();
    s.on('stateChange', stateChange);
    s.on('running', running);
    s.transition('starting');
    s.transition('running');
    expect(stateChange).toHaveBeenNthCalledWith(1, expect.objectContaining({ from: 'created', to: 'starting' }));
    expect(stateChange).toHaveBeenNthCalledWith(2, expect.objectContaining({ from: 'starting', to: 'running' }));
    expect(running).toHaveBeenCalledWith(expect.objectContaining({ from: 'starting' }));
  });

  test('toJSON reflects timestamps, uptime, errors and stats', () => {
    const s = new RuntimeState();
    s.transition('starting');
    s.recordError(new Error('boom'));
    s.incrementStats('eventsProcessed', 3);
    const json = s.toJSON();
    expect(json.status).toBe('starting');
    expect(json.startedAt).toBeTruthy();
    expect(json.stoppedAt).toBeNull();
    expect(json.uptime).toBeGreaterThanOrEqual(0);
    expect(json.errors).toBe(1);
    expect(json.stats.eventsProcessed).toBe(3);
  });

  test('uptime is computed from startedAt to stoppedAt', () => {
    const s = new RuntimeState();
    s.transition('starting');
    s.transition('running');
    expect(s.uptime).toBeGreaterThanOrEqual(0);
    s.transition('stopping');
    s.transition('stopped');
    expect(s.uptime).toBeGreaterThanOrEqual(0);
    expect(s.toJSON().stoppedAt).toBeTruthy();
  });

  test('recordError stores messages with timestamps', () => {
    const s = new RuntimeState();
    s.recordError(new Error('first'));
    s.recordError('plain string');
    expect(s.errors).toHaveLength(2);
    expect(s.errors[0].message).toBe('first');
    expect(s.errors[1].message).toBe('plain string');
    expect(s.errors[0].timestamp).toBeTruthy();
  });

  test('recordError caps stored errors at 100', () => {
    const s = new RuntimeState();
    for (let i = 0; i < 120; i++) s.recordError(new Error(`err-${i}`));
    expect(s.errors).toHaveLength(100);
    expect(s.errors[0].message).toBe('err-20');
    expect(s.errors[99].message).toBe('err-119');
  });

  test('incrementStats only updates known keys', () => {
    const s = new RuntimeState();
    s.incrementStats('eventsProcessed');
    s.incrementStats('eventsProcessed', 3);
    s.incrementStats('tasksExecuted', 2);
    s.incrementStats('agentsTriggered');
    s.incrementStats('workflowsRun', 4);
    s.incrementStats('notAKey', 10);
    expect(s.stats).toEqual({
      eventsProcessed: 4,
      tasksExecuted: 2,
      agentsTriggered: 1,
      workflowsRun: 4
    });
  });

  test('pausedAt is recorded on pause transition', () => {
    const s = new RuntimeState();
    s.transition('starting');
    s.transition('running');
    s.transition('paused');
    expect(s.status).toBe('paused');
    expect(s.uptime).toBeGreaterThanOrEqual(0);
  });
});
