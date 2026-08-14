const RuntimeRegistry = require('../../src/runtime/runtimeRegistry.cjs');

describe('RuntimeRegistry', () => {
  test('registerResource and getResource round trip', () => {
    const reg = new RuntimeRegistry();
    const inst = { rid: 'r1' };
    reg.registerResource('r1', inst);
    expect(reg.getResource('r1')).toBe(inst);
  });

  test('getResource returns null for missing', () => {
    const reg = new RuntimeRegistry();
    expect(reg.getResource('missing')).toBeNull();
  });

  test('unregisterResource removes and reports success', () => {
    const reg = new RuntimeRegistry();
    reg.registerResource('r1', {});
    expect(reg.unregisterResource('r1')).toBe(true);
    expect(reg.unregisterResource('r1')).toBe(false);
    expect(reg.getResource('r1')).toBeNull();
  });

  test('resources getter returns all registered resources', () => {
    const reg = new RuntimeRegistry();
    reg.registerResource('a', { rid: 'a' });
    reg.registerResource('b', { rid: 'b' });
    expect(reg.resources).toEqual([{ rid: 'a' }, { rid: 'b' }]);
  });

  test('registerAgent and getAgent round trip', () => {
    const reg = new RuntimeRegistry();
    const inst = { agentId: 'a1' };
    reg.registerAgent('a1', inst);
    expect(reg.getAgent('a1')).toBe(inst);
    expect(reg.getAgent('missing')).toBeNull();
    expect(reg.unregisterAgent('a1')).toBe(true);
    expect(reg.agents).toEqual([]);
  });

  test('registerWorkflow and getWorkflow round trip', () => {
    const reg = new RuntimeRegistry();
    const inst = { wfId: 'w1' };
    reg.registerWorkflow('w1', inst);
    expect(reg.getWorkflow('w1')).toBe(inst);
    expect(reg.getWorkflow('missing')).toBeNull();
    expect(reg.unregisterWorkflow('w1')).toBe(true);
    expect(reg.workflows).toEqual([]);
  });

  test('registerPlugin and getPlugin round trip', () => {
    const reg = new RuntimeRegistry();
    const inst = { pluginId: 'p1' };
    reg.registerPlugin('p1', inst);
    expect(reg.getPlugin('p1')).toBe(inst);
    expect(reg.getPlugin('missing')).toBeNull();
    expect(reg.unregisterPlugin('p1')).toBe(true);
    expect(reg.plugins).toEqual([]);
  });

  test('stats reports counts and total', () => {
    const reg = new RuntimeRegistry();
    expect(reg.stats()).toEqual({ resources: 0, agents: 0, workflows: 0, plugins: 0, total: 0 });
    reg.registerResource('r', {});
    reg.registerResource('r2', {});
    reg.registerAgent('a', {});
    reg.registerWorkflow('w', {});
    reg.registerPlugin('p', {});
    expect(reg.stats()).toEqual({ resources: 2, agents: 1, workflows: 1, plugins: 1, total: 5 });
  });

  test('clear empties all registries', () => {
    const reg = new RuntimeRegistry();
    reg.registerResource('r', {});
    reg.registerAgent('a', {});
    reg.registerWorkflow('w', {});
    reg.registerPlugin('p', {});
    reg.clear();
    expect(reg.stats()).toEqual({ resources: 0, agents: 0, workflows: 0, plugins: 0, total: 0 });
    expect(reg.resources).toEqual([]);
    expect(reg.agents).toEqual([]);
    expect(reg.workflows).toEqual([]);
    expect(reg.plugins).toEqual([]);
  });

  test('overwriting an id replaces the previous instance', () => {
    const reg = new RuntimeRegistry();
    reg.registerResource('r', { v: 1 });
    reg.registerResource('r', { v: 2 });
    expect(reg.getResource('r')).toEqual({ v: 2 });
    expect(reg.resources).toHaveLength(1);
  });
});
