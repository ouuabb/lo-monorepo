const Policy = require('../../src/security/policy.cjs');

describe('Policy', () => {
  test('should apply defaults', () => {
    const p = new Policy();
    expect(p.id).toBe('');
    expect(p.subject).toBe('*');
    expect(p.resource).toBe('*');
    expect(p.actions).toEqual([]);
    expect(p.effect).toBe('allow');
    expect(p.priority).toBe(0);
    expect(p.condition).toBeNull();
    expect(p.metadata).toEqual({});
  });

  test('should store provided options', () => {
    const p = new Policy({
      id: 'p1', subject: 'user:*', resource: 'note:*', actions: ['read', 'write'],
      effect: 'deny', priority: 10, condition: { field: 'x', op: 'eq', value: 1 }, metadata: { k: 'v' }
    });
    expect(p.id).toBe('p1');
    expect(p.subject).toBe('user:*');
    expect(p.resource).toBe('note:*');
    expect(p.actions).toEqual(['read', 'write']);
    expect(p.effect).toBe('deny');
    expect(p.priority).toBe(10);
    expect(p.condition).toEqual({ field: 'x', op: 'eq', value: 1 });
    expect(p.metadata).toEqual({ k: 'v' });
  });

  test('matches should require subject, resource and action', () => {
    const p = new Policy({ subject: 'alice', resource: 'note:1', actions: ['read'] });
    expect(p.matches('alice', 'read', 'note:1')).toBe(true);
    expect(p.matches('bob', 'read', 'note:1')).toBe(false);
    expect(p.matches('alice', 'write', 'note:1')).toBe(false);
    expect(p.matches('alice', 'read', 'note:2')).toBe(false);
  });

  test('matches should support wildcards and glob patterns', () => {
    const p = new Policy({ subject: 'user:*', resource: '*', actions: ['read', '*'] });
    expect(p.matches('user:alice', 'read', 'anything')).toBe(true);
    expect(p.matches('user:alice', 'anything', 'x')).toBe(true);
    expect(p.matches('admin', 'read', 'x')).toBe(false);
  });

  test('evaluateCondition should return true without condition', () => {
    const p = new Policy({});
    expect(p.evaluateCondition()).toBe(true);
  });

  test('evaluateCondition should support comparison ops', () => {
    const mk = (op, value) => new Policy({ condition: { field: 'resource.owner', op, value } });
    const ctx = { resource: { owner: 'alice' }, subject: { id: 'bob' } };

    expect(mk('eq', 'alice').evaluateCondition(ctx)).toBe(true);
    expect(mk('eq', 'bob').evaluateCondition(ctx)).toBe(false);
    expect(mk('neq', 'bob').evaluateCondition(ctx)).toBe(true);
    expect(mk('in', ['alice', 'carol']).evaluateCondition(ctx)).toBe(true);
    expect(mk('not_in', ['bob']).evaluateCondition(ctx)).toBe(true);
    expect(mk('contains', 'ali').evaluateCondition(ctx)).toBe(true);
    expect(mk('starts_with', 'ali').evaluateCondition(ctx)).toBe(true);
  });

  test('evaluateCondition should support numeric and existence ops', () => {
    const mk = (op, value) => new Policy({ condition: { field: 'resource.size', op, value } });
    const ctx = { resource: { size: 5 } };

    expect(mk('gt', 4).evaluateCondition(ctx)).toBe(true);
    expect(mk('gt', 5).evaluateCondition(ctx)).toBe(false);
    expect(mk('lt', 6).evaluateCondition(ctx)).toBe(true);
    expect(mk('gte', 5).evaluateCondition(ctx)).toBe(true);
    expect(mk('lte', 4).evaluateCondition(ctx)).toBe(false);
    expect(mk('exists', null).evaluateCondition(ctx)).toBe(true);
    expect(mk('not_exists', null).evaluateCondition(ctx)).toBe(false);

    const noSize = { resource: {} };
    expect(mk('exists', null).evaluateCondition(noSize)).toBe(false);
    expect(mk('not_exists', null).evaluateCondition(noSize)).toBe(true);
  });

  test('evaluateCondition should default to true for unknown op', () => {
    const p = new Policy({ condition: { field: 'x', op: 'magic', value: 1 } });
    expect(p.evaluateCondition({ x: 2 })).toBe(true);
  });

  test('toJSON and fromJSON should round-trip', () => {
    const json = {
      id: 'p9', subject: 'a', resource: 'b', actions: ['c'],
      effect: 'deny', priority: 3, condition: null, metadata: { m: 1 }
    };
    const p = Policy.fromJSON(json);
    expect(p).toBeInstanceOf(Policy);
    expect(p.toJSON()).toEqual(json);
  });
});
