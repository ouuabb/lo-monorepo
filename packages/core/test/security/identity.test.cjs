const Identity = require('../../src/security/identity.cjs');

describe('Identity', () => {
  test('should apply defaults', () => {
    const i = new Identity();
    expect(i.id).toBe('');
    expect(i.type).toBe('user');
    expect(i.name).toBe(i.id);
    expect(i.provider).toBe('local');
    expect(i.metadata).toEqual({});
  });

  test('should store provided options', () => {
    const i = new Identity({ id: 'u1', type: 'user', name: 'Alice', provider: 'ldap', metadata: { a: 1 } });
    expect(i.id).toBe('u1');
    expect(i.type).toBe('user');
    expect(i.name).toBe('Alice');
    expect(i.provider).toBe('ldap');
    expect(i.metadata).toEqual({ a: 1 });
  });

  test('static factories should create typed identities', () => {
    expect(Identity.user('u', 'U').toJSON()).toMatchObject({ id: 'u', type: 'user', provider: 'local' });
    expect(Identity.agent('a').toJSON()).toMatchObject({ id: 'agent:a', type: 'agent', name: 'a' });
    expect(Identity.plugin('p').toJSON()).toMatchObject({ id: 'plugin:p', type: 'plugin', name: 'p' });
    expect(Identity.workflow('w').toJSON()).toMatchObject({ id: 'workflow:w', type: 'workflow', name: 'w' });
    expect(Identity.service('s').toJSON()).toMatchObject({ id: 'service:s', type: 'service', provider: 'remote' });
    expect(Identity.system().toJSON()).toMatchObject({ id: 'system', type: 'system', name: 'System', provider: 'internal' });
  });

  test('isX methods should reflect type', () => {
    const user = Identity.user('u', 'U');
    const agent = Identity.agent('a');
    const plugin = Identity.plugin('p');
    const workflow = Identity.workflow('w');
    const service = Identity.service('s');
    const system = Identity.system();

    expect(user.isUser()).toBe(true);
    expect(agent.isAgent()).toBe(true);
    expect(plugin.isPlugin()).toBe(true);
    expect(workflow.isWorkflow()).toBe(true);
    expect(service.isService()).toBe(true);
    expect(system.isSystem()).toBe(true);

    expect(agent.isUser()).toBe(false);
    expect(user.isSystem()).toBe(false);
  });

  test('toJSON should expose all fields', () => {
    const i = Identity.user('u1', 'Alice');
    expect(i.toJSON()).toEqual({
      id: 'u1',
      type: 'user',
      name: 'Alice',
      provider: 'local',
      metadata: {}
    });
  });

  test('fromJSON should round-trip', () => {
    const i = Identity.fromJSON({ id: 'x', type: 'agent', name: 'X', provider: 'local', metadata: { k: 1 } });
    expect(i).toBeInstanceOf(Identity);
    expect(i.toJSON()).toEqual({ id: 'x', type: 'agent', name: 'X', provider: 'local', metadata: { k: 1 } });
  });
});
