const Authorization = require('../../src/security/authorization.cjs');

describe('Authorization', () => {
  function makeAuthorization(policyEngine = {}, permissionManager = {}) {
    return new Authorization({ policyEngine, permissionManager });
  }

  test('should reject when no subject in context', async () => {
    const auth = makeAuthorization({ check: jest.fn() });
    const result = await auth.authorize({ subject: null }, 'resource.read', 'r');
    expect(result).toEqual({ allowed: false, reason: 'no subject in context' });
  });

  test('should allow when policyEngine permits', async () => {
    const auth = makeAuthorization({ check: jest.fn().mockResolvedValue({ allowed: true }) });
    const result = await auth.authorize({ subject: { id: 'alice' } }, 'resource.read', 'r');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('access granted');
  });

  test('should deny when policyEngine rejects', async () => {
    const auth = makeAuthorization({ check: jest.fn().mockResolvedValue({ allowed: false, reason: 'nope' }) });
    const result = await auth.authorize({ subject: { id: 'alice' } }, 'resource.read', 'r');
    expect(result).toEqual({ allowed: false, reason: 'nope' });
  });

  test('should treat undefined allowed as allowed', async () => {
    const auth = makeAuthorization({ check: jest.fn().mockResolvedValue({ reason: 'ok' }) });
    const result = await auth.authorize({ subject: { id: 'a' } }, 'x.y', 'r');
    expect(result.allowed).toBe(true);
  });

  test('should catch engine errors', async () => {
    const error = new Error('engine boom');
    const auth = makeAuthorization({ check: jest.fn().mockRejectedValue(error) });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await auth.authorize({ subject: { id: 'a' } }, 'x.y', 'r');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('authorization error: engine boom');
    errSpy.mockRestore();
  });

  test('can should return boolean', async () => {
    const auth = makeAuthorization({ check: jest.fn().mockResolvedValue({ allowed: true }) });
    expect(await auth.can({ subject: { id: 'a' } }, 'x.y')).toBe(true);
  });

  test('batchAuthorize should evaluate each action', async () => {
    const engine = {
      check: jest.fn().mockResolvedValue({ allowed: true })
    };
    const auth = makeAuthorization(engine);
    const results = await auth.batchAuthorize({ subject: { id: 'a' } }, ['a.b', 'c.d'], 'r');
    expect(Object.keys(results)).toEqual(['a.b', 'c.d']);
    expect(results['a.b'].allowed).toBe(true);
    expect(engine.check).toHaveBeenCalledTimes(2);
  });

  test('canAll should return false when any check fails', async () => {
    const engine = {
      check: jest.fn()
        .mockResolvedValueOnce({ allowed: true })
        .mockResolvedValueOnce({ allowed: false })
        .mockResolvedValue({ allowed: true })
    };
    const auth = makeAuthorization(engine);
    expect(await auth.canAll({ subject: { id: 'a' } }, ['a.b', 'c.d'])).toBe(false);
    expect(await auth.canAll({ subject: { id: 'a' } }, ['a.b'])).toBe(true);
  });
});
