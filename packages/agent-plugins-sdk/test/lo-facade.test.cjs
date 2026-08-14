const { createLoFacade, LO_PERMISSION_MAP } = require('../src/lo-facade.cjs');
const { resolvePermissions } = require('../src/types.cjs');

function makeImpl() {
  return {
    operations: {
      execute: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      undo: jest.fn(),
    },
    relations: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    },
    events: { subscribe: jest.fn(), history: jest.fn() },
    resources: { list: jest.fn(), get: jest.fn(), search: jest.fn() },
    health: { stats: jest.fn() },
  };
}

describe('lo-facade 权限白名单', () => {
  it('未提供 permissions 时不限制（向后兼容）', () => {
    const impl = makeImpl();
    const facade = createLoFacade(impl, { pluginId: 'p' });
    expect(() => facade.operations.execute('resource.update', {})).not.toThrow();
    expect(() => facade.relations.create('a', 'b', 'ref')).not.toThrow();
  });

  it('默认权限（只读）放行读方法，拦截写方法', () => {
    const impl = makeImpl();
    const perms = resolvePermissions(); // 默认只读
    const facade = createLoFacade(impl, { pluginId: 'p', permissions: perms });

    expect(() => facade.operations.list()).not.toThrow();
    expect(() => facade.health.stats()).not.toThrow();
    expect(() => facade.resources.get('r1')).not.toThrow();

    // 写方法未授权
    expect(() => facade.operations.execute('resource.update', {}))
      .toThrow(/被拒绝.*operations\.write/);
    expect(() => facade.relations.create('a', 'b', 'ref'))
      .toThrow(/被拒绝.*relations\.write/);
  });

  it('声明写权限后写方法放行', () => {
    const impl = makeImpl();
    const perms = resolvePermissions({ lo: ['operations.write', 'relations.write'] });
    const facade = createLoFacade(impl, { pluginId: 'p', permissions: perms });

    expect(() => facade.operations.execute('resource.update', {})).not.toThrow();
    expect(() => facade.relations.create('a', 'b', 'ref')).not.toThrow();
  });

  it('部分授权：仅放行声明的能力', () => {
    const impl = makeImpl();
    const perms = resolvePermissions({ lo: ['health.read'] });
    const facade = createLoFacade(impl, { pluginId: 'p', permissions: perms });

    expect(() => facade.health.stats()).not.toThrow();
    expect(() => facade.operations.list()).toThrow(/被拒绝/);
    expect(() => facade.resources.list()).toThrow(/被拒绝/);
  });

  it('LO_PERMISSION_MAP 覆盖全部契约方法', () => {
    for (const [ns, methods] of Object.entries({
      operations: ['execute', 'list', 'get', 'undo'],
      relations: ['list', 'get', 'create', 'update', 'remove'],
      events: ['subscribe', 'history'],
      resources: ['list', 'get', 'search'],
      health: ['stats'],
    })) {
      for (const m of methods) {
        expect(LO_PERMISSION_MAP[ns][m]).toBeDefined();
      }
    }
  });

  it('impl 未注入时调用抛错提示未注入', () => {
    const facade = createLoFacade(null, { pluginId: 'p' });
    expect(() => facade.health.stats()).toThrow(/未注入/);
  });
});
