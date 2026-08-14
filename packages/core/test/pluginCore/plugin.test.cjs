const Plugin = require('../../src/plugin/plugin.cjs');

class GoodPlugin extends Plugin {
  manifest() {
    return { id: 'p1', name: 'My Plugin', version: '1.2.3', dependencies: ['depA'], contributes: { commands: ['x'] } };
  }
}

class NoNamePlugin extends Plugin {
  manifest() {
    return { id: 'p2' };
  }
}

class NoDepsPlugin extends Plugin {
  manifest() {
    return { id: 'p3', name: 'P3', version: '1.0.0' };
  }
}

class NoIdPlugin extends Plugin {
  manifest() {
    return { name: 'Only Name' };
  }
}

describe('Plugin base class', () => {
  test('constructor initializes state', () => {
    const p = new GoodPlugin();
    expect(p._state).toBe('created');
    expect(p.state).toBe('created');
    expect(p._context).toBeNull();
    expect(p._enabled).toBe(false);
    expect(p._disposed).toBe(false);
  });

  test('manifest() throws by default', () => {
    const p = new Plugin();
    expect(() => p.manifest()).toThrow('must be implemented');
  });

  test('register() is a no-op default implementation', () => {
    const p = new Plugin();
    expect(() => p.register({})).not.toThrow();
  });

  test('$setContext injects context', () => {
    const p = new GoodPlugin();
    const ctx = { marker: 1 };
    p.$setContext(ctx);
    expect(p.context).toBe(ctx);
  });

  test('context getter/setter are preserved for backwards compatibility', () => {
    const p = new GoodPlugin();
    const ctx = { marker: 2 };
    p.context = ctx;
    expect(p.context).toBe(ctx);
  });

  test('id/name/version getters read from manifest', () => {
    const p = new GoodPlugin();
    expect(p.id).toBe('p1');
    expect(p.name).toBe('My Plugin');
    expect(p.version).toBe('1.2.3');
  });

  test('name falls back to id when name missing', () => {
    expect(new NoNamePlugin().name).toBe('p2');
  });

  test('version defaults to 0.0.0 when missing', () => {
    expect(new NoNamePlugin().version).toBe('0.0.0');
  });

  test('dependencies defaults to empty array', () => {
    expect(new NoDepsPlugin().dependencies).toEqual([]);
    expect(new GoodPlugin().dependencies).toEqual(['depA']);
  });

  test('contributes defaults to empty object', () => {
    expect(new NoDepsPlugin().contributes).toEqual({});
    expect(new GoodPlugin().contributes).toEqual({ commands: ['x'] });
  });

  test('state setter updates state', () => {
    const p = new GoodPlugin();
    p.state = 'loaded';
    expect(p.state).toBe('loaded');
  });

  test('initialize is an async no-op', async () => {
    const p = new GoodPlugin();
    await expect(p.initialize()).resolves.toBeUndefined();
  });

  test('enable sets _enabled', async () => {
    const p = new GoodPlugin();
    await p.enable();
    expect(p.isEnabled).toBe(true);
  });

  test('disable clears _enabled', async () => {
    const p = new GoodPlugin();
    await p.enable();
    await p.disable();
    expect(p.isEnabled).toBe(false);
  });

  test('dispose clears enabled and marks disposed', async () => {
    const p = new GoodPlugin();
    await p.enable();
    await p.dispose();
    expect(p.isEnabled).toBe(false);
    expect(p.isDisposed).toBe(true);
  });

  test('$manifest returns injected _manifest when present', () => {
    const p = new GoodPlugin();
    p._manifest = { id: 'override' };
    expect(p.$manifest).toEqual({ id: 'override' });
  });

  test('$manifest falls back to manifest()', () => {
    const p = new GoodPlugin();
    expect(p.$manifest.id).toBe('p1');
  });

  test('id returns empty string when manifest has no id', () => {
    expect(new NoIdPlugin().id).toBe('');
  });

  test('name returns manifest name when id missing', () => {
    expect(new NoIdPlugin().name).toBe('Only Name');
  });
});
