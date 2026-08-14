const ResourceGuard = require('../../src/security/resourceGuard.cjs');

describe('ResourceGuard', () => {
  test('should allow when access control grants', async () => {
    const guard = new ResourceGuard({
      accessControl: { can: jest.fn().mockResolvedValue(true) }
    });
    const result = await guard.guard('read', { id: 'a' }, 'r1');
    expect(result).toEqual({ allowed: true, reason: 'allowed' });
  });

  test('should deny and warn when access control rejects', async () => {
    const warn = jest.fn();
    const guard = new ResourceGuard({
      accessControl: { can: jest.fn().mockResolvedValue(false) },
      logger: { warn }
    });
    const result = await guard.guard('write', { id: 'a' }, 'r1');
    expect(result).toEqual({ allowed: false, reason: 'resource.write denied on r1' });
    expect(warn).toHaveBeenCalled();
  });

  test('guardAll should evaluate each action', async () => {
    const guard = new ResourceGuard({
      accessControl: { can: jest.fn().mockResolvedValue(true) }
    });
    const results = await guard.guardAll(['read', 'write', 'delete'], { id: 'a' }, 'r1');
    expect(Object.keys(results)).toEqual(['read', 'write', 'delete']);
    expect(results.read.allowed).toBe(true);
  });
});
