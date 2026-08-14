const Role = require('../../src/security/role.cjs');

describe('Role', () => {
  test('should throw without id', () => {
    expect(() => new Role()).toThrow('Role must have an id');
    expect(() => new Role({})).toThrow('Role must have an id');
  });

  test('should apply defaults', () => {
    const r = new Role({ id: 'r1' });
    expect(r.id).toBe('r1');
    expect(r.name).toBe('r1');
    expect(r.description).toBe('');
    expect(r.permissionCodes).toEqual([]);
  });

  test('should build permission objects', () => {
    const r = new Role({ id: 'r2', name: 'R2', description: 'desc', permissions: ['resource.read', 'relation.*'] });
    expect(r.permissionCodes).toEqual(['resource.read', 'relation.*']);
    expect(r.permissions[0]).toBeInstanceOf(require('../../src/security/permission.cjs'));
  });

  test('hasPermission should match exact and wildcard', () => {
    const r = new Role({ id: 'r3', permissions: ['resource.read', 'resource.*'] });
    expect(r.hasPermission('resource.read')).toBe(true);
    expect(r.hasPermission('resource.write')).toBe(true);
    expect(r.hasPermission('relation.read')).toBe(false);
  });

  test('toJSON should expose permission codes', () => {
    const r = new Role({ id: 'r4', name: 'R4', description: 'd', permissions: ['a.b'] });
    expect(r.toJSON()).toEqual({
      id: 'r4',
      name: 'R4',
      description: 'd',
      permissions: ['a.b']
    });
  });

  test('fromJSON should round-trip', () => {
    const r = Role.fromJSON({ id: 'r5', permissions: ['x.y'] });
    expect(r).toBeInstanceOf(Role);
    expect(r.hasPermission('x.y')).toBe(true);
  });

  test('builtins should include owner, admin, editor, viewer', () => {
    const roles = Role.builtins();
    const ids = roles.map(r => r.id);
    expect(ids).toEqual(expect.arrayContaining(['owner', 'admin', 'editor', 'viewer', 'ai-agent']));

    const owner = Role.getBuiltin('owner');
    expect(owner.hasPermission('anything')).toBe(true);

    const viewer = Role.getBuiltin('viewer');
    expect(viewer.hasPermission('resource.read')).toBe(true);
    expect(viewer.hasPermission('resource.write')).toBe(false);
  });

  test('getBuiltin should return null for unknown id', () => {
    expect(Role.getBuiltin('nope')).toBeNull();
  });
});
