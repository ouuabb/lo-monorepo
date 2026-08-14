const Event = require('../../src/event/event.cjs');

describe('Event', () => {
  describe('constructor', () => {
    test('should set all provided fields', () => {
      const e = new Event({
        type: 'resource.created',
        payload: { rid: 'r1' },
        source: 'resources',
        timestamp: 123456,
        metadata: { attempt: 2 }
      });
      expect(e.type).toBe('resource.created');
      expect(e.payload).toEqual({ rid: 'r1' });
      expect(e.source).toBe('resources');
      expect(e.timestamp).toBe(123456);
      expect(e.metadata).toEqual({ attempt: 2 });
    });

    test('should throw when type is missing', () => {
      expect(() => new Event({})).toThrow('Event must have a type');
    });

    test('should throw when no options are given', () => {
      expect(() => new Event()).toThrow('Event must have a type');
    });

    test('should default source to system', () => {
      const e = new Event({ type: 'a.b', payload: {} });
      expect(e.source).toBe('system');
    });

    test('should default timestamp to now', () => {
      const before = Date.now();
      const e = new Event({ type: 'a.b', payload: {} });
      expect(e.timestamp).toBeGreaterThanOrEqual(before);
      expect(e.timestamp).toBeLessThanOrEqual(Date.now());
    });

    test('should replace falsy timestamp with now', () => {
      const before = Date.now();
      const e = new Event({ type: 'a.b', payload: {}, timestamp: 0 });
      expect(e.timestamp).toBeGreaterThanOrEqual(before);
    });

    test('should default metadata to empty object', () => {
      const e = new Event({ type: 'a.b', payload: {} });
      expect(e.metadata).toEqual({});
    });
  });

  describe('toJSON', () => {
    test('should serialize all fields', () => {
      const e = new Event({
        type: 'a.b',
        payload: { n: 1 },
        source: 's',
        timestamp: 7,
        metadata: { k: 'v' }
      });
      expect(e.toJSON()).toEqual({
        type: 'a.b',
        payload: { n: 1 },
        source: 's',
        timestamp: 7,
        metadata: { k: 'v' }
      });
    });
  });

  describe('fromJSON', () => {
    test('should restore from object payload', () => {
      const e = Event.fromJSON({
        type: 'a.b',
        payload: { n: 1 },
        source: 's',
        timestamp: 9,
        metadata: {}
      });
      expect(e).toBeInstanceOf(Event);
      expect(e.type).toBe('a.b');
      expect(e.payload).toEqual({ n: 1 });
      expect(e.source).toBe('s');
      expect(e.timestamp).toBe(9);
    });

    test('should parse string payload', () => {
      const e = Event.fromJSON({
        type: 'a.b',
        payload: '{"n":2}',
        source: 's',
        timestamp: 9,
        metadata: {}
      });
      expect(e.payload).toEqual({ n: 2 });
    });

    test('should throw on invalid JSON string payload', () => {
      expect(() =>
        Event.fromJSON({ type: 'a.b', payload: 'not-json', source: 's' })
      ).toThrow();
    });

    test('should throw when type is missing', () => {
      expect(() => Event.fromJSON({ payload: {} })).toThrow('Event must have a type');
    });

    test('should round-trip through JSON.stringify', () => {
      const e = new Event({ type: 'a.b', payload: { x: 1 }, source: 's', timestamp: 42 });
      const restored = Event.fromJSON(JSON.parse(JSON.stringify(e)));
      expect(restored.toJSON()).toEqual(e.toJSON());
    });
  });

  describe('getters', () => {
    test('domain should return first segment', () => {
      const e = new Event({ type: 'resource.created', payload: {} });
      expect(e.domain).toBe('resource');
    });

    test('action should return second segment', () => {
      const e = new Event({ type: 'resource.created', payload: {} });
      expect(e.action).toBe('created');
    });

    test('domain should be empty for type without dot', () => {
      const e = new Event({ type: 'WorkflowInstanceCreated', payload: {} });
      expect(e.domain).toBe('WorkflowInstanceCreated');
      expect(e.action).toBe('');
    });
  });
});
