const EventBus = require('../../src/event/eventBus.cjs');
const Event = require('../../src/event/event.cjs');

const flush = () => new Promise(resolve => setTimeout(resolve, 30));

describe('EventBus', () => {
  describe('publish/subscribe', () => {
    test('on + emit should call handler with payload and event', async () => {
      const bus = new EventBus();
      const handler = jest.fn();
      bus.on('resource.created', handler);

      await bus.emit({ type: 'resource.created', payload: { rid: 'r1' } });
      await flush();

      expect(handler).toHaveBeenCalledTimes(1);
      const [payload, event] = handler.mock.calls[0];
      expect(payload).toEqual({ rid: 'r1' });
      expect(event).toBeInstanceOf(Event);
      expect(event.type).toBe('resource.created');
      expect(event.source).toBe('system');
    });

    test('emit with Event instance should not re-wrap', async () => {
      const bus = new EventBus();
      const handler = jest.fn();
      bus.on('x.y', handler);
      const evt = new Event({ type: 'x.y', payload: { n: 1 }, source: 'test', timestamp: 123 });
      await bus.emit(evt);
      await flush();
      expect(handler.mock.calls[0][1]).toBe(evt);
      expect(evt.source).toBe('test');
      expect(evt.timestamp).toBe(123);
    });

    test('emit without listeners should do nothing', async () => {
      const bus = new EventBus();
      await expect(bus.emit({ type: 'noone.listens', payload: {} })).resolves.toBeUndefined();
    });

    test('off should remove a specific handler', async () => {
      const bus = new EventBus();
      const h1 = jest.fn();
      const h2 = jest.fn();
      bus.on('t', h1);
      bus.on('t', h2);
      bus.off('t', h1);
      await bus.emit({ type: 't', payload: {} });
      await flush();
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledTimes(1);
    });

    test('off for unknown type should be safe', () => {
      const bus = new EventBus();
      expect(() => bus.off('nope', jest.fn())).not.toThrow();
    });

    test('once should fire only once', async () => {
      const bus = new EventBus();
      const handler = jest.fn();
      bus.once('t', handler);
      await bus.emit({ type: 't', payload: {} });
      await bus.emit({ type: 't', payload: {} });
      await flush();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(bus.listeners('t')).toBe(0);
    });

    test('listeners and registeredTypes should report state', () => {
      const bus = new EventBus();
      expect(bus.listeners('a')).toBe(0);
      bus.on('a', () => {});
      bus.on('a', () => {});
      bus.on('b', () => {});
      expect(bus.listeners('a')).toBe(2);
      expect(bus.listeners('b')).toBe(1);
      expect(bus.registeredTypes()).toEqual(expect.arrayContaining(['a', 'b']));
    });

    test('clear(type) should remove only that type', async () => {
      const bus = new EventBus();
      const h1 = jest.fn();
      const h2 = jest.fn();
      bus.on('a', h1);
      bus.on('b', h2);
      bus.clear('a');
      await bus.emit({ type: 'a', payload: {} });
      await bus.emit({ type: 'b', payload: {} });
      await flush();
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledTimes(1);
    });

    test('clear() should remove all handlers', () => {
      const bus = new EventBus();
      bus.on('a', () => {});
      bus.on('b', () => {});
      bus.clear();
      expect(bus.listeners('a')).toBe(0);
      expect(bus.listeners('b')).toBe(0);
    });

    test('handler error should not prevent other handlers', async () => {
      const bus = new EventBus();
      const bad = jest.fn(() => { throw new Error('boom'); });
      const good = jest.fn();
      bus.on('t', bad);
      bus.on('t', good);
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await bus.emit({ type: 't', payload: {} });
      await flush();
      expect(good).toHaveBeenCalledTimes(1);
      errSpy.mockRestore();
    });
  });

  describe('wildcard matching', () => {
    test('should match type with wildcard suffix', async () => {
      const bus = new EventBus();
      const handler = jest.fn();
      bus.on('resource.*', handler);
      await bus.emit({ type: 'resource.created', payload: {} });
      await bus.emit({ type: 'resource.deleted', payload: {} });
      await bus.emit({ type: 'other.type', payload: {} });
      await flush();
      expect(handler).toHaveBeenCalledTimes(2);
    });

    test('should match exact prefix for wildcard', async () => {
      const bus = new EventBus();
      const handler = jest.fn();
      bus.on('resource.*', handler);
      await bus.emit({ type: 'resource', payload: {} });
      await flush();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('should match global star wildcard', async () => {
      const bus = new EventBus();
      const handler = jest.fn();
      bus.on('*', handler);
      await bus.emit({ type: 'anything.here', payload: {} });
      await flush();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('store integration', () => {
    test('should persist events via store', async () => {
      const save = jest.fn().mockResolvedValue({ id: 'evt1' });
      const bus = new EventBus({ store: { save } });
      await bus.emit({ type: 'a.b', payload: { x: 1 } });
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0]).toBeInstanceOf(Event);
    });

    test('should swallow store errors', async () => {
      const save = jest.fn().mockRejectedValue(new Error('disk full'));
      const bus = new EventBus({ store: { save } });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await expect(bus.emit({ type: 'a.b', payload: {} })).resolves.toBeUndefined();
      errSpy.mockRestore();
    });
  });

  describe('middleware integration', () => {
    test('beforeEmit returning false should cancel emit', async () => {
      const handler = jest.fn();
      const save = jest.fn();
      const middleware = {
        run: jest.fn().mockResolvedValue(false)
      };
      const bus = new EventBus({ middleware, store: { save } });
      bus.on('a', handler);
      await bus.emit({ type: 'a', payload: {} });
      expect(handler).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(middleware.run).toHaveBeenCalledWith('beforeEmit', expect.any(Event));
    });

    test('beforeEmit returning an Event should replace it', async () => {
      const handler = jest.fn();
      const middleware = {
        run: jest.fn().mockResolvedValue(new Event({ type: 'replaced', payload: {} }))
      };
      const bus = new EventBus({ middleware });
      bus.on('replaced', handler);
      bus.on('a', handler);
      await bus.emit({ type: 'a', payload: {} });
      await flush();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][1].type).toBe('replaced');
    });

    test('beforeEmit throwing should be caught', async () => {
      const handler = jest.fn();
      const middleware = {
        run: jest.fn().mockRejectedValue(new Error('mw fail'))
      };
      const bus = new EventBus({ middleware });
      bus.on('a', handler);
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await bus.emit({ type: 'a', payload: {} });
      await flush();
      expect(handler).toHaveBeenCalledTimes(1);
      errSpy.mockRestore();
    });

    test('afterEmit should be invoked', async () => {
      const middleware = {
        run: jest.fn().mockResolvedValue(undefined)
      };
      const bus = new EventBus({ middleware });
      bus.on('a', jest.fn());
      await bus.emit({ type: 'a', payload: {} });
      await flush();
      const hooks = middleware.run.mock.calls.map(c => c[0]);
      expect(hooks).toContain('beforeEmit');
      expect(hooks).toContain('afterEmit');
    });

    test('beforeHandler returning false should skip handler', async () => {
      const handler = jest.fn();
      const middleware = {
        run: jest.fn()
          .mockResolvedValueOnce(undefined)      // beforeEmit
          .mockResolvedValueOnce(false)          // beforeHandler
          .mockResolvedValueOnce(undefined)      // afterEmit
      };
      const bus = new EventBus({ middleware });
      bus.on('a', handler);
      await bus.emit({ type: 'a', payload: {} });
      await flush();
      expect(handler).not.toHaveBeenCalled();
    });

    test('afterHandler should be invoked after successful handler', async () => {
      const handler = jest.fn();
      const middleware = {
        run: jest.fn().mockResolvedValue(undefined)
      };
      const bus = new EventBus({ middleware });
      bus.on('a', handler);
      await bus.emit({ type: 'a', payload: {} });
      await flush();
      const hooks = middleware.run.mock.calls.map(c => c[0]);
      expect(hooks).toContain('beforeHandler');
      expect(hooks).toContain('afterHandler');
    });
  });
});
