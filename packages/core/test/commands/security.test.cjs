const testUtils = global.testUtils;
const Repository = require('../../src/repo/repository.cjs');
const security = require('../../src/commands/security.cjs');

let securitySpy = null;
let securityGetterSpy = null;

function fakeSecurity(overrides = {}) {
  return {
    createIdentity: jest.fn((type, id, name) => ({ id, type, name })),
    check: jest.fn(async () => true),
    listPolicies: jest.fn(async () => []),
    audit: jest.fn(async () => []),
    deniedStats: jest.fn(async () => []),
    ...overrides
  };
}

function installFakeSecurity(sec) {
  if (securitySpy) securitySpy.mockRestore();
  if (securityGetterSpy) securityGetterSpy.mockRestore();
  securitySpy = jest.spyOn(Repository.prototype, 'initSecuritySystem').mockResolvedValue(sec);
  securityGetterSpy = jest.spyOn(Repository.prototype, 'security', 'get').mockReturnValue(sec);
}

describe('security command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = { originalCwd: process.cwd() };
    ctx.dir = await testUtils.createTempRepo();
    process.chdir(ctx.dir);
    process.exit.mockClear();
  });

  afterEach(async () => {
    if (securitySpy) securitySpy.mockRestore();
    if (securityGetterSpy) securityGetterSpy.mockRestore();
    securitySpy = null;
    securityGetterSpy = null;
    process.chdir(ctx.originalCwd);
    await testUtils.cleanupTempDir(ctx.dir);
  });

  async function leaveRepo() {
    process.chdir(ctx.originalCwd);
  }

  async function insertIdentity(row) {
    const repo = new Repository(ctx.dir);
    await repo.open({ skipAuth: true });
    await repo.db.run(
      'INSERT INTO identities (id, type, name, created_at) VALUES (?, ?, ?, ?)',
      [row.id, row.type, row.name || null, Date.now()]
    );
    await repo.close();
  }

  describe('identity list', () => {
    test('prints built-in identities', async () => {
      installFakeSecurity(fakeSecurity());
      const spy = jest.spyOn(console, 'log');
      await security.identityList({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('身份列表'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('current-user'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('system'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('prints custom identities from the database', async () => {
      await insertIdentity({ id: 'custom-1', type: 'user', name: 'Custom User' });
      installFakeSecurity(fakeSecurity());
      const spy = jest.spyOn(console, 'log');
      await security.identityList({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('自定义身份'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('custom-1'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports when not connected to a repository', async () => {
      await leaveRepo();
      const spy = jest.spyOn(console, 'log');
      await security.identityList({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('未连接到仓库'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });
  });

  describe('identity create', () => {
    test('creates an identity', async () => {
      const sec = fakeSecurity();
      installFakeSecurity(sec);
      const spy = jest.spyOn(console, 'log');
      await security.identityCreate({ type: 'user', id: 'alice', name: 'Alice' });
      expect(sec.createIdentity).toHaveBeenCalledWith('user', 'alice', 'Alice');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('身份已创建: alice'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports when not connected to a repository', async () => {
      await leaveRepo();
      const spy = jest.spyOn(console, 'log');
      await security.identityCreate({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('未连接到仓库'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });

    test('reports create failures', async () => {
      const sec = fakeSecurity();
      sec.createIdentity.mockImplementation(() => { throw new Error('bad identity'); });
      installFakeSecurity(sec);
      const spy = jest.spyOn(console, 'log');
      await security.identityCreate({ type: 'user', id: 'x' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('创建身份失败'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('bad identity'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });

  describe('check permission', () => {
    test('prints allowed when permission is granted', async () => {
      const sec = fakeSecurity();
      installFakeSecurity(sec);
      const spy = jest.spyOn(console, 'log');
      await security.checkPermission({ subject: 'u1', action: 'read', resource: 'res_1' });
      expect(sec.check).toHaveBeenCalledWith('u1', 'read', 'res_1');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('允许'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('prints denied when permission is refused', async () => {
      const sec = fakeSecurity({ check: jest.fn(async () => false) });
      installFakeSecurity(sec);
      const spy = jest.spyOn(console, 'log');
      await security.checkPermission({ subject: 'u1', action: 'write' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('拒绝'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('uses default allow in local mode when not connected', async () => {
      await leaveRepo();
      const spy = jest.spyOn(console, 'log');
      await security.checkPermission({ subject: 'u1', action: 'read', resource: 'res_1' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('默认允许所有操作'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('允许 (default_allow)'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports check failures', async () => {
      const sec = fakeSecurity();
      sec.check.mockImplementation(() => { throw new Error('policy engine down'); });
      installFakeSecurity(sec);
      const spy = jest.spyOn(console, 'log');
      await security.checkPermission({ subject: 'u1', action: 'read' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('权限检查失败'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('policy engine down'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });

  describe('policy list', () => {
    test('reports when there are no custom policies', async () => {
      installFakeSecurity(fakeSecurity());
      const spy = jest.spyOn(console, 'log');
      await security.policyList({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('暂无自定义策略'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('prints custom policies with actions and effects', async () => {
      const sec = fakeSecurity({
        listPolicies: jest.fn(async () => [
          { id: 'p1', subject: 'u1', resource: 'res_1', action: '["read","write"]', effect: 'allow', priority: 10 },
          { id: 'p2', subject: 'u2', resource: 'res_2', action: '[]', effect: 'deny', priority: 0 }
        ])
      });
      installFakeSecurity(sec);
      const spy = jest.spyOn(console, 'log');
      await security.policyList({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('安全策略'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('p1'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('read, write'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('deny'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports when not connected to a repository', async () => {
      await leaveRepo();
      const spy = jest.spyOn(console, 'log');
      await security.policyList({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('未连接到仓库'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });
  });

  describe('audit', () => {
    test('reports when there are no audit records', async () => {
      installFakeSecurity(fakeSecurity());
      const spy = jest.spyOn(console, 'log');
      await security.securityAudit({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('无审计记录'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('prints records and denied statistics', async () => {
      const sec = fakeSecurity({
        audit: jest.fn(async () => [
          { result: 'denied', created_at: Date.now(), actor: 'u1', action: 'resource.write', reason: 'no permission' },
          { result: 'allowed', created_at: Date.now(), actor: 'u2', action: 'resource.read', reason: '' }
        ]),
        deniedStats: jest.fn(async () => [{ count: 1, actor: 'u1', action: 'resource.write' }])
      });
      installFakeSecurity(sec);
      const spy = jest.spyOn(console, 'log');
      await security.securityAudit({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('24h 拒绝统计'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('最近记录'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('no permission'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('resource.read'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('passes actor and limit options to the backend', async () => {
      const sec = fakeSecurity();
      installFakeSecurity(sec);
      await security.securityAudit({ actor: 'u1', limit: 5 });
      expect(sec.audit).toHaveBeenCalledWith({ limit: 5, actor: 'u1' });
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('defaults the limit to 30', async () => {
      const sec = fakeSecurity();
      installFakeSecurity(sec);
      await security.securityAudit({});
      expect(sec.audit).toHaveBeenCalledWith({ limit: 30 });
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('reports when not connected to a repository', async () => {
      await leaveRepo();
      const spy = jest.spyOn(console, 'log');
      await security.securityAudit({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('未连接到仓库'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });
  });
});
