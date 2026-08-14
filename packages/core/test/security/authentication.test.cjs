const path = require('path');
const Database = require('../../src/repo/database.cjs');
const Authentication = require('../../src/security/authentication.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('Authentication', () => {
  let tempDir, db, auth;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    auth = new Authentication(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  test('local auth should return current user identity', async () => {
    const result = await auth.authenticate({ type: 'local' });
    expect(result.authenticated).toBe(true);
    expect(result.identity.id).toBe('current-user');
    expect(result.identity.type).toBe('user');
  });

  test('local auth should be default when no type given', async () => {
    const result = await auth.authenticate({});
    expect(result.authenticated).toBe(true);
  });

  test('unknown auth type should fail', async () => {
    const result = await auth.authenticate({ type: 'magic' });
    expect(result).toEqual({ identity: null, authenticated: false, reason: 'unknown auth type: magic' });
  });

  describe('token auth', () => {
    test('should reject missing token', async () => {
      const result = await auth.authenticate({ type: 'token' });
      expect(result.reason).toBe('token required');
    });

    test('should reject invalid token', async () => {
      const result = await auth.authenticate({ type: 'token', token: 'wrong' });
      expect(result.reason).toBe('invalid token');
    });

    test('should accept a valid token and restore identity', async () => {
      const { token } = await auth.createToken('u1', 'my-token', 3600000);
      const result = await auth.authenticate({ type: 'token', token });
      expect(result.authenticated).toBe(true);
      expect(result.identity.toJSON()).toMatchObject({
        id: 'u1',
        type: 'user',
        metadata: { name: 'my-token', identityId: 'u1' }
      });
    });
  });

  describe('api-key auth', () => {
    test('should reject missing api key', async () => {
      const result = await auth.authenticate({ type: 'api-key' });
      expect(result.reason).toBe('api key required');
    });

    test('should reject invalid api key', async () => {
      const result = await auth.authenticate({ type: 'api-key', apiKey: 'bad' });
      expect(result.reason).toBe('invalid api key');
    });

    test('should accept a valid api key', async () => {
      const { token } = await auth.createApiKey('u2', 'ci-key');
      const result = await auth.authenticate({ type: 'api-key', apiKey: token });
      expect(result.authenticated).toBe(true);
    });
  });

  describe('plugin auth', () => {
    test('should reject missing plugin id', async () => {
      const result = await auth.authenticate({ type: 'plugin' });
      expect(result.reason).toBe('plugin id required');
    });

    test('should reject unknown plugin', async () => {
      const result = await auth.authenticate({ type: 'plugin', pluginId: 'missing' });
      expect(result.reason).toBe('plugin not found');
    });

    test('should accept a registered plugin', async () => {
      await db.run('INSERT INTO plugins (id, name, version, enabled) VALUES (?, ?, ?, 1)', ['p1', 'My Plugin', '1.0.0']);
      const result = await auth.authenticate({ type: 'plugin', pluginId: 'p1', pluginToken: 'x' });
      expect(result.authenticated).toBe(true);
      expect(result.identity.toJSON()).toMatchObject({ id: 'plugin:p1', name: 'My Plugin', type: 'plugin' });
    });
  });

  describe('remote auth', () => {
    test('should reject missing remote id', async () => {
      const result = await auth.authenticate({ type: 'remote' });
      expect(result.reason).toBe('remote id required');
    });

    test('should reject unknown remote repo', async () => {
      const result = await auth.authenticate({ type: 'remote', remoteId: 'nope' });
      expect(result.reason).toBe('remote not found');
    });

    test('should accept a registered remote repo', async () => {
      await db.run(
        'INSERT INTO repositories (id, namespace, name, path, created) VALUES (?, ?, ?, ?, ?)',
        ['repo-1', 'ns', 'Remote Repo', '/path', Date.now()]
      );
      const result = await auth.authenticate({ type: 'remote', remoteId: 'repo-1', remoteToken: 't' });
      expect(result.authenticated).toBe(true);
      expect(result.identity.toJSON()).toMatchObject({ id: 'service:repo-1', name: 'Remote Repo', type: 'service' });
    });
  });

  describe('credential management', () => {
    test('createToken should return token, hash and expiry', async () => {
      const result = await auth.createToken('u3', 'token-name', 5000);
      expect(result.token).toMatch(/^lo_/);
      expect(result.token).toHaveLength(43);
      expect(result.tokenHash).toHaveLength(64);
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    test('createApiKey should persist a credential row', async () => {
      const result = await auth.createApiKey('u4', 'key-name');
      const rows = await db.all('SELECT * FROM credentials WHERE identity_id = ?', ['u4']);
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe('api-key');
      expect(rows[0].token_hash).toBe(result.tokenHash);
    });

    test('revokeCredential should delete the row', async () => {
      const { token } = await auth.createToken('u5', 't');
      const rows = await db.all('SELECT * FROM credentials WHERE identity_id = ?', ['u5']);
      await auth.revokeCredential(rows[0].id);
      const after = await db.all('SELECT * FROM credentials WHERE identity_id = ?', ['u5']);
      expect(after).toHaveLength(0);
      const result = await auth.authenticate({ type: 'token', token });
      expect(result.reason).toBe('invalid token');
    });

    test('listCredentials should return credential summaries', async () => {
      await auth.createToken('u6', 'a');
      await auth.createApiKey('u6', 'b');
      const list = await auth.listCredentials('u6');
      expect(list).toHaveLength(2);
      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('type');
    });
  });
});
