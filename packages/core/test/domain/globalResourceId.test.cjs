const GlobalRID = require('../../src/domain/globalResourceId.cjs');

describe('GlobalRID', () => {
  test('should create global ID', () => {
    const gid = GlobalRID.create('personal', 'note001');
    expect(gid).toBe('personal:note001');
  });

  test('should parse global ID', () => {
    const parsed = GlobalRID.parse('personal:note001');
    expect(parsed).not.toBeNull();
    expect(parsed.namespace).toBe('personal');
    expect(parsed.localId).toBe('note001');
  });

  test('should check if ID is global', () => {
    expect(GlobalRID.isGlobal('personal:note001')).toBe(true);
    expect(GlobalRID.isGlobal('res_abc123')).toBe(false);
    expect(GlobalRID.isGlobal('')).toBe(false);
    expect(GlobalRID.isGlobal(null)).toBe(false);
  });

  test('should get namespace from global ID', () => {
    expect(GlobalRID.namespace('personal:note001')).toBe('personal');
    expect(GlobalRID.namespace('invalid')).toBe(null);
  });

  test('should get local ID from global ID', () => {
    expect(GlobalRID.localId('personal:note001')).toBe('note001');
    expect(GlobalRID.localId('res_abc123')).toBe('res_abc123');
  });

  test('should throw error for invalid constructor args', () => {
    expect(() => new GlobalRID()).toThrow();
    expect(() => new GlobalRID('ns')).toThrow();
    expect(() => new GlobalRID('ns:', 'id')).toThrow();
  });

  test('should convert to string', () => {
    const rid = new GlobalRID('project', 'file123');
    expect(rid.toString()).toBe('project:file123');
  });

  test('should return null for invalid parse', () => {
    expect(GlobalRID.parse('')).toBe(null);
    expect(GlobalRID.parse('invalid')).toBe(null);
    expect(GlobalRID.parse(':id')).toBe(null);
    expect(GlobalRID.parse('ns:')).toBe(null);
  });
});