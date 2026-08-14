const {
  LIFECYCLE_STATES,
  LIFECYCLE_TRANSITIONS,
  canTransition,
} = require('../src/lifecycle.cjs');

describe('lifecycle', () => {
  it('导出全部状态', () => {
    expect(LIFECYCLE_STATES).toEqual([
      'installed', 'loaded', 'activated', 'enabled',
      'disabled', 'deactivated', 'disposed',
    ]);
  });

  it('合法转移', () => {
    expect(canTransition('installed', 'loaded')).toEqual({ ok: true });
    expect(canTransition('loaded', 'activated')).toEqual({ ok: true });
    expect(canTransition('loaded', 'disposed')).toEqual({ ok: true });
    expect(canTransition('activated', 'enabled')).toEqual({ ok: true });
    expect(canTransition('enabled', 'disabled')).toEqual({ ok: true });
    expect(canTransition('disabled', 'deactivated')).toEqual({ ok: true });
  });

  it('非法转移', () => {
    const r = canTransition('installed', 'enabled');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('非法状态转移');
  });

  it('未知状态', () => {
    expect(canTransition('unknown', 'loaded').ok).toBe(false);
    expect(canTransition('loaded', 'unknown').ok).toBe(false);
  });

  it('disposed 后不可再转移', () => {
    expect(canTransition('disposed', 'loaded').ok).toBe(false);
  });

  it('LIFECYCLE_TRANSITIONS 每个状态都有转移集合', () => {
    for (const s of LIFECYCLE_STATES) {
      expect(LIFECYCLE_TRANSITIONS[s]).toBeInstanceOf(Set);
    }
  });
});
