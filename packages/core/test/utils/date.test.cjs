const DateUtils = require('../../src/utils/date.cjs');

describe('DateUtils', () => {
  test('today should return ISO date string', () => {
    const today = DateUtils.today();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('format should default to YYYY-MM-DD', () => {
    const d = new Date(2026, 0, 5); // Jan 5 2026 local
    expect(DateUtils.format(d)).toBe('2026-01-05');
  });

  test('format should pad month and day', () => {
    const d = new Date(2026, 11, 3); // Dec 3 2026 local
    expect(DateUtils.format(d)).toBe('2026-12-03');
  });

  test('format should support time tokens', () => {
    const d = new Date(2026, 5, 15, 9, 7, 3);
    expect(DateUtils.format(d, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-06-15 09:07:03');
  });

  test('format should accept Date-compatible input', () => {
    expect(DateUtils.format('2026-01-01T00:00:00')).toBe('2026-01-01');
  });

  test('isOlderThan should compare against now', () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(DateUtils.isOlderThan(oldDate, 30)).toBe(true);
    expect(DateUtils.isOlderThan(recentDate, 30)).toBe(false);
  });

  test('getWeekNumber should return a positive week number', () => {
    expect(DateUtils.getWeekNumber(new Date(2026, 0, 1))).toBeGreaterThanOrEqual(1);
    expect(DateUtils.getWeekNumber(new Date(2026, 5, 15))).toBeGreaterThan(0);
  });
});
