const RemoteResource = require('../../src/domain/remoteResource.cjs');

describe('RemoteResource', () => {
  test('should apply defaults', () => {
    const r = new RemoteResource();
    expect(r.globalId).toBe('');
    expect(r.namespace).toBe('');
    expect(r.name).toBe('');
    expect(r.type).toBe('note');
    expect(r.hash).toBe('');
    expect(r.source).toBe('');
    expect(r.lastSync).toBe(0);
  });

  test('should store provided options', () => {
    const r = new RemoteResource({
      globalId: 'docs:note-1',
      namespace: 'docs',
      name: 'Note One',
      type: 'wiki',
      hash: 'abc123',
      source: '/path/to/repo',
      lastSync: 1234567
    });
    expect(r.globalId).toBe('docs:note-1');
    expect(r.namespace).toBe('docs');
    expect(r.name).toBe('Note One');
    expect(r.type).toBe('wiki');
    expect(r.hash).toBe('abc123');
    expect(r.source).toBe('/path/to/repo');
    expect(r.lastSync).toBe(1234567);
  });

  test('fromRow should parse a valid row', () => {
    const r = RemoteResource.fromRow({
      global_id: 'docs:note-1',
      namespace: 'docs',
      metadata: JSON.stringify({ name: 'Note One', type: 'wiki', source: '/remote' }),
      hash: 'abc',
      updated: 99
    });
    expect(r).toBeInstanceOf(RemoteResource);
    expect(r.globalId).toBe('docs:note-1');
    expect(r.namespace).toBe('docs');
    expect(r.name).toBe('Note One');
    expect(r.type).toBe('wiki');
    expect(r.source).toBe('/remote');
    expect(r.lastSync).toBe(99);
  });

  test('fromRow should return null for null row', () => {
    expect(RemoteResource.fromRow(null)).toBeNull();
  });

  test('fromRow should tolerate missing/invalid metadata', () => {
    const r = RemoteResource.fromRow({
      global_id: 'docs:note-2',
      namespace: 'docs',
      metadata: 'not-json{{{',
      hash: 'def'
    });
    expect(r.name).toBe('docs:note-2');
    expect(r.type).toBe('note');
    expect(r.source).toBe('');
  });

  test('fromRow should fall back to global_id as name', () => {
    const r = RemoteResource.fromRow({
      global_id: 'docs:note-3',
      namespace: 'docs',
      metadata: '',
      hash: 'ghi'
    });
    expect(r.name).toBe('docs:note-3');
  });

  test('toRow should serialize for SQL insert', () => {
    const r = new RemoteResource({
      globalId: 'docs:note-4',
      namespace: 'docs',
      name: 'Note Four',
      type: 'note',
      source: '/src',
      hash: 'jkl',
      lastSync: 42
    });
    expect(r.toRow()).toEqual({
      global_id: 'docs:note-4',
      namespace: 'docs',
      metadata: JSON.stringify({ name: 'Note Four', type: 'note', source: '/src' }),
      hash: 'jkl',
      updated: 42
    });
  });

  test('toJSON should expose flat fields and local flag', () => {
    const r = new RemoteResource({
      globalId: 'docs:note-5',
      namespace: 'docs',
      name: 'Note Five',
      hash: 'mno',
      lastSync: 7
    });
    expect(r.toJSON()).toEqual({
      globalId: 'docs:note-5',
      namespace: 'docs',
      name: 'Note Five',
      type: 'note',
      hash: 'mno',
      source: '',
      lastSync: 7,
      local: false
    });
  });
});
