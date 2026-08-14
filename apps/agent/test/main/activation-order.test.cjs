const { resolveActivationOrder } = require('../../src/main/plugin/activation-order.cjs');

const makePlugin = (id, dependsOn) => ({ id, manifest: { id, name: id, dependsOn } });

describe('resolveActivationOrder', () => {
  it('无依赖按原顺序', () => {
    const plugins = [makePlugin('a'), makePlugin('b')];
    expect(resolveActivationOrder(plugins)).toEqual({ ordered: ['a', 'b'], cycles: [] });
  });

  it('多组链式依赖：各组提供者先激活', () => {
    const plugins = [
      makePlugin('consumer', ['provider']),
      makePlugin('provider'),
      makePlugin('base', ['other']),
      makePlugin('other'),
    ];
    const { ordered, cycles } = resolveActivationOrder(plugins);
    expect(cycles).toEqual([]);
    expect(ordered.indexOf('provider')).toBeLessThan(ordered.indexOf('consumer'));
    expect(ordered.indexOf('other')).toBeLessThan(ordered.indexOf('base'));
  });

  it('菱形依赖：根依赖只激活一次', () => {
    const plugins = [
      makePlugin('app', ['lib-a', 'lib-b']),
      makePlugin('lib-a', ['core']),
      makePlugin('lib-b', ['core']),
      makePlugin('core'),
    ];
    const { ordered, cycles } = resolveActivationOrder(plugins);
    expect(cycles).toEqual([]);
    expect(ordered.length).toBe(4);
    expect(new Set(ordered).size).toBe(4);
    for (const dep of ['lib-a', 'lib-b']) {
      expect(ordered.indexOf('core')).toBeLessThan(ordered.indexOf(dep));
    }
    expect(ordered.indexOf('app')).toBeGreaterThan(ordered.indexOf('lib-a'));
    expect(ordered.indexOf('app')).toBeGreaterThan(ordered.indexOf('lib-b'));
  });

  it('依赖不存在的插件被忽略', () => {
    const plugins = [makePlugin('consumer', ['missing-provider']), makePlugin('provider')];
    const { ordered, cycles } = resolveActivationOrder(plugins);
    expect(cycles).toEqual([]);
    expect(ordered).toEqual(['consumer', 'provider']);
  });

  it('依赖自身被忽略（manifest 校验也会拒绝）', () => {
    const plugins = [makePlugin('self', ['self'])];
    expect(resolveActivationOrder(plugins)).toEqual({ ordered: ['self'], cycles: [] });
  });

  it('循环依赖：稳定兜底按原顺序，并标记 cycle 节点', () => {
    const plugins = [makePlugin('a', ['b']), makePlugin('b', ['a'])];
    const { ordered, cycles } = resolveActivationOrder(plugins);
    expect(ordered).toEqual(['a', 'b']);
    expect(cycles.sort()).toEqual(['a', 'b']);
  });

  it('空数组', () => {
    expect(resolveActivationOrder([])).toEqual({ ordered: [], cycles: [] });
  });
});