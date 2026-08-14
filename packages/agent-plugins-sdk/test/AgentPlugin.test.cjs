const AgentPlugin = require('../src/AgentPlugin.cjs');
const { AgentPluginContext } = require('../src/AgentPluginContext.cjs');

describe('AgentPlugin', () => {
  class GoodPlugin extends AgentPlugin {
    manifest() {
      return { id: 'good', name: '好插件', version: '0.1.0', main: 'index.cjs' };
    }
  }

  it('未实现 manifest 时抛错', () => {
    const p = new AgentPlugin();
    expect(() => p.manifest()).toThrow(/必须实现 manifest/);
  });

  it('id/name/version 快捷访问来自 manifest', () => {
    const p = new GoodPlugin();
    expect(p.id).toBe('good');
    expect(p.name).toBe('好插件');
    expect(p.version).toBe('0.1.0');
  });

  it('manifest 抛错时快捷访问返回兜底值', () => {
    class BadPlugin extends AgentPlugin {}
    const p = new BadPlugin();
    expect(p.id).toBe('');
    expect(p.name).toBe('');
    expect(p.version).toBe('0.0.0');
  });

  it('初始状态为 created,未启用未销毁', () => {
    const p = new GoodPlugin();
    expect(p.state).toBe('created');
    expect(p.isEnabled).toBe(false);
    expect(p.isDisposed).toBe(false);
  });

  it('enable/disable 翻转 enabled 标志', async () => {
    const p = new GoodPlugin();
    await p.enable();
    expect(p.isEnabled).toBe(true);
    await p.disable();
    expect(p.isEnabled).toBe(false);
  });

  it('context 注入与 $setContext 生效', () => {
    const p = new GoodPlugin();
    const ctx = new AgentPluginContext({ pluginId: 'good' });
    p.$setContext(ctx);
    expect(p.context).toBe(ctx);
  });

  it('context setter 兼容宿主直接赋值', () => {
    const p = new GoodPlugin();
    const ctx = {};
    p.context = ctx;
    expect(p.context).toBe(ctx);
  });

  it('$manifest 未注入时返回 manifest()', () => {
    const p = new GoodPlugin();
    expect(p.$manifest.id).toBe('good');
  });

  it('dispose 置为已销毁', async () => {
    const p = new GoodPlugin();
    await p.dispose();
    expect(p.isDisposed).toBe(true);
    expect(p.isEnabled).toBe(false);
  });
});
