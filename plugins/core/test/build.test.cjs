/**
 * 打包脚本测试（P2-1）
 *
 * 覆盖：
 *   1. buildPlugin 对真实 chrome-translate 打包成功，entry 字段完整
 *   2. 包内包含 plugin.json + src/，排除 test/
 *   3. checksum 与文件实际 sha256 一致
 *   4. readManifest 校验：缺必填字段报错
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const tar = require('tar');
const { buildAll, buildPlugin, readManifest, sha256, PACKAGES_DIR, DIST_DIR } = require('../scripts/build.cjs');

describe('打包脚本 build.cjs', () => {
  test('buildPlugin 对 chrome-translate 打包成功', async () => {
    const pluginDir = path.join(PACKAGES_DIR, 'chrome-translate');
    const entry = await buildPlugin(pluginDir);

    expect(entry.id).toBe('chrome-translate');
    expect(entry.name).toBe('Chrome 划词翻译');
    expect(entry.version).toBe('0.1.0');
    expect(entry.main).toBe('src/index.cjs');
    expect(entry.downloadUrl).toBe('chrome-translate-0.1.0.tar.gz');
    expect(typeof entry.checksum).toBe('string');
    expect(entry.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.size).toBeGreaterThan(0);
  });

  test('包内包含 plugin.json + src/，排除 test/', async () => {
    const pluginDir = path.join(PACKAGES_DIR, 'chrome-translate');
    const entry = await buildPlugin(pluginDir);

    const distDir = path.join(PACKAGES_DIR, '..', 'dist');
    const tarballPath = path.join(distDir, entry.downloadUrl);
    expect(await fs.pathExists(tarballPath)).toBe(true);

    // 解压到临时目录验证包内容
    const extractDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-build-extract-'));
    try {
      await tar.extract({ file: tarballPath, cwd: extractDir });
      const files = await fs.readdir(extractDir, { recursive: true });

      expect(files).toContain('plugin.json');
      expect(files).toContain(path.join('src', 'index.cjs'));
      expect(files).toContain(path.join('src', 'plugin.cjs'));
      // 排除 test/ 与 node_modules/
      expect(files.some((f) => f.startsWith('test'))).toBe(false);
      expect(files.some((f) => f.startsWith('node_modules'))).toBe(false);
    } finally {
      await fs.remove(extractDir);
    }
  });

  test('checksum 与文件实际 sha256 一致', async () => {
    const pluginDir = path.join(PACKAGES_DIR, 'chrome-translate');
    const entry = await buildPlugin(pluginDir);

    const distDir = path.join(PACKAGES_DIR, '..', 'dist');
    const actual = await sha256(path.join(distDir, entry.downloadUrl));
    expect(actual).toBe(entry.checksum);
  });

  test('readManifest 缺必填字段报错', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-build-test-'));
    try {
      await fs.writeFile(
        path.join(tmpDir, 'plugin.json'),
        JSON.stringify({ id: 'no-version' }) // 缺 version/main
      );
      await expect(readManifest(tmpDir)).rejects.toThrow('缺少必填');
    } finally {
      await fs.remove(tmpDir);
    }
  });

  test('readManifest 对不存在 plugin.json 报错', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-build-test-'));
    try {
      await expect(readManifest(tmpDir)).rejects.toThrow('缺少 plugin.json');
    } finally {
      await fs.remove(tmpDir);
    }
  });

  test('main 指向根目录文件时入口会被打包', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-build-test-'));
    try {
      await fs.writeFile(
        path.join(tmpDir, 'plugin.json'),
        JSON.stringify({ id: 'root-main', name: 'Root Main', version: '1.0.0', main: 'index.js' })
      );
      await fs.writeFile(path.join(tmpDir, 'index.js'), 'module.exports = class {};');

      const entry = await buildPlugin(tmpDir);
      expect(entry.id).toBe('root-main');

      // 解压验证根目录入口被打包
      const extractDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-build-extract-'));
      try {
        await tar.extract({ file: path.join(DIST_DIR, entry.downloadUrl), cwd: extractDir });
        const files = await fs.readdir(extractDir, { recursive: true });
        expect(files).toContain('index.js');
      } finally {
        await fs.remove(extractDir);
      }
    } finally {
      await fs.remove(tmpDir);
    }
  });

  test('buildAll 支持 --plugin 过滤', async () => {
    const entries = await buildAll({ pluginId: 'chrome-translate' });
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('chrome-translate');
  });

  test('sha256 计算结果正确', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-build-test-'));
    try {
      const f = path.join(tmpDir, 'a.txt');
      await fs.writeFile(f, 'hello');
      const expected = crypto.createHash('sha256').update('hello').digest('hex');
      expect(await sha256(f)).toBe(expected);
    } finally {
      await fs.remove(tmpDir);
    }
  });
});
