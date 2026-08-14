const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const PluginLoader = require('../../src/plugin/pluginLoader.cjs');

const CORE_PLUGIN = path.join(__dirname, '../../src/plugin/plugin.cjs');

describe('PluginLoader', () => {
  let tempDir, pluginsDir, loader;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-loader-'));
    pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await fs.ensureDir(pluginsDir);
    loader = new PluginLoader(pluginsDir);
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  async function writePlugin(pluginId, { entry, manifest } = {}) {
    const dir = path.join(pluginsDir, pluginId);
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, 'plugin.json'),
      JSON.stringify(manifest || { id: pluginId, name: pluginId, version: '1.0.0', main: 'index.cjs' })
    );
    await fs.writeFile(
      path.join(dir, 'index.cjs'),
      entry || `const Plugin = require(${JSON.stringify(CORE_PLUGIN)});
class P extends Plugin {
  manifest() { return { id: ${JSON.stringify(pluginId)}, name: ${JSON.stringify(pluginId)}, version: '1.0.0' }; }
}
module.exports = P;
`
    );
    return dir;
  }

  test('loadAll returns [] when plugins dir missing', async () => {
    const emptyLoader = new PluginLoader(path.join(tempDir, 'nope'));
    expect(await emptyLoader.loadAll()).toEqual([]);
  });

  test('loadAll loads valid plugins', async () => {
    await writePlugin('alpha');
    await writePlugin('beta');
    const plugins = await loader.loadAll();
    expect(plugins.map((p) => p.id).sort()).toEqual(['alpha', 'beta']);
    expect(plugins[0]._pluginDir).toContain('alpha');
    expect(plugins[0]._manifest.id).toBe('alpha');
  });

  test('loadAll skips files and dot-directories', async () => {
    await writePlugin('visible');
    await fs.writeFile(path.join(pluginsDir, 'README.txt'), 'x');
    await fs.ensureDir(path.join(pluginsDir, '.hidden'));
    const plugins = await loader.loadAll();
    expect(plugins.map((p) => p.id)).toEqual(['visible']);
  });

  test('loadAll tolerates directories whose load returns null', async () => {
    await writePlugin('good');
    await fs.ensureDir(path.join(pluginsDir, 'nomanifest'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const plugins = await loader.loadAll();
    expect(plugins.map((p) => p.id)).toEqual(['good']);
    errorSpy.mockRestore();
  });

  test('loadAll catches and skips broken plugins', async () => {
    await writePlugin('good');
    await writePlugin('broken', { entry: 'module.exports = {};' });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const plugins = await loader.loadAll();
    expect(plugins.map((p) => p.id)).toEqual(['good']);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('load returns null when plugin.json missing', async () => {
    const dir = path.join(pluginsDir, 'nomanifest');
    await fs.ensureDir(dir);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await loader.load(dir)).toBeNull();
    errorSpy.mockRestore();
  });

  test('load throws on invalid plugin.json', async () => {
    const dir = path.join(pluginsDir, 'badjson');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'plugin.json'), '{not json');
    await expect(loader.load(dir)).rejects.toThrow('Invalid plugin.json');
  });

  test('load throws when manifest missing id or name', async () => {
    const dir = path.join(pluginsDir, 'noid');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({ version: '1.0.0' }));
    await expect(loader.load(dir)).rejects.toThrow('must have id and name');
  });

  test('load defaults to index.js entry when main is omitted', async () => {
    const dir = path.join(pluginsDir, 'defaultmain');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'defaultmain', name: 'DM', version: '1.0.0' }));
    await fs.writeFile(path.join(dir, 'index.js'), `const Plugin = require(${JSON.stringify(CORE_PLUGIN)});
class P extends Plugin {
  manifest() { return { id: 'defaultmain', name: 'DM', version: '1.0.0' }; }
}
module.exports = P;
`);
    const plugin = await loader.load(dir);
    expect(plugin.id).toBe('defaultmain');
  });

  test('load throws when entry file missing', async () => {
    const dir = await writePlugin('noentry', { manifest: { id: 'noentry', name: 'NE', version: '1.0.0', main: 'missing.cjs' } });
    await fs.remove(path.join(dir, 'index.cjs'));
    await expect(loader.load(dir)).rejects.toThrow('Plugin entry file not found');
  });

  test('load throws when entry does not export a class', async () => {
    await writePlugin('notclass', { entry: 'module.exports = 42;' });
    await expect(loader.load(path.join(pluginsDir, 'notclass'))).rejects.toThrow('must export a class');
  });

  test('load rejects plugins missing manifest() or register()', async () => {
    await writePlugin('noregister', { entry: `module.exports = class { manifest() { return { id: 'x', name: 'x', version: '1' }; } };` });
    await expect(loader.load(path.join(pluginsDir, 'noregister'))).rejects.toThrow('must implement manifest() and register()');
  });

  test('load warns when manifest id mismatches', async () => {
    await writePlugin('mismatch', {
      manifest: { id: 'mismatch', name: 'MM', version: '1.0.0', main: 'index.cjs' },
      entry: `const Plugin = require(${JSON.stringify(CORE_PLUGIN)});
class P extends Plugin {
  manifest() { return { id: 'different', name: 'MM', version: '1.0.0' }; }
}
module.exports = P;
`
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = await loader.load(path.join(pluginsDir, 'mismatch'));
    expect(plugin).not.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('id mismatch'));
    warnSpy.mockRestore();
  });

  test('load reflects an updated plugin.json manifest on reload', async () => {
    const dir = await writePlugin('refresh');
    const first = await loader.load(dir);
    expect(first).not.toBeNull();
    expect(first._manifest.version).toBe('1.0.0');
    await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({ id: 'refresh', name: 'Refresh', version: '2.0.0', main: 'index.cjs' }));
    const second = await loader.load(dir);
    expect(second._manifest.version).toBe('2.0.0');
    expect(second.manifest().id).toBe('refresh');
  });

  test('checkDependencies reports satisfied and missing', () => {
    const withDeps = { dependencies: ['a', 'b'] };
    expect(loader.checkDependencies(withDeps, new Set(['a', 'b']))).toEqual({ satisfied: true, missing: [] });
    expect(loader.checkDependencies(withDeps, new Set(['a']))).toEqual({ satisfied: false, missing: ['b'] });
    expect(loader.checkDependencies({ dependencies: [] }, new Set())).toEqual({ satisfied: true, missing: [] });
  });

  describe('detectCycles', () => {
    test('returns [] with no cycles', () => {
      const map = new Map([
        ['a', { dependencies: ['b'] }],
        ['b', { dependencies: [] }]
      ]);
      expect(loader.detectCycles(map)).toEqual([]);
    });

    test('detects a direct cycle', () => {
      const map = new Map([
        ['a', { dependencies: ['b'] }],
        ['b', { dependencies: ['a'] }]
      ]);
      expect(loader.detectCycles(map)).toEqual(['a', 'b', 'a']);
    });

    test('detects a self cycle', () => {
      const map = new Map([['a', { dependencies: ['a'] }]]);
      expect(loader.detectCycles(map)).toEqual(['a', 'a']);
    });

    test('tolerates dependencies on unknown plugin ids', () => {
      const map = new Map([
        ['a', { dependencies: ['ghost'] }],
        ['b', { dependencies: [] }]
      ]);
      expect(loader.detectCycles(map)).toEqual([]);
    });

    test('tolerates plugins without dependencies getter', () => {
      const map = new Map([['a', {}], ['b', {}]]);
      expect(loader.detectCycles(map)).toEqual([]);
    });
  });

  describe('topologicalSort', () => {
    test('orders dependencies first', () => {
      const map = new Map([
        ['a', { dependencies: [] }],
        ['b', { dependencies: ['a'] }],
        ['c', { dependencies: ['a', 'b'] }]
      ]);
      expect(loader.topologicalSort(map)).toEqual(['a', 'b', 'c']);
    });

    test('handles independent plugins', () => {
      const map = new Map([
        ['x', { dependencies: [] }],
        ['y', { dependencies: [] }]
      ]);
      expect(loader.topologicalSort(map).sort()).toEqual(['x', 'y']);
    });

    test('tolerates plugins without dependencies getter', () => {
      const map = new Map([['a', {}]]);
      expect(loader.topologicalSort(map)).toEqual(['a']);
    });
  });
});
