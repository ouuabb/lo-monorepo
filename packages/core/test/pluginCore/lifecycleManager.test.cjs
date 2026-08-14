const LifecycleManager = require('../../src/plugin/lifecycleManager.cjs');

describe('LifecycleManager', () => {
  test('getState defaults to created', () => {
    const lm = new LifecycleManager();
    expect(lm.getState('x')).toBe('created');
  });

  test('setState returns the new state and records it', () => {
    const lm = new LifecycleManager();
    expect(lm.setState('x', 'loaded')).toBe('loaded');
    expect(lm.getState('x')).toBe('loaded');
  });

  test('setState throws on invalid state value', () => {
    const lm = new LifecycleManager();
    expect(() => lm.setState('x', 'bogus')).toThrow('Invalid state: bogus');
  });

  test('setState enforces valid transitions', () => {
    const lm = new LifecycleManager();
    lm.setState('x', 'loaded');
    lm.setState('x', 'initialized');
    lm.setState('x', 'enabled');
    lm.setState('x', 'disabled');
    lm.setState('x', 'enabled');
    lm.setState('x', 'disposed');
    expect(() => lm.setState('x', 'enabled')).toThrow(/Invalid state transition/);
  });

  test('setState rejects invalid transition from created', () => {
    const lm = new LifecycleManager();
    expect(() => lm.setState('x', 'enabled')).toThrow(/Invalid state transition/);
  });

  test('disposed is a terminal state', () => {
    const lm = new LifecycleManager();
    lm.setState('x', 'disposed');
    expect(() => lm.setState('x', 'loaded')).toThrow(/Invalid state transition/);
  });

  test('isEnabled checks enabled state', () => {
    const lm = new LifecycleManager();
    expect(lm.isEnabled('x')).toBe(false);
    lm.setState('x', 'loaded');
    lm.setState('x', 'initialized');
    lm.setState('x', 'enabled');
    expect(lm.isEnabled('x')).toBe(true);
  });

  test('isDisabled true for disabled, missing and created', () => {
    const lm = new LifecycleManager();
    expect(lm.isDisabled('missing')).toBe(true);
    expect(lm.isDisabled('created-only')).toBe(true);
    lm.setState('x', 'loaded');
    lm.setState('x', 'initialized');
    lm.setState('x', 'enabled');
    lm.setState('x', 'disabled');
    expect(lm.isDisabled('x')).toBe(true);
    lm.setState('x', 'enabled');
    expect(lm.isDisabled('x')).toBe(false);
  });

  test('isDisposed checks disposed state', () => {
    const lm = new LifecycleManager();
    expect(lm.isDisposed('x')).toBe(false);
    lm.setState('x', 'loaded');
    lm.setState('x', 'initialized');
    lm.setState('x', 'enabled');
    lm.setState('x', 'disposed');
    expect(lm.isDisposed('x')).toBe(true);
  });

  test('list returns id/state pairs', () => {
    const lm = new LifecycleManager();
    lm.setState('a', 'loaded');
    lm.setState('b', 'loaded');
    lm.setState('b', 'initialized');
    lm.setState('b', 'enabled');
    expect(lm.list()).toEqual([
      { id: 'a', state: 'loaded' },
      { id: 'b', state: 'enabled' }
    ]);
  });

  test('remove deletes state and resets getState to created', () => {
    const lm = new LifecycleManager();
    lm.setState('x', 'loaded');
    lm.remove('x');
    expect(lm.getState('x')).toBe('created');
  });
});
