const TypeRegistry = require('../../src/plugin/typeRegistry.cjs');

describe('TypeRegistry', () => {
  let pluginId;

  beforeEach(() => {
    pluginId = `typeTest_${  Date.now()  }_${  Math.floor(Math.random() * 10000)}`;
  });

  afterEach(() => {
    TypeRegistry.unregisterAll(pluginId);
  });

  test('built-in types are supported', () => {
    expect(TypeRegistry.isSupported('a/b.md')).toBe(true);
    expect(TypeRegistry.isSupported('a/b.xyz')).toBe(false);
  });

  test('fromPath recognizes built-in types', () => {
    expect(TypeRegistry.fromPath('x.md')).toBe('note');
    expect(TypeRegistry.fromPath('x.json')).toBe('json');
    expect(TypeRegistry.fromPath('x.zzz')).toBe('unknown');
  });

  test('register makes a plugin extension supported', () => {
    TypeRegistry.register(pluginId, '.EPUB', 'epub');
    expect(TypeRegistry.isSupported('book.EPUB')).toBe(true);
    expect(TypeRegistry.isSupported('book.epub')).toBe(true);
  });

  test('fromPath returns plugin type for registered extension', () => {
    TypeRegistry.register(pluginId, '.epub', 'epub');
    expect(TypeRegistry.fromPath('book.epub')).toBe('epub');
  });

  test('plugin extension does not override built-in type', () => {
    TypeRegistry.register(pluginId, '.md', 'custom');
    expect(TypeRegistry.fromPath('a.md')).toBe('note');
  });

  test('getExtensions merges built-in and plugin extensions', () => {
    TypeRegistry.register(pluginId, '.epub', 'ebook');
    const exts = TypeRegistry.getExtensions('ebook');
    expect(exts).toEqual(['.epub']);
    const noteExts = TypeRegistry.getExtensions('note');
    expect(noteExts).toContain('.md');
  });

  test('getExtensions for unknown type returns plugin extensions only or empty', () => {
    TypeRegistry.register(pluginId, '.custom', 'mystery');
    expect(TypeRegistry.getExtensions('mystery')).toEqual(['.custom']);
    expect(TypeRegistry.getExtensions('nonexistent')).toEqual([]);
  });

  test('unregisterAll removes only that plugin extensions', () => {
    const other = `otherPlugin_${  Date.now()}`;
    TypeRegistry.register(pluginId, '.one', 't1');
    TypeRegistry.register(other, '.two', 't2');
    TypeRegistry.unregisterAll(pluginId);
    expect(TypeRegistry.isSupported('a.one')).toBe(false);
    expect(TypeRegistry.isSupported('a.two')).toBe(true);
    TypeRegistry.unregisterAll(other);
  });

  test('getUnsupportedMessage includes extension', () => {
    const msg = TypeRegistry.getUnsupportedMessage('file.weird');
    expect(msg).toContain('.weird');
    expect(msg).toContain('不支持的文件类型');
  });

  test('getUnsupportedMessage handles files without extension', () => {
    const msg = TypeRegistry.getUnsupportedMessage('noext');
    expect(msg).toContain('(无扩展名)');
  });
});
