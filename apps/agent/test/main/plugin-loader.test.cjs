const fs = require('fs');
const os = require('os');
const path = require('path');
const { PluginLoader } = require('../../src/main/plugin/plugin-loader.cjs');

const SDK_INDEX = path.join(__dirname, '..', '..', 'node_modules', '@lo', 'agent-plugins-sdk', 'src', 'index.cjs');

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lo-loader-test-'));
}

function writePlugin(dir, id, mainContent, manifestOverrides = {}) {
  const pluginDir = path.join(dir, id);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({ id, name: id, version: '0.1.0', main: 'index.cjs', ...manifestOverrides }),
  );
  fs.writeFileSync(path.join(pluginDir, 'index.cjs'), mainContent);
  return pluginDir;
}

const HOST_BASE = path.join(__dirname, '..', '..', 'src', 'main');

describe('PluginLoader', () => {
  it('扫描并加载目录下插件', async () => {
    const dir = makeDir();
    writePlugin(dir, 'a', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'a', name: 'A', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;
    `);
    writePlugin(dir, 'b', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'b', name: 'B', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;
    `);
    const loader = new PluginLoader(dir, HOST_BASE);
    const loaded = await loader.loadAll();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  it('目录不存在时返回空', async () => {
    const loader = new PluginLoader(path.join(os.tmpdir(), 'no-such-plugins-dir-xyz'), HOST_BASE);
    const loaded = await loader.loadAll();
    expect(loaded).toEqual([]);
  });

  it('manifest 非法时跳过该插件', async () => {
    const dir = makeDir();
    writePlugin(dir, 'bad', 'module.exports = class {};', { id: 'BAD ID!' });
    writePlugin(dir, 'good', `
      const { AgentPlugin } = require(${JSON.stringify(SDK_INDEX)});
      class P extends AgentPlugin {
        manifest() { return { id: 'good', name: 'G', version: '0.1.0', main: 'index.cjs' }; }
        activate() {}
      }
      module.exports = P;
    `);
    const loader = new PluginLoader(dir, HOST_BASE);
    const loaded = await loader.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('good');
  });

  it('跳过隐藏目录', async () => {
    const dir = makeDir();
    fs.mkdirSync(path.join(dir, '.hidden'), { recursive: true });
    writePlugin(dir, 'ok', 'module.exports = class { manifest() { return { id: "ok", name: "OK", version: "0.1.0", main: "index.cjs" }; } activate() {} };');
    const loader = new PluginLoader(dir, HOST_BASE);
    const loaded = await loader.loadAll();
    expect(loaded).toHaveLength(1);
  });
});
