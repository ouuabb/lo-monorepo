const {
  CAPABILITY_TYPES,
  DEFAULT_PERMISSIONS,
  PERMISSION_LO,
  resolvePermissions,
} = require('../src/types.cjs');

describe('types (capability/permission)', () => {
  it('CAPABILITY_TYPES 包含扩展点类型', () => {
    expect(CAPABILITY_TYPES).toEqual(['commands', 'views', 'panels', 'editors', 'services']);
  });

  it('DEFAULT_PERMISSIONS 最小权限（只读）', () => {
    expect(DEFAULT_PERMISSIONS).toEqual({
      lo: [
        'operations.read',
        'relations.read',
        'events.read',
        'resources.read',
        'health.read',
      ],
      storage: false,
      network: false,
      shell: false,
    });
  });

  it('PERMISSION_LO 定义协议能力常量', () => {
    expect(PERMISSION_LO.READ_OPS).toBe('operations.read');
    expect(PERMISSION_LO.WRITE_OPS).toBe('operations.write');
    expect(PERMISSION_LO.READ_REL).toBe('relations.read');
  });

  it('resolvePermissions 合并默认值', () => {
    expect(resolvePermissions()).toEqual(DEFAULT_PERMISSIONS);
    expect(resolvePermissions({ lo: ['operations.read'], storage: true })).toEqual({
      lo: ['operations.read'],
      storage: true,
      network: false,
      shell: false,
    });
  });
});
