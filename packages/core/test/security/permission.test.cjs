const Permission = require('../../src/security/permission.cjs');

describe('Permission', () => {
  test('should throw without code', () => {
    expect(() => new Permission()).toThrow('Permission code is required');
    expect(() => new Permission('')).toThrow('Permission code is required');
  });

  test('should resolve builtin permission', () => {
    const p = new Permission('resource.read');
    expect(p.code).toBe('resource.read');
    expect(p.domain).toBe('resource');
    expect(p.action).toBe('read');
    expect(p.description).toBeTruthy();
  });

  test('should parse custom permission code', () => {
    const p = new Permission('custom.foo.bar');
    expect(p.domain).toBe('custom');
    expect(p.action).toBe('foo.bar');
    expect(p.description).toBe('');
  });

  test('wildcard permission should parse', () => {
    const p = new Permission('*');
    expect(p.domain).toBe('*');
    expect(p.action).toBe('*');
    expect(p.description).toBeTruthy();
  });

  test('matches should support wildcard rules', () => {
    const star = new Permission('*');
    expect(star.matches('anything.at.all')).toBe(true);

    expect(new Permission('resource.read').matches('resource.read')).toBe(true);
    expect(new Permission('resource.read').matches('resource.write')).toBe(false);

    const resourceWildcard = new Permission('resource.*');
    expect(resourceWildcard.matches('resource.create')).toBe(true);
    expect(resourceWildcard.matches('relation.create')).toBe(false);

    const other = 'resource.read';
    expect(new Permission('other.read').matches(other)).toBe(false);
  });

  test('matches should accept Permission objects', () => {
    const p = new Permission('resource.read');
    expect(p.matches(new Permission('resource.read'))).toBe(true);
    expect(p.matches(new Permission('resource.write'))).toBe(false);
  });

  test('matches should handle other wildcard patterns', () => {
    expect(new Permission('resource.read').matches('resource.*')).toBe(true);
    expect(new Permission('resource.read').matches('*')).toBe(true);
  });

  test('toString should return code', () => {
    expect(String(new Permission('resource.read'))).toBe('resource.read');
  });

  test('toJSON should expose fields', () => {
    const p = new Permission('resource.read');
    expect(p.toJSON()).toEqual({
      code: 'resource.read',
      domain: 'resource',
      action: 'read',
      description: expect.any(String)
    });
  });

  test('builtins should list non-wildcard permissions', () => {
    const builtins = Permission.builtins;
    expect(builtins).toContain('resource.read');
    expect(builtins).toContain('workflow.execute');
    expect(builtins).not.toContain('*');
    expect(builtins.length).toBeGreaterThan(20);
  });
});
