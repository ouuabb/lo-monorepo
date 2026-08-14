const RuntimeEvolution = require('../../src/runtime/runtimeEvolution.cjs');
const RuntimeRegistry = require('../../src/runtime/runtimeRegistry.cjs');
const RuntimeContext = require('../../src/runtime/runtimeContext.cjs');
const ResourceRuntime = require('../../src/runtime/resourceRuntime.cjs');

describe('RuntimeEvolution', () => {
  test('constructor defaults logger to console', () => {
    const evo = new RuntimeEvolution({});
    expect(evo.logger).toBe(console);
    expect(evo.context).toBeUndefined();
    expect(evo.registry).toBeUndefined();
  });

  test('detect returns empty when there is no registry', async () => {
    const evo = new RuntimeEvolution({});
    expect(await evo.detect()).toEqual([]);
  });

  test('detect flags isolated resources', async () => {
    const registry = new RuntimeRegistry();
    registry.registerResource('r1', new ResourceRuntime({ rid: 'r1', state: 'created' }));
    registry.registerResource('r2', new ResourceRuntime({ rid: 'r2', state: 'indexed' }));
    registry.registerResource('r3', new ResourceRuntime({ rid: 'r3', state: 'evolved' }));
    const evo = new RuntimeEvolution({ registry });
    const opps = await evo.detect();
    expect(opps).toHaveLength(1);
    expect(opps[0]).toEqual(expect.objectContaining({
      type: 'isolated_resources',
      severity: 'medium'
    }));
    expect(opps[0].affected).toEqual(['r1', 'r2']);
    expect(opps[0].description).toContain('2');
  });

  test('detect flags low analysis when most resources are unanalyzed', async () => {
    const registry = new RuntimeRegistry();
    for (let i = 0; i < 12; i++) {
      registry.registerResource(`r${  i}`, new ResourceRuntime({ rid: `r${  i}`, state: 'created' }));
    }
    const evo = new RuntimeEvolution({ registry });
    const opps = await evo.detect();
    const low = opps.find(o => o.type === 'low_analysis');
    expect(low).toBeTruthy();
    expect(low.severity).toBe('low');
    expect(low.affected.length).toBeLessThanOrEqual(20);
  });

  test('detect does not flag low analysis for few resources', async () => {
    const registry = new RuntimeRegistry();
    registry.registerResource('r1', new ResourceRuntime({ rid: 'r1', state: 'created' }));
    const evo = new RuntimeEvolution({ registry });
    const opps = await evo.detect();
    expect(opps.find(o => o.type === 'low_analysis')).toBeUndefined();
  });

  test('detect flags evolution stagnation for many analyzed resources', async () => {
    const registry = new RuntimeRegistry();
    for (let i = 0; i < 21; i++) {
      registry.registerResource(`r${  i}`, new ResourceRuntime({ rid: `r${  i}`, state: 'analyzed' }));
    }
    const evo = new RuntimeEvolution({ registry });
    const opps = await evo.detect();
    const stag = opps.find(o => o.type === 'evolution_stagnation');
    expect(stag).toBeTruthy();
    expect(stag.affectedCount).toBe(21);
  });

  test('detect does not flag stagnation for few analyzed resources', async () => {
    const registry = new RuntimeRegistry();
    for (let i = 0; i < 5; i++) {
      registry.registerResource(`r${  i}`, new ResourceRuntime({ rid: `r${  i}`, state: 'analyzed' }));
    }
    const evo = new RuntimeEvolution({ registry });
    const opps = await evo.detect();
    expect(opps.find(o => o.type === 'evolution_stagnation')).toBeUndefined();
  });

  test('detect emits an event when opportunities are found', async () => {
    const emit = jest.fn();
    const registry = new RuntimeRegistry();
    registry.registerResource('r1', new ResourceRuntime({ rid: 'r1', state: 'created' }));
    const evo = new RuntimeEvolution({ registry, context: new RuntimeContext({ eventBus: { emit } }) });
    const opps = await evo.detect();
    expect(opps).toHaveLength(1);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'runtime.evolution.detected',
      source: 'evolution',
      payload: expect.objectContaining({ opportunities: opps })
    }));
  });

  test('detect does not emit when there are no opportunities', async () => {
    const emit = jest.fn();
    const registry = new RuntimeRegistry();
    registry.registerResource('r1', new ResourceRuntime({ rid: 'r1', state: 'evolved' }));
    const evo = new RuntimeEvolution({ registry, context: new RuntimeContext({ eventBus: { emit } }) });
    await evo.detect();
    expect(emit).not.toHaveBeenCalled();
  });

  test('detect tolerates eventBus errors', async () => {
    const emit = jest.fn(() => { throw new Error('bus'); });
    const registry = new RuntimeRegistry();
    registry.registerResource('r1', new ResourceRuntime({ rid: 'r1', state: 'created' }));
    const evo = new RuntimeEvolution({ registry, context: new RuntimeContext({ eventBus: { emit } }) });
    const opps = await evo.detect();
    expect(opps).toHaveLength(1);
  });

  test('apply maps every opportunity type', async () => {
    const evo = new RuntimeEvolution({});
    const results = await evo.apply([
      { type: 'isolated_resources', affected: ['a', 'b'] },
      { type: 'low_analysis', affected: ['a'] },
      { type: 'evolution_stagnation', affectedCount: 5 },
      { type: 'mystery' }
    ]);
    expect(results).toEqual([
      { type: 'isolated_resources', action: 'suggest_relations', count: 2 },
      { type: 'low_analysis', action: 'trigger_analysis', count: 1 },
      { type: 'evolution_stagnation', action: 'trigger_evolution', count: 5 },
      { type: 'mystery', action: 'unknown', status: 'skipped' }
    ]);
  });

  test('apply returns empty for empty input', async () => {
    const evo = new RuntimeEvolution({});
    expect(await evo.apply([])).toEqual([]);
  });

  test('apply records an error when processing an opportunity throws', async () => {
    const evo = new RuntimeEvolution({});
    const opp = {
      get type() { return 'isolated_resources'; },
      get affected() { throw new Error('bad opp'); }
    };
    const results = await evo.apply([opp]);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ type: 'isolated_resources', action: 'error', error: 'bad opp' });
  });

  test('evolve returns evolved false when nothing needs improving', async () => {
    const evo = new RuntimeEvolution({});
    expect(await evo.evolve()).toEqual({ evolved: false, reason: 'No improvements needed' });
  });

  test('evolve applies detected opportunities', async () => {
    const registry = new RuntimeRegistry();
    registry.registerResource('r1', new ResourceRuntime({ rid: 'r1', state: 'created' }));
    const evo = new RuntimeEvolution({ registry });
    const result = await evo.evolve();
    expect(result.evolved).toBe(true);
    expect(result.opportunities[0].type).toBe('isolated_resources');
    expect(result.results).toEqual([
      { type: 'isolated_resources', action: 'suggest_relations', count: 1 }
    ]);
  });
});
