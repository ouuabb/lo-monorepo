const AccessControl = require('../../src/security/accessControl.cjs');

describe('AccessControl', () => {
  function makeAC({ can = jest.fn().mockResolvedValue(true), log = jest.fn(), emitter } = {}) {
    return new AccessControl({
      authorization: { can },
      auditLogger: { log },
      eventEmitter: emitter || null
    });
  }

  test('should allow and audit when authorized', async () => {
    const log = jest.fn();
    const ac = makeAC({ can: jest.fn().mockResolvedValue(true), log });
    const result = await ac.can({ id: 'alice' }, 'note.write', 'r1');
    expect(result).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'alice',
      action: 'note.write',
      resource: 'r1',
      result: 'granted',
      reason: 'access granted'
    }));
  });

  test('should deny and audit when unauthorized', async () => {
    const log = jest.fn();
    const ac = makeAC({ can: jest.fn().mockResolvedValue(false), log });
    const result = await ac.can('bob', 'note.delete', 'r1');
    expect(result).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'bob',
      action: 'note.delete',
      result: 'denied'
    }));
  });

  test('should emit events when emitter present', async () => {
    const emitter = { emit: jest.fn() };
    const ac = makeAC({ can: jest.fn().mockResolvedValue(false), emitter });
    await ac.can({ id: 'alice' }, 'x.y', 'r');
    expect(emitter.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'security.access.denied',
      severity: 'warning',
      actor: 'alice'
    }));
  });

  test('canAll should stop at first denial', async () => {
    const can = jest.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const ac = makeAC({ can });
    expect(await ac.canAll('alice', ['a.b', 'c.d'], 'r')).toBe(false);
    expect(await ac.canAll('alice', ['a.b'], 'r')).toBe(true);
  });
});
