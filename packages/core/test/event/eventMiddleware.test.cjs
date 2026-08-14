const EventMiddleware = require('../../src/event/eventMiddleware.cjs');

describe('EventMiddleware', () => {
  let mw;

  beforeEach(() => {
    mw = new EventMiddleware();
  });

  describe('register', () => {
    test('should register a handler for a hook', () => {
      const handler = jest.fn();
      mw.register('beforeEmit', handler);
      expect(mw.count('beforeEmit')).toBe(1);
    });

    test('should accumulate multiple handlers', () => {
      mw.register('beforeEmit', jest.fn());
      mw.register('beforeEmit', jest.fn());
      expect(mw.count('beforeEmit')).toBe(2);
    });

    test('should keep hooks independent', () => {
      mw.register('beforeEmit', jest.fn());
      expect(mw.count('afterEmit')).toBe(0);
    });

    test('should sort by priority descending', async () => {
      const order = [];
      mw.register('beforeEmit', jest.fn(() => { order.push('low'); }), -10);
      mw.register('beforeEmit', jest.fn(() => { order.push('high'); }), 10);
      mw.register('beforeEmit', jest.fn(() => { order.push('zero'); }), 0);
      await mw.run('beforeEmit', {});
      expect(order).toEqual(['high', 'zero', 'low']);
    });

    test('should default priority to 0', async () => {
      const a = jest.fn();
      const b = jest.fn();
      mw.register('beforeEmit', a, 5);
      mw.register('beforeEmit', b);
      await mw.run('beforeEmit', {});
      expect(a).toHaveBeenCalled();
      expect(b).toHaveBeenCalled();
    });
  });

  describe('run', () => {
    test('should return payload when hook has no handlers', async () => {
      await expect(mw.run('beforeEmit', { x: 1 })).resolves.toEqual({ x: 1 });
    });

    test('should return payload when hook is unknown', async () => {
      await expect(mw.run('unknownHook', 42)).resolves.toBe(42);
    });

    test('should pass payload to first handler and thread results', async () => {
      const first = jest.fn(async p => ({ ...p, step: 1 }));
      const second = jest.fn(async p => ({ ...p, step: 2 }));
      mw.register('beforeEmit', first);
      mw.register('beforeEmit', second);
      const result = await mw.run('beforeEmit', { base: true });
      expect(first).toHaveBeenCalledWith({ base: true });
      expect(second).toHaveBeenCalledWith({ base: true, step: 1 });
      expect(result).toEqual({ base: true, step: 2 });
    });

    test('should keep previous result when handler returns undefined', async () => {
      const mw2 = new EventMiddleware();
      mw2.register('beforeEmit', jest.fn(p => ({ ...p, a: 1 })));
      mw2.register('beforeEmit', jest.fn(() => undefined));
      const result = await mw2.run('beforeEmit', {});
      expect(result).toEqual({ a: 1 });
    });

    test('should short-circuit when handler returns false', async () => {
      const called = jest.fn();
      mw.register('beforeEmit', jest.fn(() => false));
      mw.register('beforeEmit', called);
      const result = await mw.run('beforeEmit', { x: 1 });
      expect(result).toBe(false);
      expect(called).not.toHaveBeenCalled();
    });

    test('should short-circuit when handler returns null', async () => {
      const called = jest.fn();
      mw.register('beforeEmit', jest.fn(() => null));
      mw.register('beforeEmit', called);
      const result = await mw.run('beforeEmit', {});
      expect(result).toBe(false);
      expect(called).not.toHaveBeenCalled();
    });

    test('should handle falsy but valid return values', async () => {
      mw.register('beforeEmit', jest.fn(() => 0));
      await expect(mw.run('beforeEmit', {})).resolves.toBe(0);
      mw.clear('beforeEmit');
      mw.register('beforeEmit', jest.fn(() => ''));
      await expect(mw.run('beforeEmit', {})).resolves.toBe('');
    });

    test('should log and continue when handler throws', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const good = jest.fn();
      mw.register('beforeEmit', jest.fn(() => { throw new Error('boom'); }));
      mw.register('beforeEmit', good);
      const result = await mw.run('beforeEmit', { orig: 1 });
      expect(good).toHaveBeenCalledWith({ orig: 1 });
      expect(result).toEqual({ orig: 1 });
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
      errSpy.mockRestore();
    });

    test('should return the result when the last handler returns a value', async () => {
      mw.register('beforeEmit', jest.fn(p => ({ n: p.n + 1 })));
      await expect(mw.run('beforeEmit', { n: 1 })).resolves.toEqual({ n: 2 });
    });
  });

  describe('clear', () => {
    test('should clear a specific hook', async () => {
      const a = jest.fn();
      const b = jest.fn();
      mw.register('beforeEmit', a);
      mw.register('afterEmit', b);
      mw.clear('beforeEmit');
      expect(mw.count('beforeEmit')).toBe(0);
      expect(mw.count('afterEmit')).toBe(1);
    });

    test('should clear all hooks when no hook given', async () => {
      mw.register('beforeEmit', jest.fn());
      mw.register('afterHandler', jest.fn());
      mw.clear();
      expect(mw.count('beforeEmit')).toBe(0);
      expect(mw.count('afterHandler')).toBe(0);
    });

    test('should be safe clearing an unknown hook', () => {
      expect(() => mw.clear('nope')).not.toThrow();
    });
  });

  describe('count', () => {
    test('should return 0 for unknown hook', () => {
      expect(mw.count('beforeEmit')).toBe(0);
    });

    test('should reflect registered handlers', () => {
      mw.register('beforeHandler', jest.fn());
      mw.register('beforeHandler', jest.fn());
      expect(mw.count('beforeHandler')).toBe(2);
    });
  });

  describe('lifecycle hook names', () => {
    test('should run each documented hook independently', async () => {
      const hooks = ['beforeEmit', 'afterEmit', 'beforeHandler', 'afterHandler'];
      for (const hook of hooks) {
        const handler = jest.fn(p => p);
        mw.register(hook, handler);
        await mw.run(hook, { tag: hook });
        expect(handler).toHaveBeenCalledWith({ tag: hook });
      }
    });
  });
});
