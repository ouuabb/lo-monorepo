const ResourceLifecycle = require('../../src/domain/resourceLifecycle.cjs');

const MS_PER_DAY = 86400000;
const NOW = new Date('2026-01-15T00:00:00Z').getTime();

describe('ResourceLifecycle', () => {
  let originalNow;

  beforeAll(() => {
    originalNow = Date.now;
    global.Date.now = jest.fn(() => NOW);
  });

  afterAll(() => {
    global.Date.now = originalNow;
  });

  function ts(daysAgo) {
    return NOW - daysAgo * MS_PER_DAY;
  }

  test('should default name to rid', () => {
    const lc = new ResourceLifecycle({ rid: 'r1' });
    expect(lc.name).toBe('r1');
    expect(lc.state).toBe('active');
    expect(lc.reason).toBe('');
  });

  test('should be active when recently used', () => {
    const lc = new ResourceLifecycle({ rid: 'r2', lastAccess: ts(10) });
    expect(lc.state).toBe('active');
  });

  test('should be inactive after 90 days', () => {
    const lc = new ResourceLifecycle({ rid: 'r3', updated: ts(100) });
    expect(lc.state).toBe('inactive');
    expect(lc.reason).toMatch(/Resource inactive for 100 days/);
  });

  test('should be forgotten when high value and old', () => {
    const lc = new ResourceLifecycle({ rid: 'r4', score: 0.5, updated: ts(200) });
    expect(lc.state).toBe('forgotten');
    expect(lc.reason).toMatch(/Important knowledge has not been reviewed for 200 days/);
  });

  test('should be inactive (not forgotten) when low value and old', () => {
    const lc = new ResourceLifecycle({ rid: 'r5', score: 0.1, updated: ts(200) });
    expect(lc.state).toBe('inactive');
  });

  test('should stay active when no activity timestamps set', () => {
    const lc = new ResourceLifecycle({ rid: 'r6' });
    expect(lc.state).toBe('active');
  });

  test('should use the latest of lastAccess/lastRelation/updated', () => {
    const lc = new ResourceLifecycle({
      rid: 'r7',
      lastAccess: ts(200),
      lastRelation: ts(10),
      updated: ts(200)
    });
    expect(lc.state).toBe('active');
  });

  test('archive should mark archived', () => {
    const lc = new ResourceLifecycle({ rid: 'r8' });
    lc.archive();
    expect(lc.state).toBe('archived');
    expect(lc.reason).toBe('Manually archived');
  });

  test('isForgotten should reflect forgotten state', () => {
    const forgotten = new ResourceLifecycle({ rid: 'r9', score: 0.9, updated: ts(300) });
    const active = new ResourceLifecycle({ rid: 'r10', updated: ts(5) });
    expect(forgotten.isForgotten()).toBe(true);
    expect(active.isForgotten()).toBe(false);
  });

  test('toJSON should include lastActivity and omit empty reason', () => {
    const active = new ResourceLifecycle({ rid: 'r11', updated: ts(5) });
    expect(active.toJSON()).toEqual({
      rid: 'r11',
      name: 'r11',
      state: 'active',
      score: 0,
      rank: 'normal',
      lastActivity: ts(5)
    });
    const inactive = new ResourceLifecycle({ rid: 'r12', updated: ts(95) });
    expect(inactive.toJSON().reason).toMatch(/Resource inactive/);
  });

  test('batch should return instances', () => {
    const list = ResourceLifecycle.batch([
      { rid: 'a', updated: ts(5) },
      { rid: 'b', updated: ts(95) }
    ]);
    expect(list).toHaveLength(2);
    expect(list[0].state).toBe('active');
    expect(list[1].state).toBe('inactive');
  });

  test('summary should count states', () => {
    const list = ResourceLifecycle.batch([
      { rid: 'a', updated: ts(5) },
      { rid: 'b', updated: ts(100) },
      { rid: 'c', score: 0.9, updated: ts(200) }
    ]);
    list[2].archive();
    const summary = ResourceLifecycle.summary(list);
    expect(summary).toEqual({
      active: 1,
      inactive: 1,
      forgotten: 0,
      archived: 1,
      total: 3
    });
  });
});
