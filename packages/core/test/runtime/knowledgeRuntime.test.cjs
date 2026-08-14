const KnowledgeRuntime = require('../../src/runtime/knowledgeRuntime.cjs');
const RuntimeContext = require('../../src/runtime/runtimeContext.cjs');
const RuntimeRegistry = require('../../src/runtime/runtimeRegistry.cjs');

describe('KnowledgeRuntime', () => {
  test('birth creates and registers an indexed resource', () => {
    const registry = new RuntimeRegistry();
    const emit = jest.fn();
    const kr = new KnowledgeRuntime({ registry, context: new RuntimeContext({ eventBus: { emit } }) });
    const resource = kr.birth('r1', 'note', { a: 1 });
    expect(resource.rid).toBe('r1');
    expect(resource.type).toBe('note');
    expect(resource.metadata).toEqual({ a: 1 });
    expect(resource.state).toBe('indexed');
    expect(registry.getResource('r1')).toBe(resource);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.birth', payload: { rid: 'r1', type: 'note' } }));
  });

  test('birth without a registry still returns the resource', () => {
    const kr = new KnowledgeRuntime({});
    const resource = kr.birth('r1', 'note');
    expect(resource.state).toBe('indexed');
    expect(resource.rid).toBe('r1');
  });

  test('grow marks a resource as analyzed', async () => {
    const registry = new RuntimeRegistry();
    const emit = jest.fn();
    const kr = new KnowledgeRuntime({ registry, context: new RuntimeContext({ eventBus: { emit } }) });
    const resource = kr.birth('r1', 'note');
    const grown = await kr.grow('r1');
    expect(grown).toBe(resource);
    expect(resource.state).toBe('analyzed');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.growth', payload: { rid: 'r1' } }));
  });

  test('grow warns and returns null for a missing resource', async () => {
    const warn = jest.fn();
    const kr = new KnowledgeRuntime({ registry: new RuntimeRegistry(), logger: { warn } });
    expect(await kr.grow('missing')).toBeNull();
    expect(warn).toHaveBeenCalledWith('[knowledge] Resource not found: missing');
  });

  test('grow without a registry returns null', async () => {
    const warn = jest.fn();
    const kr = new KnowledgeRuntime({ logger: { warn } });
    expect(await kr.grow('x')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  test('connect links a resource and emits found when related exist', async () => {
    const registry = new RuntimeRegistry();
    const emit = jest.fn();
    const findRelated = jest.fn().mockResolvedValue([{ rid: 'r2' }, { rid: 'r3' }]);
    const kr = new KnowledgeRuntime({
      registry,
      context: new RuntimeContext({ eventBus: { emit }, repository: { findRelated } })
    });
    const resource = kr.birth('r1', 'note');
    const connected = await kr.connect('r1');
    expect(connected).toBe(resource);
    expect(resource.state).toBe('linked');
    expect(findRelated).toHaveBeenCalledWith('r1', { limit: 10 });
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.connection.found', payload: { rid: 'r1', relatedCount: 2 } }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.connection' }));
  });

  test('connect does not emit found when no related resources', async () => {
    const registry = new RuntimeRegistry();
    const emit = jest.fn();
    const findRelated = jest.fn().mockResolvedValue([]);
    const kr = new KnowledgeRuntime({
      registry,
      context: new RuntimeContext({ eventBus: { emit }, repository: { findRelated } })
    });
    kr.birth('r1', 'note');
    await kr.connect('r1');
    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.connection.found' }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.connection' }));
  });

  test('connect returns null for a missing resource', async () => {
    const kr = new KnowledgeRuntime({ registry: new RuntimeRegistry() });
    expect(await kr.connect('missing')).toBeNull();
  });

  test('connect tolerates findRelated errors', async () => {
    const registry = new RuntimeRegistry();
    const emit = jest.fn();
    const findRelated = jest.fn(async () => { throw new Error('repo boom'); });
    const kr = new KnowledgeRuntime({
      registry,
      context: new RuntimeContext({ eventBus: { emit }, repository: { findRelated } })
    });
    kr.birth('r1', 'note');
    const connected = await kr.connect('r1');
    expect(connected.state).toBe('linked');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.connection' }));
  });

  test('connect works without a repository', async () => {
    const registry = new RuntimeRegistry();
    const emit = jest.fn();
    const kr = new KnowledgeRuntime({ registry, context: new RuntimeContext({ eventBus: { emit } }) });
    kr.birth('r1', 'note');
    await kr.connect('r1');
    expect(registry.getResource('r1').state).toBe('linked');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.connection' }));
  });

  test('use records usage when a resource exists', () => {
    const registry = new RuntimeRegistry();
    const emit = jest.fn();
    const kr = new KnowledgeRuntime({ registry, context: new RuntimeContext({ eventBus: { emit } }) });
    kr.birth('r1', 'note');
    kr.use('r1');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.usage', payload: expect.objectContaining({ rid: 'r1' }) }));
  });

  test('use is a no-op for a missing resource', () => {
    const kr = new KnowledgeRuntime({ registry: new RuntimeRegistry() });
    expect(() => kr.use('missing')).not.toThrow();
  });

  test('evolve marks a resource as evolved', async () => {
    const registry = new RuntimeRegistry();
    const emit = jest.fn();
    const kr = new KnowledgeRuntime({
      registry,
      context: new RuntimeContext({ eventBus: { emit }, aiOS: {} })
    });
    const resource = kr.birth('r1', 'note');
    const result = await kr.evolve('r1');
    expect(result).toBe(resource);
    expect(resource.state).toBe('evolved');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.evolution', payload: { rid: 'r1' } }));
  });

  test('evolve returns null for a missing resource', async () => {
    const kr = new KnowledgeRuntime({ registry: new RuntimeRegistry() });
    expect(await kr.evolve('missing')).toBeNull();
  });

  test('stats totals resources by state', () => {
    const registry = new RuntimeRegistry();
    const kr = new KnowledgeRuntime({ registry });
    kr.birth('r1', 'note');
    kr.birth('r2', 'note');
    kr.grow('r2');
    expect(kr.stats()).toEqual({ total: 2, byState: { indexed: 1, analyzed: 1 } });
  });

  test('stats returns an empty object without a registry', () => {
    const kr = new KnowledgeRuntime({});
    expect(kr.stats()).toEqual({});
  });

  test('_emit tolerates eventBus errors', () => {
    const emit = jest.fn(() => { throw new Error('bus'); });
    const kr = new KnowledgeRuntime({ context: new RuntimeContext({ eventBus: { emit } }) });
    expect(() => kr._emit('knowledge.birth', {})).not.toThrow();
  });

  test('_emit without a context is a no-op', () => {
    const kr = new KnowledgeRuntime({});
    expect(() => kr._emit('knowledge.birth', {})).not.toThrow();
  });
});
