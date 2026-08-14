const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const tar = require('tar');
const { PluginInstaller } = require('../../src/main/plugin/plugin-installer.cjs');

let tmpDir;
let registryDir;
let pluginsDir;

/** 构建一个本地分发仓库：packages/<id>/ 打包成 dist/<id>-<version>.tar.gz + index.json */
async function buildLocalRegistry(packages) {
  registryDir = path.join(tmpDir, 'registry');
  const distDir = path.join(registryDir, 'dist');
  const entries = [];
  for (const pkg of packages) {
    const srcDir = path.join(registryDir, 'packages', pkg.id);
    fs.mkdirSync(srcDir, { recursive: true });
    for (const [file, content] of Object.entries(pkg.files)) {
      const p = path.join(srcDir, file);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    }
    fs.writeFileSync(
      path.join(srcDir, 'plugin.json'),
      JSON.stringify({ id: pkg.id, name: pkg.name, version: pkg.version, main: pkg.main || 'index.cjs', ...pkg.manifest }),
    );
    const tarball = path.join(distDir, `${pkg.id}-${pkg.version}.tar.gz`);
    fs.mkdirSync(distDir, { recursive: true });
    await tar.create(
      { gzip: true, file: tarball, cwd: srcDir, portable: true },
      fs.readdirSync(srcDir),
    );
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(tarball)).digest('hex');
    // downloadUrl 相对 index.json 所在目录（dist/）→ 用 dist/ 前缀
    entries.push({ id: pkg.id, name: pkg.name, version: pkg.version, main: pkg.main || 'index.cjs', downloadUrl: `dist/${pkg.id}-${pkg.version}.tar.gz`, checksum });
  }
  fs.writeFileSync(path.join(registryDir, 'index.json'), JSON.stringify(entries, null, 2));
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-install-test-'));
  pluginsDir = path.join(tmpDir, 'plugins');
  fs.mkdirSync(pluginsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('PluginInstaller', () => {
  it('fetchIndex 支持本地目录与本地 index.json 文件', async () => {
    await buildLocalRegistry([{ id: 'demo', name: 'Demo', version: '1.0.0', files: { 'index.cjs': 'module.exports = class {};' } }]);
    const installer = new PluginInstaller(pluginsDir);

    const fromDir = await installer.fetchIndex(registryDir);
    expect(fromDir).toHaveLength(1);
    expect(fromDir[0].id).toBe('demo');

    const fromFile = await installer.fetchIndex(path.join(registryDir, 'index.json'));
    expect(fromFile).toHaveLength(1);
  });

  it('fetchIndex 本地文件不存在抛错', async () => {
    const installer = new PluginInstaller(pluginsDir);
    await expect(installer.fetchIndex(path.join(tmpDir, 'nope'))).rejects.toThrow(/index\.json/);
  });

  it('findEntry 找不到抛错', async () => {
    const installer = new PluginInstaller(pluginsDir);
    const index = [{ id: 'demo' }];
    expect(() => installer.findEntry(index, 'demo')).not.toThrow();
    expect(() => installer.findEntry(index, 'other')).toThrow(/不在分发清单/);
  });

  it('install 下载解压校验并加载', async () => {
    await buildLocalRegistry([{
      id: 'demo-install',
      name: 'Demo Install',
      version: '0.1.0',
      files: { 'index.cjs': 'module.exports = class Demo {};' },
    }]);
    const installer = new PluginInstaller(pluginsDir);

    const result = await installer.install('demo-install', registryDir);
    expect(result.id).toBe('demo-install');
    expect(result.version).toBe('0.1.0');
    // 已解压到 plugins/demo-install/
    expect(fs.existsSync(path.join(pluginsDir, 'demo-install', 'plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(pluginsDir, 'demo-install', 'index.cjs'))).toBe(true);
  });

  it('install 已存在且未 force 时抛错', async () => {
    await buildLocalRegistry([{
      id: 'demo-dup',
      name: 'Demo Dup',
      version: '0.1.0',
      files: { 'index.cjs': 'module.exports = class Demo {};' },
    }]);
    const installer = new PluginInstaller(pluginsDir);
    await installer.install('demo-dup', registryDir);
    await expect(installer.install('demo-dup', registryDir)).rejects.toThrow(/已安装/);
    // force 覆盖
    await expect(installer.install('demo-dup', registryDir, { force: true })).resolves.toBeTruthy();
  });

  it('install checksum 不匹配抛错', async () => {
    await buildLocalRegistry([{
      id: 'demo-badsum',
      name: 'Demo BadSum',
      version: '0.1.0',
      files: { 'index.cjs': 'module.exports = class Demo {};' },
    }]);
    // 篡改 index.json 的 checksum
    const indexPath = path.join(registryDir, 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    index[0].checksum = '0'.repeat(64);
    fs.writeFileSync(indexPath, JSON.stringify(index));

    const installer = new PluginInstaller(pluginsDir);
    await expect(installer.install('demo-badsum', registryDir)).rejects.toThrow(/checksum/);
  });

  it('install 清单中没有该插件抛错', async () => {
    await buildLocalRegistry([{ id: 'demo', name: 'Demo', version: '1.0.0', files: { 'index.cjs': 'x' } }]);
    const installer = new PluginInstaller(pluginsDir);
    await expect(installer.install('missing', registryDir)).rejects.toThrow(/不在分发清单/);
  });

  it('install 解压后 manifest 非法抛错', async () => {
    await buildLocalRegistry([{
      id: 'demo-badman',
      name: 'Demo BadMan',
      version: '0.1.0',
      files: { 'index.cjs': 'x' },
      manifest: { id: 'BAD ID!' }, // 非法 id
    }]);
    const installer = new PluginInstaller(pluginsDir);
    await expect(installer.install('demo-badman', registryDir)).rejects.toThrow(/manifest/);
  });
});
