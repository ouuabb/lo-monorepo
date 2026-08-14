const RuntimeScheduler = require('../../src/runtime/runtimeScheduler.cjs');

describe('RuntimeScheduler cron (Automation minimal cron)', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-01-15T10:30:00')));
  afterEach(() => jest.useRealTimers());

  test('_parseCron returns null for invalid expressions', () => {
    const s = new RuntimeScheduler();
    expect(s._parseCron('* * * *')).toBeNull();
    expect(s._parseCron('not a cron at all')).toBeNull();
    expect(s._parseCron(null)).toBeNull();
    expect(s._parseCron('')).toBeNull();
  });

  test('_parseCron expands star fields to full ranges', () => {
    const s = new RuntimeScheduler();
    const f = s._parseCron('* * * * *');
    expect(f).toHaveLength(5);
    expect(f[0].has(0)).toBe(true);
    expect(f[0].has(59)).toBe(true);
    expect(f[1].has(23)).toBe(true);
    expect(f[2].has(31)).toBe(true);
    expect(f[3].has(12)).toBe(true);
    expect(f[4].has(6)).toBe(true);
  });

  test('_parseCron supports lists and ranges', () => {
    const s = new RuntimeScheduler();
    const f = s._parseCron('0,30 9-17 1 1 1');
    expect(f[0].has(0)).toBe(true);
    expect(f[0].has(30)).toBe(true);
    expect(f[0].has(15)).toBe(false);
    expect(f[1].has(9)).toBe(true);
    expect(f[1].has(17)).toBe(true);
  });

  test('_cronMatch matches a value in a field', () => {
    const s = new RuntimeScheduler();
    expect(s._cronMatch(new Set([0, 30]), 30)).toBe(true);
    expect(s._cronMatch(new Set([0, 30]), 15)).toBe(false);
  });

  test('_matchCron matches current time (10:30, any day)', () => {
    const s = new RuntimeScheduler();
    expect(s._matchCron('30 10 * * *', null)).toBe(true);
    expect(s._matchCron('0 10 * * *', null)).toBe(false);
    expect(s._matchCron('30 9 * * *', null)).toBe(false);
  });

  test('_shouldRun dedupes cron within the same minute via lastRun', () => {
    const s = new RuntimeScheduler();
    const task = { mode: 'cron', cronExpr: '* * * * *', intervalMs: 60000, lastRun: Date.now() - 5000, running: false };
    jest.setSystemTime(new Date(Date.now()));
    expect(s._shouldRun(task)).toBe(false);
    task.lastRun = Date.now() - 65000;
    expect(s._shouldRun(task)).toBe(true);
  });

  test('invalid cron degrades to no-fire', () => {
    const s = new RuntimeScheduler();
    expect(s._matchCron('bad expr here', null)).toBe(false);
    expect(s._matchCron('* * * * * * *', null)).toBe(false);
  });
});
