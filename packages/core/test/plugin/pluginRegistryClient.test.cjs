/**
 * PluginRegistryClient 单元测试（P2-1）
 *
 * 覆盖：fetchRegistry / findPlugin / resolveDownloadUrl /
 *       verifyChecksum / downloadPackage / extractPackage / installFromEntry
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const tar = require('tar');

const {
  fetchRegistry,
  findPlugin,
  resolveDownloadUrl,
  verifyChecksum,
  downloadPackage,
  extractPackage,
  installFromEntry,
} = require('../../src/plugin/pluginRegistryClient.cjs');

function makeEntry(overrides = {}) {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    main: 'src/index.cjs',
    downloadUrl: 'test-plugin-1.0.0.tar.gz',
    checksum: 'a'.repeat(64),
    size: 100,
    ...overrides,
  };
}

describe('PluginRegistryClient', () => {
  let tmpDir, registryDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-pc-'));
    registryDir = path.join(tmpDir, 'registry');
    await fs.ensureDir(registryDir);
  });

  afterEach(async () => {
    if (tmpDir && await fs.pathExists(tmpDir)) {
      await fs.remove(tmpDir);
    }
  });

  describe('fetchRegistry()', () => {
    test('读取本地路径 index.json', async () => {
      const indexFile = path.join(registryDir, 'index.json');
      await fs.writeFile(indexFile, JSON.stringify([makeEntry()]));

      const index = await fetchRegistry(indexFile);
      expect(index.length).toBe(1);
      expect(index[0].id).toBe('test-plugin');
    });

    test('读取 file:// 协议 index.json', async () => {
      const indexFile = path.join(registryDir, 'index.json');
      await fs.writeFile(indexFile, JSON.stringify([makeEntry()]));

      const index = await fetchRegistry(`file://${  indexFile.replace(/\\/g, '/')}`);
      expect(index.length).toBe(1);
    });

    test('文件不存在时报错', async () => {
      await expect(fetchRegistry(path.join(registryDir, 'missing.json'))).rejects.toThrow('不存在');
    });

    test('JSON 非法时报错', async () => {
      const indexFile = path.join(registryDir, 'index.json');
      await fs.writeFile(indexFile, '{bad json');
      await expect(fetchRegistry(indexFile)).rejects.toThrow();
    });
  });

  describe('findPlugin()', () => {
    test('按 id 找到插件', () => {
      const index = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })];
      expect(findPlugin(index, 'b').id).toBe('b');
    });

    test('未找到返回 null', () => {
      const index = [makeEntry({ id: 'a' })];
      expect(findPlugin(index, 'nope')).toBeNull();
    });

    test('非法输入返回 null', () => {
      expect(findPlugin(null, 'a')).toBeNull();
      expect(findPlugin([], 'a')).toBeNull();
      expect(findPlugin([{ id: 'a' }], null)).toBeNull();
    });
  });

  describe('resolveDownloadUrl()', () => {
    test('本地仓库：解析为 index.json 同目录', () => {
      const registryFile = path.join(registryDir, 'index.json');
      const url = resolveDownloadUrl('x.tar.gz', registryFile);
      expect(url).toBe(path.join(registryDir, 'x.tar.gz'));
    });

    test('网络仓库：基于 index.json URL 解析', () => {
      const url = resolveDownloadUrl('x.tar.gz', 'https://host/lo-plugins/dist/index.json');
      expect(url).toBe('https://host/lo-plugins/dist/x.tar.gz');
    });
  });

  describe('verifyChecksum()', () => {
    let file;
    beforeEach(async () => {
      file = path.join(registryDir, 'data.bin');
      await fs.writeFile(file, 'hello world');
    });

    test('校验和匹配返回 true', async () => {
      const hash = crypto.createHash('sha256').update('hello world').digest('hex');
      expect(await verifyChecksum(file, hash)).toBe(true);
    });

    test('校验和不匹配返回 false', async () => {
      expect(await verifyChecksum(file, 'b'.repeat(64))).toBe(false);
    });

    test('支持 sha256: 前缀', async () => {
      const hash = crypto.createHash('sha256').update('hello world').digest('hex');
      expect(await verifyChecksum(file, `sha256:${  hash}`)).toBe(true);
    });

    test('无校验和时跳过返回 true', async () => {
      expect(await verifyChecksum(file, undefined)).toBe(true);
    });

    test('非法格式校验和返回 false', async () => {
      expect(await verifyChecksum(file, 'not-a-hash')).toBe(false);
    });
  });

  describe('downloadPackage()', () => {
    test('本地文件复制成功', async () => {
      const src = path.join(registryDir, 'pkg.tar.gz');
      await fs.writeFile(src, 'pkg-data');
      const dest = path.join(tmpDir, 'dest.tar.gz');

      await downloadPackage(src, dest);
      expect(await fs.readFile(dest, 'utf8')).toBe('pkg-data');
    });

    test('源不存在时报错', async () => {
      const dest = path.join(tmpDir, 'dest.tar.gz');
      await expect(downloadPackage(path.join(registryDir, 'missing.tar.gz'), dest))
        .rejects.toThrow('不存在');
    });
  });

  describe('extractPackage()', () => {
    test('解压 tar.gz 到目标目录', async () => {
      const srcDir = path.join(tmpDir, 'src-plugin');
      await fs.ensureDir(path.join(srcDir, 'src'));
      await fs.writeFile(path.join(srcDir, 'plugin.json'), JSON.stringify({ id: 'x' }));
      await fs.writeFile(path.join(srcDir, 'src', 'index.cjs'), 'module.exports = class {};');

      const tarball = path.join(registryDir, 'x.tar.gz');
      await tar.create({ gzip: true, file: tarball, cwd: srcDir }, ['plugin.json', 'src']);

      const destDir = path.join(tmpDir, 'extracted');
      await extractPackage(tarball, destDir);

      expect(await fs.pathExists(path.join(destDir, 'plugin.json'))).toBe(true);
      expect(await fs.pathExists(path.join(destDir, 'src', 'index.cjs'))).toBe(true);
    });
  });

  describe('installFromEntry()', () => {
    test('本地仓库完整流程：下载 + 校验 + 解压', async () => {
      // 构造插件源码并打包
      const srcDir = path.join(tmpDir, 'plugin-src');
      await fs.ensureDir(path.join(srcDir, 'src'));
      await fs.writeFile(path.join(srcDir, 'plugin.json'), JSON.stringify({ id: 'test-plugin' }));
      await fs.writeFile(path.join(srcDir, 'src', 'index.cjs'), 'module.exports = class {};');

      const tarball = path.join(registryDir, 'test-plugin-1.0.0.tar.gz');
      await tar.create({ gzip: true, file: tarball, cwd: srcDir }, ['plugin.json', 'src']);

      const entry = makeEntry({ checksum: (await sha256(tarball)) });
      const indexFile = path.join(registryDir, 'index.json');
      await fs.writeFile(indexFile, JSON.stringify([entry]));

      const destDir = path.join(tmpDir, 'installed');
      const { tarPath } = await installFromEntry(entry, indexFile, destDir);

      expect(await fs.pathExists(path.join(destDir, 'plugin.json'))).toBe(true);
      expect(await fs.pathExists(path.join(destDir, 'src', 'index.cjs'))).toBe(true);
      expect(await fs.pathExists(tarPath)).toBe(true);
    });

    test('校验和失败时报错', async () => {
      const srcDir = path.join(tmpDir, 'plugin-src');
      await fs.ensureDir(path.join(srcDir, 'src'));
      await fs.writeFile(path.join(srcDir, 'plugin.json'), JSON.stringify({ id: 'x' }));
      await fs.writeFile(path.join(srcDir, 'src', 'index.cjs'), 'module.exports = class {};');

      const tarball = path.join(registryDir, 'test-plugin-1.0.0.tar.gz');
      await tar.create({ gzip: true, file: tarball, cwd: srcDir }, ['plugin.json', 'src']);

      const entry = makeEntry({ checksum: 'f'.repeat(64) }); // 错误校验和
      const indexFile = path.join(registryDir, 'index.json');
      await fs.writeFile(indexFile, JSON.stringify([entry]));

      const destDir = path.join(tmpDir, 'installed');
      await expect(installFromEntry(entry, indexFile, destDir)).rejects.toThrow('校验失败');
    });

    test('清单条目缺少 downloadUrl 时报错', async () => {
      const entry = makeEntry({ downloadUrl: undefined });
      await expect(installFromEntry(entry, path.join(registryDir, 'index.json'), tmpDir))
        .rejects.toThrow('缺少 downloadUrl');
    });
  });

  describe('getRemote 网络行为（重定向）', () => {
    test('跟随一次重定向成功', async () => {
      const server = http.createServer((req, res) => {
        if (req.url === '/redirect') {
          res.writeHead(302, { Location: '/index.json' });
          res.end();
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('[]');
        }
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const port = server.address().port;
      try {
        const index = await fetchRegistry(`http://127.0.0.1:${port}/redirect`);
        expect(index).toEqual([]);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    test('重定向超过 5 次时报错（防循环）', async () => {
      const server = http.createServer((req, res) => {
        res.writeHead(302, { Location: '/' });
        res.end();
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const port = server.address().port;
      try {
        await expect(fetchRegistry(`http://127.0.0.1:${port}/index.json`))
          .rejects.toThrow('重定向次数过多');
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });
});

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(await fs.readFile(filePath));
  return hash.digest('hex');
}
