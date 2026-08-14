const HookManager = require('../../src/plugin/hookManager.cjs');

describe('HookManager', () => {
  test('register stores listeners with default pluginId/priority', () => {
    const hm = new HookManager();
    hm.register('beforeX', jest.fn());
    expect(hm.listenerCount('beforeX')).toBe(1);
    expect(hm._hooks.get('beforeX')[0]).toMatchObject({ pluginId: 'unknown', priority: 0 });
  });

  test('register sorts by priority descending', () => {
    const hm = new HookManager();
    const low = jest.fn();
    const high = jest.fn();
    hm.register('h', low, { priority: 1 });
    hm.register('h', high, { priority: 10 });
    hm.register('h', jest.fn(), { priority: 5, pluginId: 'mid' });
    expect(hm._hooks.get('h').map((l) => l.priority)).toEqual([10, 5, 1]);
  });

  test('runBefore returns payload unchanged when no listeners', async () => {
    const hm = new HookManager();
    expect(await hm.runBefore('none', { a: 1 })).toEqual({ cancelled: false, payload: { a: 1 } });
  });

  test('runBefore chains payload modifications', async () => {
    const hm = new HookManager();
    hm.register('beforeX', async (p) => ({ ...p, n: p.n + 1 }));
    hm.register('beforeX', async (p) => ({ ...p, n: p.n + 10 }));
    const result = await hm.runBefore('beforeX', { n: 1 });
    expect(result.cancelled).toBe(false);
    expect(result.payload.n).toBe(12);
  });

  test('runBefore cancels when handler returns null', async () => {
    const hm = new HookManager();
    hm.register('beforeX', async (p) => null);
    const result = await hm.runBefore('beforeX', { a: 1 });
    expect(result).toEqual({ cancelled: true, payload: { a: 1 } });
  });

  test('runBefore cancels when handler returns false', async () => {
    const hm = new HookManager();
    hm.register('beforeX', async () => false);
    const result = await hm.runBefore('beforeX', { a: 1 });
    expect(result.cancelled).toBe(true);
  });

  test('runBefore ignores undefined results', async () => {
    const hm = new HookManager();
    hm.register('beforeX', async () => undefined);
    const result = await hm.runBefore('beforeX', { a: 1 });
    expect(result).toEqual({ cancelled: false, payload: { a: 1 } });
  });

  test('runBefore isolates throwing handlers and continues', async () => {
    const hm = new HookManager();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    hm.register('beforeX', async () => { throw new Error('boom'); }, { pluginId: 'bad' });
    hm.register('beforeX', async (p) => ({ ...p, ok: true }));
    const result = await hm.runBefore('beforeX', { a: 1 });
    expect(result.payload.ok).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('runBefore stops at first cancel', async () => {
    const hm = new HookManager();
    const after = jest.fn(async (p) => ({ ...p, after: true }));
    hm.register('beforeX', async () => null);
    hm.register('beforeX', after);
    const result = await hm.runBefore('beforeX', {});
    expect(result.cancelled).toBe(true);
    expect(after).not.toHaveBeenCalled();
  });

  test('runAfter returns payload when no listeners', async () => {
    const hm = new HookManager();
    expect(await hm.runAfter('none', 'x')).toBe('x');
  });

  test('runAfter chains results and ignores null/undefined', async () => {
    const hm = new HookManager();
    hm.register('afterX', async (r) => ({ ...r, one: 1 }));
    hm.register('afterX', async () => undefined);
    hm.register('afterX', async (r) => ({ ...r, two: 2 }));
    const result = await hm.runAfter('afterX', { base: 0 });
    expect(result).toEqual({ base: 0, one: 1, two: 2 });
  });

  test('runAfter isolates throwing handlers', async () => {
    const hm = new HookManager();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    hm.register('afterX', async () => { throw new Error('boom'); }, { pluginId: 'bad' });
    hm.register('afterX', async (r) => ({ ...r, ok: true }));
    expect(await hm.runAfter('afterX', {})).toEqual({ ok: true });
    errorSpy.mockRestore();
  });

  test('runAfter with null result keeps previous payload', async () => {
    const hm = new HookManager();
    hm.register('afterX', async () => null);
    expect(await hm.runAfter('afterX', { a: 1 })).toEqual({ a: 1 });
  });

  test('unregisterAll removes only that pluginId', async () => {
    const hm = new HookManager();
    hm.register('h1', jest.fn(), { pluginId: 'p1' });
    hm.register('h1', jest.fn(), { pluginId: 'p2' });
    hm.register('h2', jest.fn(), { pluginId: 'p1' });
    hm.unregisterAll('p1');
    expect(hm.listenerCount('h1')).toBe(1);
    expect(hm.listenerCount('h2')).toBe(0);
  });

  test('listenerCount returns 0 for unknown hook', () => {
    expect(new HookManager().listenerCount('zzz')).toBe(0);
  });

  test('hookNames lists registered hooks', () => {
    const hm = new HookManager();
    hm.register('a', jest.fn());
    hm.register('b', jest.fn());
    expect(hm.hookNames().sort()).toEqual(['a', 'b']);
  });
});
