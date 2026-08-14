const { AgentPluginContext } = require('../src/AgentPluginContext.cjs');
const { createExtensionsFacade, EXTENSIONS_METHODS } = require('../src/extensions-facade.cjs');

describe('extensions-facade', () => {
  it('未注入实现时调用抛错', () => {
    const ctx = new AgentPluginContext({});
    expect(() => ctx.extensions.registerCommands([{ id: 'x', handler: () => {} }])).toThrow(/未注入/);
    expect(() => ctx.extensions.registerView({})).toThrow(/未注入/);
  });

  it('注入 extensionsImpl 后透传契约方法', () => {
    const registerCommands = jest.fn();
    const ctx = new AgentPluginContext({
      extensionsImpl: { registerCommands },
    });
    const defs = [{ id: 'demo.hello', title: 'Hello', handler: () => 'hi' }];
    ctx.extensions.registerCommands(defs);
    expect(registerCommands).toHaveBeenCalledWith(defs);
  });

  it('extensionsImpl 只透传契约方法，不透传未声明方法', () => {
    const ctx = new AgentPluginContext({
      extensionsImpl: { registerCommands: jest.fn(), hidden: jest.fn() },
    });
    expect(ctx.extensions.hidden).toBeUndefined();
    expect(typeof ctx.extensions.registerCommands).toBe('function');
  });

  it('EXTENSIONS_METHODS 导出契约方法白名单', () => {
    expect(EXTENSIONS_METHODS).toEqual([
      'registerCommands',
      'registerView',
      'registerPanel',
      'registerEditor',
      'registerService',
      'getService',
      'listServices',
    ]);
  });

  it('createExtensionsFacade 直接构造门面', () => {
    const reg = jest.fn();
    const facade = createExtensionsFacade({ registerCommands: reg }, { pluginId: 'p' });
    facade.registerCommands([{ id: 'a', handler: () => {} }]);
    expect(reg).toHaveBeenCalled();
    expect(() => facade.registerView({})).toThrow(/未注入/);
  });

  it('服务能力：registerService/getService/listServices 经门面透传', () => {
    const registerService = jest.fn();
    const getService = jest.fn(() => ({ stats: () => 42 }));
    const listServices = jest.fn(() => [{ id: 'a.svc', pluginId: 'a' }]);
    const facade = createExtensionsFacade(
      { registerService, getService, listServices },
      { pluginId: 'demo' },
    );
    const def = { id: 'demo.health', title: '健康', api: { stats: async () => 42 } };
    facade.registerService(def);
    expect(registerService).toHaveBeenCalledWith(def);
    expect(facade.getService('demo.health').stats()).toBe(42);
    expect(facade.listServices()).toEqual([{ id: 'a.svc', pluginId: 'a' }]);
    expect(listServices).toHaveBeenCalled();
  });

  it('服务能力未注入实现时抛错', () => {
    const facade = createExtensionsFacade(null, { pluginId: 'p' });
    expect(() => facade.registerService({ id: 'x', api: {} })).toThrow(/未注入/);
    expect(() => facade.getService('x')).toThrow(/未注入/);
    expect(() => facade.listServices()).toThrow(/未注入/);
  });
});
