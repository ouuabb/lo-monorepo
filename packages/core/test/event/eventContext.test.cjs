const EventContext = require('../../src/event/eventContext.cjs');

describe('EventContext', () => {
  describe('constructor', () => {
    test('should default all services', () => {
      const ctx = new EventContext();
      expect(ctx.eventBus).toBeNull();
      expect(ctx.repository).toBeNull();
      expect(ctx.logger).toBe(console);
      expect(ctx.pluginManager).toBeNull();
    });

    test('should default with empty options object', () => {
      const ctx = new EventContext({});
      expect(ctx.eventBus).toBeNull();
      expect(ctx.repository).toBeNull();
      expect(ctx.logger).toBe(console);
      expect(ctx.pluginManager).toBeNull();
    });

    test('should inject all services', () => {
      const eventBus = {};
      const repository = {};
      const logger = { info: jest.fn() };
      const pluginManager = {};
      const ctx = new EventContext({ eventBus, repository, logger, pluginManager });
      expect(ctx.eventBus).toBe(eventBus);
      expect(ctx.repository).toBe(repository);
      expect(ctx.logger).toBe(logger);
      expect(ctx.pluginManager).toBe(pluginManager);
    });

    test('should inject only some services', () => {
      const eventBus = {};
      const ctx = new EventContext({ eventBus });
      expect(ctx.eventBus).toBe(eventBus);
      expect(ctx.repository).toBeNull();
      expect(ctx.logger).toBe(console);
      expect(ctx.pluginManager).toBeNull();
    });
  });

  describe('emit', () => {
    test('should forward to eventBus with type and payload', () => {
      const eventBus = { emit: jest.fn() };
      const ctx = new EventContext({ eventBus });
      const result = ctx.emit('resource.updated', { rid: 'r1' });
      expect(eventBus.emit).toHaveBeenCalledTimes(1);
      expect(eventBus.emit).toHaveBeenCalledWith({ type: 'resource.updated', payload: { rid: 'r1' } });
      expect(result).toBeUndefined();
    });

    test('should return the eventBus result', () => {
      const marker = { ok: true };
      const eventBus = { emit: jest.fn(() => marker) };
      const ctx = new EventContext({ eventBus });
      expect(ctx.emit('a.b', {})).toBe(marker);
    });

    test('should return a promise from async eventBus', async () => {
      const eventBus = { emit: jest.fn().mockResolvedValue('done') };
      const ctx = new EventContext({ eventBus });
      await expect(ctx.emit('a.b', {})).resolves.toBe('done');
    });

    test('should do nothing when no eventBus', () => {
      const ctx = new EventContext();
      expect(ctx.emit('a.b', {})).toBeUndefined();
      expect(() => ctx.emit('a.b', {})).not.toThrow();
    });
  });
});
