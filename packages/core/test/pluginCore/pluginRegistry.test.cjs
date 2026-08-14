const PluginRegistry = require('../../src/plugin/pluginRegistry.cjs');

function makePlugin(id, state) {
  return {
    id,
    name: `Name ${id}`,
    version: '1.0.0',
    state: state || 'created'
  };
}

describe('PluginRegistry', () => {
  test('register/get/has/size', () => {
    const reg = new PluginRegistry();
    const p = makePlugin('a');
    reg.register(p);
    expect(reg.get('a')).toBe(p);
    expect(reg.has('a')).toBe(true);
    expect(reg.has('b')).toBe(false);
    expect(reg.size).toBe(1);
  });

  test('register throws when plugin has no id', () => {
    const reg = new PluginRegistry();
    expect(() => reg.register({})).toThrow('must have an id');
  });

  test('register throws on duplicate id', () => {
    const reg = new PluginRegistry();
    reg.register(makePlugin('a'));
    expect(() => reg.register(makePlugin('a'))).toThrow('already registered');
  });

  test('unregister removes a plugin', () => {
    const reg = new PluginRegistry();
    reg.register(makePlugin('a'));
    reg.unregister('a');
    expect(reg.has('a')).toBe(false);
    expect(reg.size).toBe(0);
  });

  test('unregister throws when plugin not found', () => {
    const reg = new PluginRegistry();
    expect(() => reg.unregister('zzz')).toThrow('not found');
  });

  test('get returns undefined for missing id', () => {
    const reg = new PluginRegistry();
    expect(reg.get('nope')).toBeUndefined();
  });

  test('list returns plugin summaries', () => {
    const reg = new PluginRegistry();
    reg.register(makePlugin('a', 'enabled'));
    reg.register(makePlugin('b', 'disabled'));
    const list = reg.list();
    expect(list).toEqual([
      { id: 'a', name: 'Name a', version: '1.0.0', state: 'enabled' },
      { id: 'b', name: 'Name b', version: '1.0.0', state: 'disabled' }
    ]);
  });

  test('filterByState returns matching plugins', () => {
    const reg = new PluginRegistry();
    const a = makePlugin('a', 'enabled');
    const b = makePlugin('b', 'disabled');
    reg.register(a);
    reg.register(b);
    expect(reg.filterByState('enabled')).toEqual([a]);
    expect(reg.filterByState('missing')).toEqual([]);
  });

  test('forEach iterates plugins', () => {
    const reg = new PluginRegistry();
    reg.register(makePlugin('a'));
    reg.register(makePlugin('b'));
    const seen = [];
    reg.forEach((p) => seen.push(p.id));
    expect(seen.sort()).toEqual(['a', 'b']);
  });

  test('plugins returns all instances', () => {
    const reg = new PluginRegistry();
    const a = makePlugin('a');
    const b = makePlugin('b');
    reg.register(a);
    reg.register(b);
    expect(reg.plugins).toEqual([a, b]);
  });
});
