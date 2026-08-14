const ExtensionRegistry = require('../../src/plugin/extensionRegistry.cjs');

describe('ExtensionRegistry', () => {
  test('registers and retrieves extensions', () => {
    const reg = new ExtensionRegistry();
    const handler = { run: () => {} };
    reg.register('p1', 'commands', 'cmd', handler);
    expect(reg.get('commands', 'cmd')).toBe(handler);
    expect(reg.get('commands', 'missing')).toBeUndefined();
  });

  test('register throws on unknown extension type', () => {
    const reg = new ExtensionRegistry();
    expect(() => reg.register('p1', 'nope', 'k', () => {})).toThrow('Unknown extension type');
  });

  test('register throws on duplicate key', () => {
    const reg = new ExtensionRegistry();
    reg.register('p1', 'commands', 'cmd', () => {});
    expect(() => reg.register('p2', 'commands', 'cmd', () => {})).toThrow('already registered by');
  });

  test('get returns undefined for unknown extension type', () => {
    const reg = new ExtensionRegistry();
    expect(reg.get('nope', 'k')).toBeUndefined();
  });

  test('registerAll handles string and object keys', () => {
    const reg = new ExtensionRegistry();
    reg.registerAll('p1', {
      commands: ['c1', { id: 'c2' }],
      resourceTypes: [{ type: 'markdown' }, 'pdf'],
      renderers: [{ type: 'r1' }]
    });
    expect(reg.get('commands', 'c1')).toBe('c1');
    expect(reg.get('commands', 'c2').id).toBe('c2');
    expect(reg.get('resourceTypes', 'markdown').type).toBe('markdown');
    expect(reg.get('resourceTypes', 'pdf')).toBe('pdf');
    expect(reg.get('renderers', 'r1').type).toBe('r1');
  });

  test('registerAll ignores contributes with no extensions and falsy keys', () => {
    const reg = new ExtensionRegistry();
    expect(() => reg.registerAll('p1', null)).not.toThrow();
    expect(() => reg.registerAll('p1', {})).not.toThrow();
    reg.registerAll('p1', { commands: [{}, { id: '' }, { type: '' }] });
    expect(reg.list('commands')).toEqual([]);
  });

  test('registerAll skips undefined extension type contributions', () => {
    const reg = new ExtensionRegistry();
    reg.registerAll('p1', { bogusType: ['x'] });
    expect(reg.types()).not.toContain('bogusType');
  });

  test('list returns extension summaries', () => {
    const reg = new ExtensionRegistry();
    const handler = { v: 1 };
    reg.register('p1', 'commands', 'c1', handler);
    expect(reg.list('commands')).toEqual([{ key: 'c1', pluginId: 'p1', handler }]);
    expect(reg.list('nope')).toEqual([]);
  });

  test('types lists all registered extension points', () => {
    const reg = new ExtensionRegistry();
    const types = reg.types();
    expect(types).toEqual(expect.arrayContaining([
      'resourceTypes', 'relationTypes', 'commands', 'renderers', 'importers',
      'exporters', 'searchProviders', 'views', 'resourceProviders'
    ]));
  });

  test('unregisterAll removes only matching pluginId', () => {
    const reg = new ExtensionRegistry();
    reg.register('p1', 'commands', 'c1', () => {});
    reg.register('p2', 'commands', 'c2', () => {});
    reg.register('p1', 'views', 'v1', () => {});
    reg.unregisterAll('p1');
    expect(reg.get('commands', 'c1')).toBeUndefined();
    expect(reg.get('commands', 'c2')).toBeDefined();
    expect(reg.get('views', 'v1')).toBeUndefined();
  });

  test('hasResourceType / resourceTypes / relationTypes / commands', () => {
    const reg = new ExtensionRegistry();
    expect(reg.hasResourceType('markdown')).toBe(false);
    reg.registerAll('p1', {
      resourceTypes: [{ type: 'markdown' }],
      relationTypes: ['rel'],
      commands: ['c']
    });
    expect(reg.hasResourceType('markdown')).toBe(true);
    expect(reg.resourceTypes()).toEqual(['markdown']);
    expect(reg.relationTypes()).toEqual(['rel']);
    expect(reg.commands()).toEqual(['c']);
  });
});
