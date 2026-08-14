const { createExtensionPoint, EXTENSION_TYPES } = require('../src/extension-point.cjs');

describe('createExtensionPoint', () => {
  it('构造纯数据扩展点（无 handler）', () => {
    const point = createExtensionPoint({
      pluginId: 'demo',
      type: 'commands',
      id: 'demo.open',
      title: '打开',
      metadata: { foo: 1 },
    });
    expect(point).toEqual({
      pluginId: 'demo',
      type: 'commands',
      id: 'demo.open',
      title: '打开',
      metadata: { foo: 1 },
    });
    expect(point.handler).toBeUndefined();
  });

  it('省略可选字段', () => {
    const point = createExtensionPoint({ pluginId: 'demo', type: 'views', id: 'v1' });
    expect(point).toEqual({ pluginId: 'demo', type: 'views', id: 'v1' });
  });

  it('校验失败抛错', () => {
    expect(() => createExtensionPoint({ type: 'views', id: 'v1' })).toThrow(/pluginId/);
    expect(() => createExtensionPoint({ pluginId: 'd', type: 'unknown', id: 'x' })).toThrow(/type/);
    expect(() => createExtensionPoint({ pluginId: 'd', type: 'views' })).toThrow(/id/);
    expect(() => createExtensionPoint({ pluginId: 'd', type: 'views', id: 'x', metadata: 'bad' })).toThrow(/metadata/);
  });

  it('EXTENSION_TYPES 包含五类', () => {
    expect(EXTENSION_TYPES).toEqual(['commands', 'views', 'panels', 'editors', 'services']);
  });
});
