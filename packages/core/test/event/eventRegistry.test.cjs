const EventRegistry = require('../../src/event/eventRegistry.cjs');

describe('EventRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new EventRegistry();
  });

  describe('constructor / builtins', () => {
    test('should register builtin events', () => {
      expect(registry.has('resource.created')).toBe(true);
      expect(registry.has('relation.deleted')).toBe(true);
      expect(registry.has('sync.finished')).toBe(true);
      expect(registry.has('automation.suggestion.created')).toBe(true);
    });

    test('should include workflow system events', () => {
      expect(registry.has('WorkflowInstanceCreated')).toBe(true);
      expect(registry.has('WorkflowTransitionCompleted')).toBe(true);
      expect(registry.has('WorkflowInstanceCompleted')).toBe(true);
      expect(registry.has('WorkflowInstanceDetached')).toBe(true);
      expect(registry.has('WorkflowInstanceResumed')).toBe(true);
    });
  });

  describe('static WORKFLOW_SYSTEM_EVENTS', () => {
    test('should expose the five reserved types', () => {
      expect(EventRegistry.WORKFLOW_SYSTEM_EVENTS).toEqual([
        'WorkflowInstanceCreated',
        'WorkflowTransitionCompleted',
        'WorkflowInstanceCompleted',
        'WorkflowInstanceDetached',
        'WorkflowInstanceResumed'
      ]);
    });

    test('isWorkflowSystemEvent should match reserved types', () => {
      expect(EventRegistry.isWorkflowSystemEvent('WorkflowInstanceCreated')).toBe(true);
      expect(EventRegistry.isWorkflowSystemEvent('WorkflowInstanceCompleted')).toBe(true);
    });

    test('isWorkflowSystemEvent should reject others', () => {
      expect(EventRegistry.isWorkflowSystemEvent('resource.created')).toBe(false);
      expect(EventRegistry.isWorkflowSystemEvent('BookReadingFinished')).toBe(false);
      expect(EventRegistry.isWorkflowSystemEvent('')).toBe(false);
    });
  });

  describe('register', () => {
    test('should register a new event definition', () => {
      registry.register({ type: 'book.reading.finished', description: '读书完成' });
      expect(registry.has('book.reading.finished')).toBe(true);
      expect(registry.get('book.reading.finished')).toMatchObject({
        type: 'book.reading.finished',
        description: '读书完成',
        schema: null
      });
    });

    test('should register with schema', () => {
      const schema = { type: 'object' };
      registry.register({ type: 'custom.evt', description: 'd', schema });
      expect(registry.get('custom.evt').schema).toBe(schema);
    });

    test('should default description to empty string', () => {
      registry.register({ type: 'custom.noschema' });
      expect(registry.get('custom.noschema').description).toBe('');
    });

    test('should throw when definition is missing', () => {
      expect(() => registry.register()).toThrow('Event definition must have a type');
    });

    test('should throw when type is missing', () => {
      expect(() => registry.register({ description: 'x' })).toThrow('Event definition must have a type');
    });

    test('should throw when type is already registered', () => {
      expect(() => registry.register({ type: 'resource.created' })).toThrow(
        "Event type 'resource.created' is already registered"
      );
    });

    test('should throw when registering a workflow reserved type', () => {
      expect(() => registry.register({ type: 'WorkflowInstanceCreated' })).toThrow(
        "Event type 'WorkflowInstanceCreated' is already registered"
      );
    });
  });

  describe('get / has', () => {
    test('get should return the definition', () => {
      expect(registry.get('plugin.loaded').description).toBe('插件加载');
    });

    test('get should return null for unknown type', () => {
      expect(registry.get('nope.here')).toBeNull();
    });

    test('has should reflect presence', () => {
      expect(registry.has('federation.repo_added')).toBe(true);
      expect(registry.has('missing.type')).toBe(false);
    });
  });

  describe('list', () => {
    test('should return all definitions', () => {
      const list = registry.list();
      expect(list.length).toBeGreaterThanOrEqual(25);
      expect(list).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'resource.created' }),
          expect.objectContaining({ type: 'knowledge.snapshot.created' })
        ])
      );
    });
  });

  describe('findByDomain', () => {
    test('should filter by domain prefix', () => {
      const types = registry.findByDomain('sync').map(e => e.type);
      expect(types).toEqual(expect.arrayContaining(['sync.started', 'sync.finished', 'sync.conflict']));
      expect(types).not.toContain('resource.created');
    });

    test('should return empty array for unknown domain', () => {
      expect(registry.findByDomain('zzz')).toEqual([]);
    });

    test('should not match domains that are prefixes of others', () => {
      const types = registry.findByDomain('federation').map(e => e.type);
      expect(types).toEqual(['federation.repo_added', 'federation.repo_removed']);
    });
  });

  describe('domains', () => {
    test('should list unique domains', () => {
      const ds = registry.domains();
      expect(ds).toEqual(
        expect.arrayContaining(['resource', 'relation', 'knowledge', 'ai', 'sync', 'plugin', 'automation', 'federation'])
      );
    });

    test('should include dot-less workflow types as their own domain', () => {
      expect(registry.domains()).toContain('WorkflowInstanceCreated');
      expect(registry.domains()).toContain('WorkflowTransitionCompleted');
    });

    test('should not contain duplicates', () => {
      const ds = registry.domains();
      expect(new Set(ds).size).toBe(ds.length);
    });
  });
});
