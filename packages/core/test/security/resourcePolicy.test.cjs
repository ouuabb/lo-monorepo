const ResourcePolicy = require('../../src/security/resourcePolicy.cjs');

describe('ResourcePolicy', () => {
  test('should apply defaults', () => {
    const rp = new ResourcePolicy();
    expect(rp.resourceId).toBe('');
    expect(rp.allow).toEqual([]);
    expect(rp.deny).toEqual([]);
  });

  test('should store provided options', () => {
    const rp = new ResourcePolicy({
      resourceId: 'note:1',
      allow: [{ subjectId: 'alice', permission: 'read' }],
      deny: [{ subjectId: 'bob', permission: 'write' }]
    });
    expect(rp.resourceId).toBe('note:1');
    expect(rp.allow).toHaveLength(1);
    expect(rp.deny).toHaveLength(1);
  });

  test('deny should take precedence over allow', () => {
    const rp = new ResourcePolicy({
      allow: [{ subjectId: 'alice', permission: '*', }],
      deny: [{ subjectId: 'alice', permission: 'write' }]
    });
    expect(rp.check('alice', 'read')).toEqual({ allowed: true, reason: 'allowed_by_acl' });
    expect(rp.check('alice', 'write')).toEqual({ allowed: false, reason: 'denied_by_acl' });
  });

  test('should allow via wildcard permission', () => {
    const rp = new ResourcePolicy({
      allow: [{ subjectId: '*', permission: '*' }]
    });
    expect(rp.check('anyone', 'anything')).toEqual({ allowed: true, reason: 'allowed_by_acl' });
  });

  test('should return null when no rule matches', () => {
    const rp = new ResourcePolicy({
      allow: [{ subjectId: 'alice', permission: 'read' }]
    });
    expect(rp.check('bob', 'read')).toBeNull();
    expect(rp.check('alice', 'write')).toBeNull();
  });

  test('toJSON and fromJSON should round-trip', () => {
    const json = {
      resourceId: 'r',
      allow: [{ subjectId: 'a', permission: 'read' }],
      deny: []
    };
    const rp = ResourcePolicy.fromJSON(json);
    expect(rp).toBeInstanceOf(ResourcePolicy);
    expect(rp.toJSON()).toEqual(json);
  });
});
