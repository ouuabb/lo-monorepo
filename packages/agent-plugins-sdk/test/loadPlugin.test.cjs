const { createPlugin } = require('../src/loadPlugin.cjs');
const AgentPlugin = require('../src/AgentPlugin.cjs');

class GoodPlugin extends AgentPlugin {
  manifest() {
    return { id: 'good', name: '好插件', version: '0.1.0', main: 'index.cjs' };
  }
}

class BadManifestPlugin extends AgentPlugin {
  manifest() {
    return { id: 'Bad!', version: 'not-semver' };
  }
}

describe('createPlugin', () => {
  it('实例化插件类并返回实例', () => {
    const plugin = createPlugin(GoodPlugin);
    expect(plugin).toBeInstanceOf(AgentPlugin);
    expect(plugin.id).toBe('good');
  });

  it('接受已实例化对象', () => {
    const plugin = createPlugin(new GoodPlugin());
    expect(plugin.id).toBe('good');
  });

  it('非法 manifest 抛错', () => {
    expect(() => createPlugin(BadManifestPlugin)).toThrow(/manifest 非法/);
  });

  it('非类/非对象抛错', () => {
    expect(() => createPlugin('nope')).toThrow(/插件类或实例/);
    expect(() => createPlugin(undefined)).toThrow(/插件类或实例/);
  });

  it('未实现契约的类抛错', () => {
    class NotPlugin {}
    expect(() => createPlugin(NotPlugin)).toThrow(/必须实现 manifest/);
  });
});
