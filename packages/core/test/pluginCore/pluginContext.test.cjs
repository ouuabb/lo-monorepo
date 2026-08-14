const PluginContext = require('../../src/plugin/pluginContext.cjs');

describe('PluginContext', () => {
  test('constructor defaults', () => {
    const ctx = new PluginContext();
    expect(ctx.repository).toBeNull();
    expect(ctx.logger).toBe(console);
    expect(ctx._configData).toEqual({});
    expect(ctx.extensionRegistry).toBeNull();
    expect(ctx.hookManager).toBeNull();
    expect(ctx.eventBus).toBeNull();
    expect(ctx.pluginId).toBeNull();
  });

  test('config() returns all when key undefined', () => {
    const ctx = new PluginContext({ config: { a: 1 } });
    expect(ctx.config()).toEqual({ a: 1 });
    expect(ctx.config('a')).toBe(1);
    expect(ctx.config('missing', 'def')).toBe('def');
    expect(ctx.config('missing')).toBeUndefined();
  });

  test('config() tolerates null config data', () => {
    const ctx = new PluginContext({ config: null });
    expect(ctx.config()).toEqual({});
    expect(ctx.config('x', 5)).toBe(5);
  });

  test('setConfig throws when no setConfigFn injected', async () => {
    const ctx = new PluginContext({ pluginId: 'plug' });
    await expect(ctx.setConfig('k', 1)).rejects.toThrow('setConfig 未注入');
  });

  test('setConfig delegates to injected fn', async () => {
    const fn = jest.fn(async () => {});
    const ctx = new PluginContext({ pluginId: 'plug', setConfigFn: fn });
    await ctx.setConfig('k', 1);
    expect(fn).toHaveBeenCalledWith('k', 1);
  });

  test('extensions getter returns injected registry or noop', () => {
    const reg = { register() {} };
    expect(new PluginContext({ extensionRegistry: reg }).extensions).toBe(reg);
    const noop = new PluginContext().extensions;
    expect(noop.register()).toBeUndefined();
    expect(noop.get('x')).toBeNull();
    expect(noop.has('x')).toBe(false);
    expect(noop.list()).toEqual([]);
  });

  test('hooks getter returns injected manager or noop', async () => {
    const mgr = { register() {} };
    expect(new PluginContext({ hookManager: mgr }).hooks).toBe(mgr);
    const noop = new PluginContext().hooks;
    expect(await noop.runBefore({ a: 1 })).toEqual({ a: 1 });
    expect(await noop.runAfter('r')).toBe('r');
  });

  test('events getter returns injected bus or noop', () => {
    const bus = { emit() {} };
    expect(new PluginContext({ eventBus: bus }).events).toBe(bus);
    const noop = new PluginContext().events;
    expect(noop.on()).toEqual(expect.any(Function));
    expect(noop.off()).toBeUndefined();
    expect(noop.emit()).toBeUndefined();
  });

  describe('resources facade', () => {
    test('bridges to resourceService', async () => {
      const rs = {
        create: jest.fn(async (c) => ({ id: c.name })),
        getByRid: jest.fn(async () => ({ rid: 'r1' })),
        getAll: jest.fn(async () => [1, 2]),
        update: jest.fn(async () => true),
        delete: jest.fn(async () => true)
      };
      const ctx = new PluginContext({ resourceService: rs });
      const resources = ctx.resources;
      expect(ctx.resources).toBe(resources);
      await resources.create({ name: 'x' });
      await resources.getByRid('r1');
      await resources.list({ q: 1 });
      await resources.update('r1', { p: 1 });
      await resources.delete('r1', true);
      expect(rs.create).toHaveBeenCalledWith({ name: 'x' });
      expect(rs.getByRid).toHaveBeenCalledWith('r1');
      expect(rs.getAll).toHaveBeenCalledWith({ q: 1 });
      expect(rs.update).toHaveBeenCalledWith('r1', { p: 1 });
      expect(rs.delete).toHaveBeenCalledWith('r1', true);
    });

    test('list falls back to list() then empty array', async () => {
      const rsList = { list: jest.fn(async () => [9]) };
      expect(await new PluginContext({ resourceService: rsList }).resources.list()).toEqual([9]);
      const rsNothing = {};
      expect(await new PluginContext({ resourceService: rsNothing }).resources.list()).toEqual([]);
    });

    test('uses repository.resourceService when no service injected', async () => {
      const rs = { create: jest.fn(async () => 'ok') };
      const repo = { resourceService: rs };
      const ctx = new PluginContext({ repository: repo });
      await expect(ctx.resources.create({})).resolves.toBe('ok');
    });

    test('noop resource facade when nothing available', async () => {
      const ctx = new PluginContext();
      await expect(ctx.resources.create({})).rejects.toThrow('未注入');
      expect(await ctx.resources.getByRid('r')).toBeNull();
      expect(await ctx.resources.list()).toEqual([]);
      expect(await ctx.resources.update('r', {})).toBeNull();
      expect(await ctx.resources.delete('r')).toBe(false);
    });

    test('repository without resourceService yields noop facade', async () => {
      const ctx = new PluginContext({ repository: {} });
      await expect(ctx.resources.create({})).rejects.toThrow('未注入');
      expect(await ctx.resources.list()).toEqual([]);
    });
  });

  describe('relations facade', () => {
    test('bridges to relationService', async () => {
      const relSvc = {
        create: jest.fn(async () => ({ id: 1 })),
        listFrom: jest.fn(async () => [1]),
        listTo: jest.fn(async () => [2]),
        remove: jest.fn(async () => true)
      };
      const ctx = new PluginContext({ relationService: relSvc });
      const relations = ctx.relations;
      expect(ctx.relations).toBe(relations);
      await relations.create({ from_rid: 'a', to_rid: 'b', type: 'link', metadata: { m: 1 } });
      await relations.listFrom('a');
      await relations.listTo('b');
      await relations.remove('a', 'b', 'link');
      expect(relSvc.create).toHaveBeenCalledWith('a', 'b', 'link', { m: 1 });
      expect(relSvc.listFrom).toHaveBeenCalledWith('a');
      expect(relSvc.listTo).toHaveBeenCalledWith('b');
      expect(relSvc.remove).toHaveBeenCalledWith('a', 'b', 'link');
    });

    test('missing relationService methods fall back', async () => {
      const relSvc = {};
      const ctx = new PluginContext({ relationService: relSvc });
      expect(await ctx.relations.listFrom('a')).toEqual([]);
      expect(await ctx.relations.listTo('a')).toEqual([]);
      expect(await ctx.relations.remove('a', 'b', 't')).toBe(false);
    });

    test('uses repository.relationService when no service injected', async () => {
      const relSvc = { create: jest.fn(async () => 'rel') };
      const repo = { relationService: relSvc };
      const ctx = new PluginContext({ repository: repo });
      await expect(ctx.relations.create({ from_rid: 'a', to_rid: 'b', type: 't' })).resolves.toBe('rel');
    });

    test('noop relation facade when nothing available', async () => {
      const ctx = new PluginContext();
      await expect(ctx.relations.create({})).rejects.toThrow('未注入');
      expect(await ctx.relations.listFrom('a')).toEqual([]);
      expect(await ctx.relations.listTo('a')).toEqual([]);
      expect(await ctx.relations.remove('a', 'b', 't')).toBe(false);
    });

    test('repository without relationService yields noop facade', async () => {
      const ctx = new PluginContext({ repository: {} });
      await expect(ctx.relations.create({})).rejects.toThrow('未注入');
      expect(await ctx.relations.listFrom('a')).toEqual([]);
    });
  });

  describe('legacy API', () => {
    test('getRepository returns repository or throws', () => {
      const repo = {};
      expect(new PluginContext({ repository: repo }).getRepository()).toBe(repo);
      expect(() => new PluginContext().getRepository()).toThrow('Repository not available');
    });

    test('getConfig behaves like config', () => {
      const ctx = new PluginContext({ config: { a: 1 } });
      expect(ctx.getConfig('a')).toBe(1);
      expect(ctx.getConfig('a', 2)).toBe(1);
      expect(ctx.getConfig('z', 2)).toBe(2);
      expect(ctx.getConfig()).toEqual({ a: 1 });
      expect(new PluginContext().getConfig('z', 3)).toBe(3);
      expect(new PluginContext().getConfig()).toEqual({});
    });

    test('getExtensionRegistry returns registry or throws', () => {
      const reg = {};
      expect(new PluginContext({ extensionRegistry: reg }).getExtensionRegistry()).toBe(reg);
      expect(() => new PluginContext().getExtensionRegistry()).toThrow('ExtensionRegistry not available');
    });

    test('getHookManager returns manager or throws', () => {
      const mgr = {};
      expect(new PluginContext({ hookManager: mgr }).getHookManager()).toBe(mgr);
      expect(() => new PluginContext().getHookManager()).toThrow('HookManager not available');
    });
  });
});
