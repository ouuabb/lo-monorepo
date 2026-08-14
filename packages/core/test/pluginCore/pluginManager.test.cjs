const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const tar = require('tar');
const Database = require('../../src/repo/database.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const PluginManager = require('../../src/plugin/pluginManager.cjs');
const TypeRegistry = require('../../src/plugin/typeRegistry.cjs');
const { getFieldSchema } = require('../../src/utils/validateMetadata.cjs');

jest.mock('child_process', () => ({ execSync: jest.fn() }));

const { execSync } = require('child_process');

const CORE_PLUGIN = path.join(__dirname, '../../src/plugin/plugin.cjs');

function makePlugin(id, overrides = {}) {
  const manifest = {
    id,
    name: overrides.name || id,
    version: overrides.version || '1.0.0',
    config: overrides.config || {},
    contributes: overrides.contributes || {},
    dependencies: overrides.dependencies || [],
    ...(overrides.manifest || {})
  };
  const plugin = {
    _state: 'created',
    _enabled: false,
    _disposed: false,
    _pluginDir: overrides.pluginDir || null,
    _context: null,
    get id() { return manifest.id; },
    get name() { return manifest.name; },
    get version() { return manifest.version; },
    get dependencies() { return manifest.dependencies || []; },
    get contributes() { return manifest.contributes || {}; },
    get state() { return this._state; },
    set state(v) { this._state = v; },
    get context() { return this._context; },
    set context(v) { this._context = v; },
    manifest: jest.fn(() => manifest),
    register: jest.fn()
  };
  plugin.initialize = overrides.initialize || jest.fn(async () => {});
  plugin.enable = overrides.enable || jest.fn(function () { this._enabled = true; });
  plugin.disable = overrides.disable || jest.fn(function () { this._enabled = false; });
  plugin.dispose = overrides.dispose || jest.fn(function () { this._disposed = true; });
  if (overrides.$setContext) {
    plugin.$setContext = jest.fn();
  }
  return plugin;
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function pluginEntry(id, version) {
  return `class FakePlugin {
  get id() { return ${JSON.stringify(id)}; }
  get name() { return 'Fake ${id}'; }
  get version() { return ${JSON.stringify(version)}; }
  get contributes() { return null; }
  manifest() { return { id: ${JSON.stringify(id)}, name: 'Fake ${id}', version: ${JSON.stringify(version)} }; }
  register(ctx) {
    if (ctx && ctx.extensions && ctx.extensions.register) {
      ctx.extensions.register(${JSON.stringify(id)}, 'commands', ${JSON.stringify(`${id  }:hello`)}, { id: ${JSON.stringify(`${id  }:hello`)} });
    }
  }
  initialize() {}
  enable() {}
  disable() {}
  dispose() {}
}
module.exports = FakePlugin;
`;
}

async function makeRegistry(registryDir, { id, version, main = 'index.cjs', entryFile, entry, checksumOverride, omitPluginJson }) {
  const srcDir = path.join(registryDir, '_src');
  await fs.ensureDir(srcDir);
  const entryName = entryFile || main;
  if (!omitPluginJson) {
    await fs.writeFile(path.join(srcDir, 'plugin.json'), JSON.stringify({ id, name: id, version, main }));
  }
  await fs.writeFile(path.join(srcDir, entryName), entry || pluginEntry(id, version));
  const tarball = path.join(registryDir, `${id}-${version}.tar.gz`);
  const include = ['plugin.json', entryName].filter((f) => fs.existsSync(path.join(srcDir, f)));
  await tar.create({ gzip: true, file: tarball, cwd: srcDir }, include);
  const entryMeta = {
    id,
    name: id,
    version,
    main,
    downloadUrl: `${id}-${version}.tar.gz`,
    checksum: checksumOverride || sha256(tarball),
    size: fs.statSync(tarball).size
  };
  const indexFile = path.join(registryDir, 'index.json');
  await fs.writeFile(indexFile, JSON.stringify([entryMeta]));
  return indexFile;
}

describe('PluginManager', () => {
  let tempDir, pluginsDir, pm;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-pm-'));
    pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await fs.ensureDir(pluginsDir);
    pm = new PluginManager({ pluginsDir });
    jest.clearAllMocks();
    execSync.mockImplementation(() => undefined);
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('constructor', () => {
    test('builds subsystems and base services', () => {
      expect(pm.loader).toBeDefined();
      expect(pm.registry).toBeDefined();
      expect(pm.extensions).toBeDefined();
      expect(pm.hooks).toBeDefined();
      expect(pm.lifecycle).toBeDefined();
      expect(pm._contexts).toBeInstanceOf(Map);
      expect(pm._initialized).toBe(false);
      expect(pm.db).toBeNull();
      expect(pm._baseServices.repository).toBeNull();
      expect(pm._baseServices.extensionRegistry).toBe(pm.extensions);
      expect(pm._baseServices.hookManager).toBe(pm.hooks);
    });

    test('stores repository/logger/eventBus/db options', () => {
      const repo = { resourceService: {}, relationService: {} };
      const eventBus = { emit() {} };
      const logger = { log() {} };
      const db = {};
      const p2 = new PluginManager({ pluginsDir, repository: repo, logger, eventBus, db });
      expect(p2._baseServices.repository).toBe(repo);
      expect(p2._baseServices.logger).toBe(logger);
      expect(p2._baseServices.eventBus).toBe(eventBus);
      expect(p2.db).toBe(db);
    });
  });

  describe('config', () => {
    test('getPluginConfig throws when plugin not loaded', async () => {
      await expect(pm.getPluginConfig('nope')).rejects.toThrow('not found');
    });

    test('getPluginConfig resolves defaults from schema', async () => {
      pm.registry.register(makePlugin('cfg', {
        config: { a: { type: 'string', default: 'x' }, b: { type: 'boolean', default: true } }
      }));
      expect(await pm.getPluginConfig('cfg')).toEqual({ a: 'x', b: true });
    });

    test('setPluginConfig throws when plugin not found', async () => {
      await expect(pm.setPluginConfig('nope', 'k', 1)).rejects.toThrow('not found');
    });

    test('setPluginConfig throws for undeclared key', async () => {
      pm.registry.register(makePlugin('cfg', { config: { a: { type: 'string' } } }));
      await expect(pm.setPluginConfig('cfg', 'undeclared', 1)).rejects.toThrow('未声明配置项');
    });

    test('setPluginConfig throws without a database', async () => {
      pm.registry.register(makePlugin('cfg', { config: { a: { type: 'string' } } }));
      await expect(pm.setPluginConfig('cfg', 'a', 'v')).rejects.toThrow('数据库不可用');
    });

    test('setPluginConfig persists coerced values and syncs context', async () => {
      const db = new Database(tempDir);
      await db.open();
      await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
      try {
        pm.db = db;
        pm.registry.register(makePlugin('cfg', {
          config: { k: { type: 'boolean', default: false } }
        }));
        pm._contexts.set('cfg', { _configData: {} });
        await pm.setPluginConfig('cfg', 'k', 'true');
        const rows = await db.all('SELECT key, value FROM plugin_settings WHERE plugin_id = ?', ['cfg']);
        expect(rows).toEqual([{ key: 'k', value: 'true' }]);
        expect((await pm.getPluginConfig('cfg')).k).toBe(true);
        expect(pm._contexts.get('cfg')._configData.k).toBe(true);
      } finally {
        await db.close();
      }
    });

    test('setPluginConfig coerces number values', async () => {
      const db = new Database(tempDir);
      await db.open();
      await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
      try {
        pm.db = db;
        pm.registry.register(makePlugin('cfg', { config: { n: { type: 'number', default: 0 } } }));
        await pm.setPluginConfig('cfg', 'n', '42');
        expect((await pm.getPluginConfig('cfg')).n).toBe(42);
      } finally {
        await db.close();
      }
    });
  });

  describe('_coerceConfigValue', () => {
    test('boolean coercion', () => {
      expect(pm._coerceConfigValue('true', 'boolean', 'k', 'p')).toEqual({ raw: 'true', typed: true });
      expect(pm._coerceConfigValue(0, 'boolean', 'k', 'p')).toEqual({ raw: 'false', typed: false });
      expect(() => pm._coerceConfigValue('maybe', 'boolean', 'k', 'p')).toThrow('期望 boolean');
    });

    test('number coercion', () => {
      expect(pm._coerceConfigValue('42', 'number', 'k', 'p')).toEqual({ raw: '42', typed: 42 });
      expect(() => pm._coerceConfigValue('', 'number', 'k', 'p')).toThrow('期望 number');
      expect(() => pm._coerceConfigValue('abc', 'number', 'k', 'p')).toThrow('期望 number');
    });

    test('string coercion', () => {
      expect(pm._coerceConfigValue(null, 'string', 'k', 'p')).toEqual({ raw: '', typed: '' });
      expect(pm._coerceConfigValue(undefined, 'string', 'k', 'p')).toEqual({ raw: '', typed: '' });
      expect(pm._coerceConfigValue(5, 'string', 'k', 'p')).toEqual({ raw: '5', typed: '5' });
      expect(pm._coerceConfigValue(true, 'string', 'k', 'p')).toEqual({ raw: 'true', typed: 'true' });
      expect(() => pm._coerceConfigValue({ a: 1 }, 'string', 'k', 'p')).toThrow('期望 string');
    });
  });

  describe('_deserializeConfigValue', () => {
    test('handles all types', () => {
      expect(pm._deserializeConfigValue('true', 'boolean')).toBe(true);
      expect(pm._deserializeConfigValue('garbage', 'boolean')).toBe(false);
      expect(pm._deserializeConfigValue('42', 'number')).toBe(42);
      expect(pm._deserializeConfigValue('abc', 'number')).toBe(0);
      expect(pm._deserializeConfigValue('raw', 'string')).toBe('raw');
    });
  });

  describe('_toBoolean', () => {
    test('recognizes truthy and falsy values', () => {
      expect(pm._toBoolean(true)).toBe(true);
      expect(pm._toBoolean(false)).toBe(false);
      expect(pm._toBoolean('true')).toBe(true);
      expect(pm._toBoolean('1')).toBe(true);
      expect(pm._toBoolean(1)).toBe(true);
      expect(pm._toBoolean('false')).toBe(false);
      expect(pm._toBoolean('0')).toBe(false);
      expect(pm._toBoolean(0)).toBe(false);
      expect(pm._toBoolean('')).toBe(false);
      expect(pm._toBoolean(null)).toBe(false);
      expect(pm._toBoolean(undefined)).toBe(false);
      expect(pm._toBoolean('weird')).toBeNull();
    });
  });

  describe('_readConfigRows / _deletePluginConfig', () => {
    test('_readConfigRows returns {} without db', async () => {
      expect(await pm._readConfigRows('p')).toEqual({});
    });

    test('_readConfigRows swallows db errors', async () => {
      pm.db = { all: jest.fn(async () => { throw new Error('boom'); }) };
      expect(await pm._readConfigRows('p')).toEqual({});
    });

    test('_deletePluginConfig is a no-op without db', async () => {
      await expect(pm._deletePluginConfig('p')).resolves.toBeUndefined();
    });

    test('_deletePluginConfig swallows db errors', async () => {
      pm.db = { run: jest.fn(async () => { throw new Error('boom'); }) };
      await expect(pm._deletePluginConfig('p')).resolves.toBeUndefined();
    });

    test('_deletePluginConfig deletes rows', async () => {
      const db = new Database(tempDir);
      await db.open();
      await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
      try {
        pm.db = db;
        await db.run('INSERT INTO plugin_settings (plugin_id, key, value) VALUES (?, ?, ?)', ['p', 'k', 'v']);
        await pm._deletePluginConfig('p');
        const rows = await db.all('SELECT * FROM plugin_settings WHERE plugin_id = ?', ['p']);
        expect(rows).toEqual([]);
      } finally {
        await db.close();
      }
    });
  });

  describe('_activatePlugin', () => {
    test('activates a plugin with $setContext', async () => {
      const p = makePlugin('ap', { config: { k: { type: 'boolean', default: true } } });
      p.$setContext = jest.fn((ctx) => { p._context = ctx; });
      await pm._activatePlugin(p);
      expect(p.$setContext).toHaveBeenCalled();
      expect(p.context).toBe(pm.getContext('ap'));
      expect(pm.lifecycle.getState('ap')).toBe('enabled');
      expect(p.state).toBe('enabled');
      expect(pm.getContext('ap').config('k')).toBe(true);
    });

    test('activates a plugin without $setContext via context setter', async () => {
      const p = makePlugin('legacy');
      await pm._activatePlugin(p);
      expect(p.context).toBe(pm.getContext('legacy'));
      expect(pm.getContext('legacy').pluginId).toBe('legacy');
    });

    test('registers extensions and lifecycle through the flow', async () => {
      const p = makePlugin('ext', { contributes: { commands: ['c1'] } });
      await pm._activatePlugin(p);
      expect(p.register).toHaveBeenCalled();
      expect(pm.extensions.get('commands', 'c1')).toBe('c1');
    });

    test('propagates initialize() errors', async () => {
      const p = makePlugin('bad', { initialize: jest.fn(async () => { throw new Error('init fail'); }) });
      await expect(pm._activatePlugin(p)).rejects.toThrow('init fail');
      expect(pm.lifecycle.getState('bad')).toBe('initialized');
    });
  });

  describe('initialize', () => {
    test('does nothing and stays unlocked when no plugins', async () => {
      await pm.initialize();
      expect(pm._initialized).toBe(false);
    });

    test('loads and activates real plugins from disk', async () => {
      const dir = path.join(pluginsDir, 'alpha');
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'alpha', name: 'Alpha', version: '1.0.0', main: 'index.cjs' }));
      await fs.writeFile(path.join(dir, 'index.cjs'), `const Plugin = require(${JSON.stringify(CORE_PLUGIN)});
class Alpha extends Plugin {
  manifest() { return { id: 'alpha', name: 'Alpha', version: '1.0.0', contributes: { commands: ['alpha:cmd'] } }; }
}
module.exports = Alpha;
`);
      await pm.initialize();
      expect(pm.getPlugin('alpha')).toBeDefined();
      expect(pm.getContext('alpha')).toBeDefined();
      expect(pm.lifecycle.getState('alpha')).toBe('enabled');
      expect(pm._initialized).toBe(true);
      expect(pm.extensions.get('commands', 'alpha:cmd')).toBeDefined();
    });

    test('is idempotent after successful load', async () => {
      const dir = path.join(pluginsDir, 'alpha');
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'alpha', name: 'Alpha', version: '1.0.0', main: 'index.cjs' }));
      await fs.writeFile(path.join(dir, 'index.cjs'), pluginEntry('alpha', '1.0.0'));
      const loadAllSpy = jest.spyOn(pm.loader, 'loadAll');
      await pm.initialize();
      expect(loadAllSpy).toHaveBeenCalledTimes(1);
      await pm.initialize();
      expect(loadAllSpy).toHaveBeenCalledTimes(1);
      loadAllSpy.mockRestore();
    });

    test('throws on circular dependency', async () => {
      pm.loader = {
        loadAll: jest.fn(async () => [makePlugin('a'), makePlugin('b')]),
        detectCycles: jest.fn(() => ['a', 'b']),
        topologicalSort: jest.fn(() => [])
      };
      await expect(pm.initialize()).rejects.toThrow('Circular dependency detected');
    });

    test('isolates failing plugins and continues', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const good = makePlugin('good');
      const bad = makePlugin('bad', { initialize: jest.fn(async () => { throw new Error('init fail'); }) });
      pm.loader = {
        loadAll: jest.fn(async () => [good, bad]),
        detectCycles: jest.fn(() => []),
        topologicalSort: jest.fn(() => ['good', 'bad'])
      };
      await pm.initialize();
      expect(pm.getPlugin('good')).toBeDefined();
      expect(pm.getPlugin('bad')).toBeUndefined();
      expect(pm._initialized).toBe(true);
      errorSpy.mockRestore();
    });
  });

  describe('installPlugin', () => {
    test('throws when already installed', async () => {
      await fs.ensureDir(path.join(pluginsDir, 'demo'));
      await expect(pm.installPlugin('demo')).rejects.toThrow('already installed');
    });

    test('throws when plugin not in registry', async () => {
      const registryDir = path.join(tempDir, 'reg');
      await fs.ensureDir(registryDir);
      const indexFile = await makeRegistry(registryDir, { id: 'other', version: '1.0.0' });
      await expect(pm.installPlugin('demo', { registryUrl: indexFile })).rejects.toThrow('不在插件仓库中');
    });

    test('installs a plugin end to end', async () => {
      const registryDir = path.join(tempDir, 'reg');
      await fs.ensureDir(registryDir);
      const indexFile = await makeRegistry(registryDir, { id: 'demo', version: '1.0.0' });

      const plugin = await pm.installPlugin('demo', { registryUrl: indexFile });
      expect(plugin.id).toBe('demo');
      expect(await fs.pathExists(path.join(pluginsDir, 'demo', 'plugin.json'))).toBe(true);
      expect(pm.getPlugin('demo')).toBe(plugin);
      expect(pm.extensions.get('commands', 'demo:hello')).toBeDefined();
    });

    test('installs a plugin and persists its state to db', async () => {
      const db = new Database(tempDir);
      await db.open();
      await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
      try {
        pm.db = db;
        const registryDir = path.join(tempDir, 'reg');
        await fs.ensureDir(registryDir);
        const indexFile = await makeRegistry(registryDir, { id: 'demo', version: '1.0.0' });
        await pm.installPlugin('demo', { registryUrl: indexFile });
        const rows = await db.all('SELECT id, enabled FROM plugins WHERE id = ?', ['demo']);
        expect(rows).toHaveLength(1);
        expect(rows[0].enabled).toBe(1);
      } finally {
        await db.close();
      }
    });

    test('rejects on checksum mismatch and cleans up', async () => {
      const registryDir = path.join(tempDir, 'reg');
      await fs.ensureDir(registryDir);
      const indexFile = await makeRegistry(registryDir, { id: 'demo', version: '1.0.0', checksumOverride: 'f'.repeat(64) });
      await expect(pm.installPlugin('demo', { registryUrl: indexFile })).rejects.toThrow('校验失败');
      expect(await fs.pathExists(path.join(pluginsDir, 'demo'))).toBe(false);
    });

    test('rejects when package lacks plugin.json', async () => {
      const registryDir = path.join(tempDir, 'reg');
      await fs.ensureDir(registryDir);
      const indexFile = await makeRegistry(registryDir, { id: 'demo', version: '1.0.0', omitPluginJson: true });
      await expect(pm.installPlugin('demo', { registryUrl: indexFile })).rejects.toThrow('缺少 plugin.json');
      expect(await fs.pathExists(path.join(pluginsDir, 'demo'))).toBe(false);
    });

    test('rolls back when plugin load fails and can be retried', async () => {
      const registryDir = path.join(tempDir, 'reg');
      await fs.ensureDir(registryDir);
      const brokenIndex = await makeRegistry(registryDir, { id: 'demo', version: '1.0.0', main: 'missing.cjs', entryFile: 'index.cjs' });
      await expect(pm.installPlugin('demo', { registryUrl: brokenIndex })).rejects.toThrow('Plugin entry file not found');
      expect(await fs.pathExists(path.join(pluginsDir, 'demo'))).toBe(false);

      const goodIndex = await makeRegistry(registryDir, { id: 'demo', version: '1.0.0' });
      const plugin = await pm.installPlugin('demo', { registryUrl: goodIndex });
      expect(plugin.id).toBe('demo');
    });

    test('rolls back when plugin activation fails', async () => {
      const registryDir = path.join(tempDir, 'reg');
      await fs.ensureDir(registryDir);
      const entry = `class BadInit {
  get id() { return 'demo'; }
  get name() { return 'demo'; }
  get version() { return '1.0.0'; }
  get contributes() { return null; }
  manifest() { return { id: 'demo', name: 'demo', version: '1.0.0' }; }
  register() {}
  async initialize() { throw new Error('activation boom'); }
  enable() {}
}
module.exports = BadInit;
`;
      const indexFile = await makeRegistry(registryDir, { id: 'demo', version: '1.0.0', entry });
      await expect(pm.installPlugin('demo', { registryUrl: indexFile })).rejects.toThrow('activation boom');
      expect(await fs.pathExists(path.join(pluginsDir, 'demo'))).toBe(false);
      expect(pm.getPlugin('demo')).toBeUndefined();
    });
  });

  describe('updatePlugin', () => {
    test('throws when plugin not loaded', async () => {
      await expect(pm.updatePlugin('nope')).rejects.toThrow('not found');
    });

    test('throws when plugin not in remote registry', async () => {
      pm.registry.register(makePlugin('demo', { version: '1.0.0' }));
      const registryDir = path.join(tempDir, 'reg');
      await fs.ensureDir(registryDir);
      const indexFile = await makeRegistry(registryDir, { id: 'other', version: '2.0.0' });
      await expect(pm.updatePlugin('demo', { registryUrl: indexFile })).rejects.toThrow('不在插件仓库中');
    });

    test('returns upToDate when versions match', async () => {
      pm.registry.register(makePlugin('demo', { version: '1.0.0' }));
      const registryDir = path.join(tempDir, 'reg');
      await fs.ensureDir(registryDir);
      const indexFile = await makeRegistry(registryDir, { id: 'demo', version: '1.0.0' });
      const result = await pm.updatePlugin('demo', { registryUrl: indexFile });
      expect(result).toEqual({ upToDate: true, currentVersion: '1.0.0' });
    });

    test('upgrades to the newer version', async () => {
      const registryV1 = path.join(tempDir, 'reg1');
      await fs.ensureDir(registryV1);
      const v1Index = await makeRegistry(registryV1, { id: 'demo', version: '1.0.0' });
      await pm.installPlugin('demo', { registryUrl: v1Index });
      expect(pm.getPlugin('demo').version).toBe('1.0.0');

      const registryV2 = path.join(tempDir, 'reg2');
      await fs.ensureDir(registryV2);
      const v2Index = await makeRegistry(registryV2, { id: 'demo', version: '2.0.0', main: 'index2.cjs' });
      const result = await pm.updatePlugin('demo', { registryUrl: v2Index });
      expect(result).toEqual({ upToDate: false, currentVersion: '1.0.0', newVersion: '2.0.0' });
      expect(pm.getPlugin('demo').version).toBe('2.0.0');
    });

    test('rolls back to old version when new version fails to load', async () => {
      const registryV1 = path.join(tempDir, 'reg1');
      await fs.ensureDir(registryV1);
      const v1Index = await makeRegistry(registryV1, { id: 'demo', version: '1.0.0' });
      await pm.installPlugin('demo', { registryUrl: v1Index });

      const registryV2 = path.join(tempDir, 'reg2');
      await fs.ensureDir(registryV2);
      const v2Index = await makeRegistry(registryV2, { id: 'demo', version: '2.0.0', main: 'missing.cjs', entryFile: 'index.cjs' });
      await expect(pm.updatePlugin('demo', { registryUrl: v2Index })).rejects.toThrow('Plugin entry file not found');
      expect(pm.getPlugin('demo')).toBeDefined();
      expect(pm.getPlugin('demo').version).toBe('1.0.0');
    });

    test('rolls back when new version fails to activate', async () => {
      const registryV1 = path.join(tempDir, 'reg1');
      await fs.ensureDir(registryV1);
      const v1Index = await makeRegistry(registryV1, { id: 'demo', version: '1.0.0' });
      await pm.installPlugin('demo', { registryUrl: v1Index });

      const badEntry = `class BadInit {
  get id() { return 'demo'; }
  get name() { return 'demo'; }
  get version() { return '2.0.0'; }
  get contributes() { return null; }
  manifest() { return { id: 'demo', name: 'demo', version: '2.0.0' }; }
  register() {}
  async initialize() { throw new Error('activation boom'); }
  enable() {}
}
module.exports = BadInit;
`;
      const registryV2 = path.join(tempDir, 'reg2');
      await fs.ensureDir(registryV2);
      const v2Index = await makeRegistry(registryV2, { id: 'demo', version: '2.0.0', main: 'index2.cjs', entry: badEntry });
      await expect(pm.updatePlugin('demo', { registryUrl: v2Index })).rejects.toThrow('activation boom');
      expect(pm.getPlugin('demo')).toBeDefined();
      expect(pm.getPlugin('demo').version).toBe('1.0.0');
    });

    test('rolls back when new package lacks plugin.json', async () => {
      const registryV1 = path.join(tempDir, 'reg1');
      await fs.ensureDir(registryV1);
      const v1Index = await makeRegistry(registryV1, { id: 'demo', version: '1.0.0' });
      await pm.installPlugin('demo', { registryUrl: v1Index });

      const registryV2 = path.join(tempDir, 'reg2');
      await fs.ensureDir(registryV2);
      const v2Index = await makeRegistry(registryV2, { id: 'demo', version: '2.0.0', omitPluginJson: true });
      await expect(pm.updatePlugin('demo', { registryUrl: v2Index })).rejects.toThrow('缺少 plugin.json');
      expect(pm.getPlugin('demo')).toBeDefined();
      expect(pm.getPlugin('demo').version).toBe('1.0.0');
    });
  });

  describe('unloadPlugin', () => {
    test('throws when plugin not found', async () => {
      await expect(pm.unloadPlugin('nope')).rejects.toThrow('not found');
    });

    test('disables, disposes and unregisters the plugin', async () => {
      const p = makePlugin('gone');
      await pm._activatePlugin(p);
      const dir = path.join(pluginsDir, 'gone');
      await fs.ensureDir(dir);
      p._pluginDir = dir;
      await pm.unloadPlugin('gone');
      expect(pm.getPlugin('gone')).toBeUndefined();
      expect(pm.getContext('gone')).toBeNull();
      expect(pm.lifecycle.getState('gone')).toBe('created');
      expect(p.disable).toHaveBeenCalled();
      expect(p.dispose).toHaveBeenCalled();
      expect(await fs.pathExists(dir)).toBe(true);
    });

    test('removes files and config when deleteFiles is true', async () => {
      const db = new Database(tempDir);
      await db.open();
      await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
      try {
        pm.db = db;
        const p = makePlugin('gone');
        const dir = path.join(pluginsDir, 'gone');
        await fs.ensureDir(dir);
        p._pluginDir = dir;
        pm.registry.register(p);
        pm._contexts.set('gone', {});
        await db.run('INSERT INTO plugin_settings (plugin_id, key, value) VALUES (?, ?, ?)', ['gone', 'k', 'v']);
        await pm.unloadPlugin('gone', { deleteFiles: true });
        expect(await fs.pathExists(dir)).toBe(false);
        const rows = await db.all('SELECT * FROM plugin_settings WHERE plugin_id = ?', ['gone']);
        expect(rows).toEqual([]);
      } finally {
        await db.close();
      }
    });
  });

  describe('enablePlugin / disablePlugin', () => {
    test('throws when plugin not found', async () => {
      await expect(pm.enablePlugin('nope')).rejects.toThrow('not found');
      await expect(pm.disablePlugin('nope')).rejects.toThrow('not found');
    });

    test('transitions between disabled and enabled', async () => {
      const p = makePlugin('toggle');
      await pm._activatePlugin(p);
      await pm.disablePlugin('toggle');
      expect(pm.lifecycle.getState('toggle')).toBe('disabled');
      expect(p.disable).toHaveBeenCalled();
      await pm.enablePlugin('toggle');
      expect(pm.lifecycle.getState('toggle')).toBe('enabled');
      expect(p.enable).toHaveBeenCalled();
    });

    test('enablePlugin on already enabled plugin is a no-op', async () => {
      const p = makePlugin('idle');
      await pm._activatePlugin(p);
      p.enable.mockClear();
      await pm.enablePlugin('idle');
      expect(p.enable).not.toHaveBeenCalled();
    });

    test('enablePlugin rejects when enable() throws', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const p = makePlugin('boom', { enable: jest.fn(async () => { throw new Error('enable fail'); }) });
      pm.registry.register(p);
      pm.lifecycle.setState('boom', 'loaded');
      pm.lifecycle.setState('boom', 'initialized');
      pm.lifecycle.setState('boom', 'enabled');
      pm.lifecycle.setState('boom', 'disabled');
      await expect(pm.enablePlugin('boom')).rejects.toThrow('enable fail');
      errorSpy.mockRestore();
    });
  });

  describe('reloadPlugin', () => {
    test('throws when plugin not found', async () => {
      await expect(pm.reloadPlugin('nope')).rejects.toThrow('not found');
    });

    test('throws when plugin directory unknown', async () => {
      pm.registry.register(makePlugin('nodir'));
      await expect(pm.reloadPlugin('nodir')).rejects.toThrow('directory unknown');
    });

    test('reloads a plugin from its directory', async () => {
      const dir = path.join(pluginsDir, 'reload');
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'reload', name: 'Reload', version: '1.0.0', main: 'index.cjs' }));
      await fs.writeFile(path.join(dir, 'index.cjs'), pluginEntry('reload', '1.0.0'));
      const p = makePlugin('reload');
      p._pluginDir = dir;
      pm.registry.register(p);
      pm.lifecycle.setState('reload', 'loaded');
      pm.lifecycle.setState('reload', 'initialized');
      pm.lifecycle.setState('reload', 'enabled');

      const reloaded = await pm.reloadPlugin('reload');
      expect(reloaded.id).toBe('reload');
      expect(pm.getPlugin('reload')).toBe(reloaded);
      expect(pm.lifecycle.getState('reload')).toBe('enabled');
    });
  });

  describe('query methods', () => {
    test('listPlugins and getPlugin', () => {
      const p = makePlugin('q1');
      pm.registry.register(p);
      expect(pm.listPlugins()).toEqual([{ id: 'q1', name: 'q1', version: '1.0.0', state: 'created' }]);
      expect(pm.getPlugin('q1')).toBe(p);
      expect(pm.getPlugin('nope')).toBeUndefined();
    });

    test('getContext returns null when absent', () => {
      expect(pm.getContext('nope')).toBeNull();
      makePlugin('ctx');
      pm._contexts.set('ctx', 'C');
      expect(pm.getContext('ctx')).toBe('C');
    });

    test('getExtensionRegistry and getHookManager return subsystems', () => {
      expect(pm.getExtensionRegistry()).toBe(pm.extensions);
      expect(pm.getHookManager()).toBe(pm.hooks);
    });
  });

  describe('_transition', () => {
    test('sets state on success', async () => {
      const p = makePlugin('t');
      pm.registry.register(p);
      await pm._transition('t', 'loaded', jest.fn());
      expect(pm.lifecycle.getState('t')).toBe('loaded');
      expect(p.state).toBe('loaded');
    });

    test('logs and rethrows on action failure', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const p = makePlugin('t');
      pm.registry.register(p);
      await expect(pm._transition('t', 'loaded', jest.fn(async () => { throw new Error('boom'); }))).rejects.toThrow('boom');
      expect(pm.lifecycle.getState('t')).toBe('created');
      errorSpy.mockRestore();
    });
  });

  describe('_savePluginStates / _deletePluginState', () => {
    test('_savePluginStates is a no-op without db', async () => {
      pm.registry.register(makePlugin('s1'));
      await expect(pm._savePluginStates()).resolves.toBeUndefined();
    });

    test('_savePluginStates writes rows with enabled flag', async () => {
      const db = new Database(tempDir);
      await db.open();
      await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
      try {
        pm.db = db;
        const p = makePlugin('s1');
        await pm._activatePlugin(p);
        await pm._savePluginStates();
        const rows = await db.all('SELECT id, enabled FROM plugins');
        expect(rows).toEqual([{ id: 's1', enabled: 1 }]);
      } finally {
        await db.close();
      }
    });

    test('_deletePluginState is a no-op without db', async () => {
      await expect(pm._deletePluginState('p')).resolves.toBeUndefined();
    });
  });

  describe('metadata fields', () => {
    test('_registerMetadataFields registers schema fields', () => {
      const prefix = `pmField_${  Date.now()  }_`;
      pm._registerMetadataFields('plug', {
        resourceTypes: [
          {
            type: 'pmres',
            metadataSchema: {
              [`${prefix  }str`]: { type: 'string' },
              [`${prefix  }num`]: { type: 'number' },
              [`${prefix  }bool`]: { type: 'boolean' },
              [`${prefix  }arr`]: { type: 'array' }
            }
          }
        ]
      });
      expect(getFieldSchema(`${prefix  }str`, 'pmres').type).toBe('string');
      expect(getFieldSchema(`${prefix  }num`, 'pmres').type).toBe('number');
      expect(getFieldSchema(`${prefix  }bool`, 'pmres').type).toBe('boolean');
      expect(getFieldSchema(`${prefix  }arr`, 'pmres').type).toBe('array');
      expect(getFieldSchema(`${prefix  }num`, 'pmres').check(42)).toBe(true);
      expect(getFieldSchema(`${prefix  }arr`, 'pmres').check([1])).toBe(true);
    });

    test('_registerMetadataFields warns on unknown types', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      pm._registerMetadataFields('plug', {
        resourceTypes: [
          { type: 'pmres', metadataSchema: { [Date.now()]: { type: 'invalid' } } }
        ]
      });
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('_registerMetadataFields tolerates empty contributes', () => {
      expect(() => pm._registerMetadataFields('plug', null)).not.toThrow();
      expect(() => pm._registerMetadataFields('plug', { resourceTypes: [] })).not.toThrow();
      expect(() => pm._registerMetadataFields('plug', { resourceTypes: [{ type: 'x' }] })).not.toThrow();
    });

    test('_unregisterMetadataFields does not throw', () => {
      expect(() => pm._unregisterMetadataFields('plug')).not.toThrow();
    });
  });

  describe('type extensions', () => {
    test('_registerTypeExtensions and _unregisterTypeExtensions', () => {
      pm._registerTypeExtensions('plug', {
        resourceTypes: [{ type: 'custom', extensions: ['.custom'] }]
      });
      expect(TypeRegistry.isSupported('a.custom')).toBe(true);
      pm._unregisterTypeExtensions('plug');
      expect(TypeRegistry.isSupported('a.custom')).toBe(false);
    });

    test('tolerates empty contributes', () => {
      expect(() => pm._registerTypeExtensions('plug', null)).not.toThrow();
      expect(() => pm._registerTypeExtensions('plug', { resourceTypes: [{ type: 'x' }] })).not.toThrow();
    });
  });

  describe('_safelyCleanupPlugin', () => {
    test('removes all traces of a plugin', () => {
      const p = makePlugin('clean');
      pm.registry.register(p);
      pm._contexts.set('clean', {});
      pm.extensions.register('clean', 'commands', 'c', () => {});
      pm._safelyCleanupPlugin('clean');
      expect(pm.getPlugin('clean')).toBeUndefined();
      expect(pm.getContext('clean')).toBeNull();
      expect(pm.extensions.get('commands', 'c')).toBeUndefined();
      expect(() => pm._safelyCleanupPlugin('again')).not.toThrow();
    });
  });

  describe('_installDependencies', () => {
    test('runs npm install when package.json declares dependencies', async () => {
      const dir = path.join(pluginsDir, 'withdeps');
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { left: '^1.0.0' } }));
      await pm._installDependencies(dir, 'withdeps');
      expect(execSync).toHaveBeenCalledWith('npm install --production --no-audit --no-fund --legacy-peer-deps', expect.objectContaining({ cwd: dir }));
    });

    test('merges non-sdk peerDependencies into package.json', async () => {
      const dir = path.join(pluginsDir, 'peerdeps');
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
        peerDependencies: { '@lo/plugins-sdk': '^1.0.0', 'lo-plugins-sdk': '^1.0.0', 'real-dep': '^2.0.0' }
      }));
      await pm._installDependencies(dir, 'peerdeps');
      const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
      expect(pkg.dependencies).toEqual({ 'real-dep': '^2.0.0' });
      expect(execSync).toHaveBeenCalled();
    });

    test('uses plugin.json dependencies when no package.json', async () => {
      const dir = path.join(pluginsDir, 'jsononly');
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({ dependencies: { dep: '1.0.0' } }));
      await pm._installDependencies(dir, 'jsononly');
      expect(execSync).toHaveBeenCalled();
    });

    test('skips when no dependencies declared', async () => {
      const dir = path.join(pluginsDir, 'nodeps');
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({}));
      await pm._installDependencies(dir, 'nodeps');
      expect(execSync).not.toHaveBeenCalled();
    });

    test('skips when nothing readable', async () => {
      const dir = path.join(pluginsDir, 'nothing');
      await fs.ensureDir(dir);
      await pm._installDependencies(dir, 'nothing');
      expect(execSync).not.toHaveBeenCalled();
    });

    test('throws when npm install fails', async () => {
      execSync.mockImplementation(() => { throw new Error('npm blew up'); });
      const dir = path.join(pluginsDir, 'faildeps');
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { x: '1.0.0' } }));
      await expect(pm._installDependencies(dir, 'faildeps')).rejects.toThrow('依赖安装失败');
    });
  });

  describe('compareVersions (static)', () => {
    test('compares semver-ish versions', () => {
      expect(PluginManager.compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(PluginManager.compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
      expect(PluginManager.compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
      expect(PluginManager.compareVersions('1.0', '1.0.0')).toBe(0);
      expect(PluginManager.compareVersions('1.2.3.4', '1.2.3')).toBeGreaterThan(0);
      expect(PluginManager.compareVersions('', '')).toBe(0);
      expect(PluginManager.compareVersions(undefined, '1.0.0')).toBeLessThan(0);
      expect(PluginManager.compareVersions('abc', 'def')).toBe(0);
    });
  });
});
