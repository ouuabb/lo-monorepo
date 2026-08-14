const SecurityContext = require('../../src/security/securityContext.cjs');
const Identity = require('../../src/security/identity.cjs');
const Subject = require('../../src/security/subject.cjs');
const Role = require('../../src/security/role.cjs');

describe('SecurityContext', () => {
  test('should default to current user with owner role', () => {
    const ctx = new SecurityContext();
    expect(ctx.subject).toBeInstanceOf(Subject);
    expect(ctx.subject.id).toBe('current-user');
    expect(ctx.roles).toEqual(['owner']);
    expect(ctx.permissions).toEqual([]);
    expect(ctx.source).toBe('cli');
    expect(ctx.requestId).toMatch(/^req_/);
    expect(typeof ctx.timestamp).toBe('number');
  });

  test('should store provided options', () => {
    const subject = new Subject({ id: 'alice', type: 'user' });
    const ctx = new SecurityContext({
      subject,
      roles: ['editor'],
      permissions: ['ai.analyze'],
      source: 'api',
      requestId: 'req_123',
      timestamp: 999
    });
    expect(ctx.subject).toBe(subject);
    expect(ctx.roles).toEqual(['editor']);
    expect(ctx.permissions).toEqual(['ai.analyze']);
    expect(ctx.source).toBe('api');
    expect(ctx.requestId).toBe('req_123');
    expect(ctx.timestamp).toBe(999);
  });

  test('fromIdentity should map identity types to subjects', () => {
    const ctx = SecurityContext.fromIdentity(Identity.user('u', 'U'));
    expect(ctx.subject.id).toBe('u');
    expect(ctx.roles).toEqual(['viewer']);
    expect(ctx.source).toBe('user');

    const agentCtx = SecurityContext.fromIdentity(Identity.agent('a'));
    expect(agentCtx.subject.type).toBe('agent');
    expect(agentCtx.source).toBe('agent');

    const pluginCtx = SecurityContext.fromIdentity(Identity.plugin('p'));
    expect(pluginCtx.subject.type).toBe('plugin');

    const workflowCtx = SecurityContext.fromIdentity(Identity.workflow('w'));
    expect(workflowCtx.subject.type).toBe('workflow');

    const svcCtx = SecurityContext.fromIdentity(Identity.service('s'));
    expect(svcCtx.source).toBe('service');
  });

  test('fromIdentity should honor opts', () => {
    const ctx = SecurityContext.fromIdentity(Identity.user('u', 'U'), {
      roles: ['owner'],
      permissions: ['x.y'],
      requestId: 'req_r'
    });
    expect(ctx.roles).toEqual(['owner']);
    expect(ctx.permissions).toEqual(['x.y']);
    expect(ctx.requestId).toBe('req_r');
  });

  test('getAllPermissions should merge role and direct permissions', () => {
    const pm = {
      getRole: (id) => {
        if (id === 'editor') return new Role({ id: 'editor', permissions: ['resource.read', 'ai.analyze'] });
        return null;
      }
    };
    const ctx = new SecurityContext({
      subject: new Subject({ id: 'a' }),
      roles: ['editor', 'missing'],
      permissions: ['suggestion.create']
    });
    const perms = ctx.getAllPermissions(pm);
    expect(perms).toEqual(expect.arrayContaining(['resource.read', 'ai.analyze', 'suggestion.create']));
  });

  test('getAllPermissions should work without manager', () => {
    const ctx = new SecurityContext({ permissions: ['a.b'] });
    expect(ctx.getAllPermissions(null)).toEqual(['a.b']);
  });

  test('toJSON should serialize subject', () => {
    const ctx = new SecurityContext({ subject: new Subject({ id: 'a', type: 'user' }) });
    const json = ctx.toJSON();
    expect(json.subject).toEqual({ id: 'a', type: 'user', attributes: {} });
    expect(json.requestId).toMatch(/^req_/);
  });
});
