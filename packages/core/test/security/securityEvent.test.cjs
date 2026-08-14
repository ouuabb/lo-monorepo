const SecurityEvent = require('../../src/security/securityEvent.cjs');

describe('SecurityEvent', () => {
  test('emit should do nothing without eventBus', () => {
    const se = new SecurityEvent(null);
    expect(() => se.emit({ type: 'x' })).not.toThrow();
  });

  test('emit should publish wrapped event to bus', () => {
    const emit = jest.fn();
    const se = new SecurityEvent({ emit });
    se.emit({ type: 'security.access.denied', severity: 'warning', actor: 'a', action: 'read', resource: 'r', payload: { extra: 1 } });
    expect(emit).toHaveBeenCalledTimes(1);
    const [event] = emit.mock.calls[0];
    expect(event.type).toBe('security.access.denied');
    expect(event.source).toBe('security');
    expect(event.payload.severity).toBe('warning');
    expect(event.payload.actor).toBe('a');
    expect(event.payload.action).toBe('read');
    expect(event.payload.resource).toBe('r');
    expect(event.payload.extra).toBe(1);
    expect(typeof event.payload.timestamp).toBe('number');
  });

  test('emit should default type and severity', () => {
    const emit = jest.fn();
    const se = new SecurityEvent({ emit });
    se.emit({ actor: 'a' });
    expect(emit.mock.calls[0][0].type).toBe('security.event');
    expect(emit.mock.calls[0][0].payload.severity).toBe('info');
  });

  test('emit should swallow bus errors', () => {
    const emit = jest.fn(() => { throw new Error('bus down'); });
    const se = new SecurityEvent({ emit });
    expect(() => se.emit({ type: 'x' })).not.toThrow();
  });

  test('convenience methods should publish typed events', () => {
    const emit = jest.fn();
    const se = new SecurityEvent({ emit });

    se.accessGranted('a', 'read', 'r');
    expect(emit.mock.calls.at(-1)[0].type).toBe('security.access.granted');

    se.accessDenied('a', 'read', 'r');
    expect(emit.mock.calls.at(-1)[0].type).toBe('security.access.denied');

    se.policyChanged('a', 'p1');
    expect(emit.mock.calls.at(-1)[0].payload.policyId).toBe('p1');

    se.identityCreated('a', 'u1');
    expect(emit.mock.calls.at(-1)[0].payload.identityId).toBe('u1');

    se.tokenExpired('u1', 't1');
    expect(emit.mock.calls.at(-1)[0].payload.tokenId).toBe('t1');

    se.credentialRevoked('a', 'c1');
    expect(emit.mock.calls.at(-1)[0].payload.credentialId).toBe('c1');

    se.auditAnomaly('a', { n: 5 });
    expect(emit.mock.calls.at(-1)[0].type).toBe('security.audit.anomaly');
    expect(emit.mock.calls.at(-1)[0].payload).toMatchObject({ n: 5 });
  });
});
