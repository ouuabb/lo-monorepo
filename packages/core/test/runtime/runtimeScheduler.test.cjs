const RuntimeScheduler = require('../../src/runtime/runtimeScheduler.cjs');

describe('RuntimeScheduler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('schedule registers an interval task by default', () => {
    const s = new RuntimeScheduler();
    s.schedule('t1', jest.fn());
    expect(s.pendingCount()).toBe(1);
  });

  test('unschedule removes a task', () => {
    const s = new RuntimeScheduler();
    s.schedule('t1', jest.fn());
    s.unschedule('t1');
    expect(s.pendingCount()).toBe(0);
  });

  test('unschedule of unknown id is harmless', () => {
    const s = new RuntimeScheduler();
    expect(() => s.unschedule('nope')).not.toThrow();
  });

  test('start then tick executes due tasks with context', async () => {
    const ctx = { name: 'ctx' };
    const s = new RuntimeScheduler(ctx);
    const fn = jest.fn();
    s.schedule('t1', fn, { intervalMs: 100 });
    s.start(100);
    await jest.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(ctx);
    s.stop();
  });

  test('interval task respects its interval after the first run', async () => {
    const s = new RuntimeScheduler();
    const fn = jest.fn();
    s.schedule('t1', fn, { intervalMs: 100 });
    s.start(50);
    await jest.advanceTimersByTimeAsync(50);
    expect(fn).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(50);
    expect(fn).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(50);
    expect(fn).toHaveBeenCalledTimes(2);
    s.stop();
  });

  test('pendingCount is zero right after a task runs', async () => {
    const s = new RuntimeScheduler();
    const fn = jest.fn();
    s.schedule('t', fn, { intervalMs: 60000 });
    expect(s.pendingCount()).toBe(1);
    s.start(10);
    await jest.advanceTimersByTimeAsync(10);
    expect(fn).toHaveBeenCalled();
    expect(s.pendingCount()).toBe(0);
    s.stop();
  });

  test('event mode tasks are never scheduled', async () => {
    const s = new RuntimeScheduler();
    const fn = jest.fn();
    s.schedule('e1', fn, { mode: 'event' });
    s.start(10);
    await jest.advanceTimersByTimeAsync(1000);
    expect(fn).not.toHaveBeenCalled();
    expect(s.pendingCount()).toBe(0);
    s.stop();
  });

  test('cron mode tasks run via simplified cron matcher', async () => {
    const s = new RuntimeScheduler();
    const fn = jest.fn();
    s.schedule('c1', fn, { mode: 'cron', cron: '* * * * *' });
    s.start(10);
    await jest.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalled();
    s.stop();
  });

  test('startup mode runs on the first tick', async () => {
    const s = new RuntimeScheduler();
    const fn = jest.fn();
    s.schedule('s1', fn, { mode: 'startup', intervalMs: 100 });
    s.start(10);
    await jest.advanceTimersByTimeAsync(10);
    expect(fn).toHaveBeenCalled();
    s.stop();
  });

  test('unknown modes never run', async () => {
    const s = new RuntimeScheduler();
    const fn = jest.fn();
    s.schedule('u1', fn, { mode: 'weird' });
    s.start(10);
    await jest.advanceTimersByTimeAsync(100);
    expect(fn).not.toHaveBeenCalled();
    expect(s.pendingCount()).toBe(0);
    s.stop();
  });

  test('a failing task does not prevent other tasks from running', async () => {
    const s = new RuntimeScheduler();
    const failing = jest.fn(() => { throw new Error('task error'); });
    const ok = jest.fn();
    s.schedule('bad', failing, { intervalMs: 100 });
    s.schedule('good', ok, { intervalMs: 100 });
    s.start(10);
    await jest.advanceTimersByTimeAsync(10);
    expect(failing).toHaveBeenCalled();
    expect(ok).toHaveBeenCalled();
    s.stop();
  });

  test('an async task that rejects does not break the scheduler', async () => {
    const s = new RuntimeScheduler();
    const failing = jest.fn(async () => { throw new Error('async boom'); });
    s.schedule('bad', failing, { intervalMs: 100 });
    s.start(10);
    await jest.advanceTimersByTimeAsync(10);
    expect(failing).toHaveBeenCalled();
    s.stop();
  });

  test('tick skips tasks that are still running', async () => {
    const s = new RuntimeScheduler();
    let release;
    const slow = jest.fn(() => new Promise(resolve => { release = resolve; }));
    s.schedule('slow', slow, { intervalMs: 0 });
    s.start(10);
    await jest.advanceTimersByTimeAsync(10);
    await jest.advanceTimersByTimeAsync(200);
    expect(slow).toHaveBeenCalledTimes(1);
    release();
    await jest.advanceTimersByTimeAsync(10);
    s.stop();
  });

  test('tick does nothing when not running', async () => {
    const s = new RuntimeScheduler();
    const fn = jest.fn();
    s.schedule('t1', fn, { intervalMs: 100 });
    await s.tick();
    expect(fn).not.toHaveBeenCalled();
  });

  test('start is idempotent', () => {
    const s = new RuntimeScheduler();
    s.start(100);
    s.start(100);
    expect(s._running).toBe(true);
    s.stop();
    expect(s._running).toBe(false);
  });

  test('stop clears the timer and tick no longer fires', async () => {
    const s = new RuntimeScheduler();
    const fn = jest.fn();
    s.schedule('t', fn, { intervalMs: 10 });
    s.start(10);
    s.stop();
    await jest.advanceTimersByTimeAsync(100);
    expect(fn).not.toHaveBeenCalled();
    await s.tick();
    expect(fn).not.toHaveBeenCalled();
  });

  test('schedule stores mode, cron and interval options', () => {
    const s = new RuntimeScheduler();
    s.schedule('t', jest.fn(), { mode: 'cron', cron: '0 0 * * *', intervalMs: 500 });
    const task = s._tasks.get('t');
    expect(task.mode).toBe('cron');
    expect(task.cronExpr).toBe('0 0 * * *');
    expect(task.intervalMs).toBe(500);
    expect(task.lastRun).toBeNull();
    expect(task.running).toBe(false);
  });

  test('intervalMs defaults to 60000 when not provided', () => {
    const s = new RuntimeScheduler();
    s.schedule('t', jest.fn());
    expect(s._tasks.get('t').intervalMs).toBe(60000);
  });

  test('_matchCron always matches', () => {
    const s = new RuntimeScheduler();
    expect(s._matchCron('* * * * *', null)).toBe(true);
    expect(s._matchCron('* * * * *', Date.now())).toBe(true);
  });
});
