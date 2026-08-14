const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const tar = require('tar');

const {
  DEFAULT_PLUGIN_REGISTRY,
  fetchRegistry,
  findPlugin,
  resolveDownloadUrl,
  downloadPackage,
  verifyChecksum,
  extractPackage,
  installFromEntry
} = require('../../src/plugin/pluginRegistryClient.cjs');

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

describe('pluginRegistryClient', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-registry-'));
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('DEFAULT_PLUGIN_REGISTRY is a non-empty string', () => {
    expect(typeof DEFAULT_PLUGIN_REGISTRY).toBe('string');
    expect(DEFAULT_PLUGIN_REGISTRY.length).toBeGreaterThan(0);
  });

  test('findPlugin returns matching entry or null', () => {
    const index = [{ id: 'a', version: '1' }, { id: 'b', version: '2' }];
    expect(findPlugin(index, 'a')).toEqual({ id: 'a', version: '1' });
    expect(findPlugin(index, 'zzz')).toBeNull();
    expect(findPlugin(null, 'a')).toBeNull();
    expect(findPlugin([null, undefined], 'a')).toBeNull();
  });

  test('resolveDownloadUrl joins remote and local paths', () => {
    expect(resolveDownloadUrl('pkg.tar.gz', 'https://example.com/repo/index.json')).toBe('https://example.com/repo/pkg.tar.gz');
    expect(resolveDownloadUrl('pkg.tar.gz', path.join('C:', 'repo', 'index.json'))).toBe(path.join('C:', 'repo', 'pkg.tar.gz'));
  });

  describe('fetchRegistry', () => {
    test('reads local index.json', async () => {
      const indexFile = path.join(tempDir, 'index.json');
      await fs.writeFile(indexFile, JSON.stringify([{ id: 'a' }]));
      expect(await fetchRegistry(indexFile)).toEqual([{ id: 'a' }]);
    });

    test('reads file:// index.json', async () => {
      const indexFile = path.join(tempDir, 'index.json');
      await fs.writeFile(indexFile, JSON.stringify([{ id: 'a' }]));
      expect(await fetchRegistry(`file://${  indexFile.replace(/\\/g, '/')}`)).toEqual([{ id: 'a' }]);
    });

    test('throws when local index missing', async () => {
      await expect(fetchRegistry(path.join(tempDir, 'nope.json'))).rejects.toThrow('不存在');
    });

    test('fetches remote index.json', async () => {
      const srv = await startServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ id: 'remote' }]));
      });
      try {
        expect(await fetchRegistry(`${srv.url}/index.json`)).toEqual([{ id: 'remote' }]);
      } finally {
        await srv.close();
      }
    });

    test('follows redirects when fetching remote index', async () => {
      const srv = await startServer((req, res) => {
        if (req.url === '/index.json') {
          res.writeHead(302, { Location: '/real.json' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ id: 'redirected' }]));
      });
      try {
        expect(await fetchRegistry(`${srv.url}/index.json`)).toEqual([{ id: 'redirected' }]);
      } finally {
        await srv.close();
      }
    });

    test('rejects on non-200 remote response', async () => {
      const srv = await startServer((req, res) => {
        res.writeHead(404);
        res.end();
      });
      try {
        await expect(fetchRegistry(`${srv.url}/index.json`)).rejects.toThrow('HTTP 404');
      } finally {
        await srv.close();
      }
    });

    test('rejects after too many redirects', async () => {
      const srv = await startServer((req, res) => {
        res.writeHead(302, { Location: '/loop' });
        res.end();
      });
      try {
        await expect(fetchRegistry(`${srv.url}/loop`)).rejects.toThrow('重定向次数过多');
      } finally {
        await srv.close();
      }
    });
  });

  describe('downloadPackage', () => {
    test('copies local file', async () => {
      const src = path.join(tempDir, 'src.bin');
      const dest = path.join(tempDir, 'dest.bin');
      await fs.writeFile(src, 'hello');
      await downloadPackage(src, dest);
      expect(await fs.readFile(dest, 'utf8')).toBe('hello');
    });

    test('downloads remote file', async () => {
      const srv = await startServer((req, res) => {
        res.writeHead(200);
        res.end(Buffer.from('remote-bytes'));
      });
      try {
        const dest = path.join(tempDir, 'remote.bin');
        await downloadPackage(`${srv.url}/pkg`, dest);
        expect(await fs.readFile(dest, 'utf8')).toBe('remote-bytes');
      } finally {
        await srv.close();
      }
    });

    test('throws when local file missing', async () => {
      await expect(downloadPackage(path.join(tempDir, 'missing.bin'), path.join(tempDir, 'd.bin')))
        .rejects.toThrow('不存在');
    });
  });

  describe('verifyChecksum', () => {
    test('skips when no expected checksum', async () => {
      const f = path.join(tempDir, 'f.bin');
      await fs.writeFile(f, 'x');
      expect(await verifyChecksum(f, undefined)).toBe(true);
      expect(await verifyChecksum(f, '')).toBe(true);
    });

    test('rejects malformed checksum', async () => {
      const f = path.join(tempDir, 'f.bin');
      await fs.writeFile(f, 'x');
      expect(await verifyChecksum(f, 'not-a-hash')).toBe(false);
    });

    test('accepts sha256: prefix and matches content', async () => {
      const f = path.join(tempDir, 'f.bin');
      await fs.writeFile(f, 'hello');
      const hex = sha256Hex(Buffer.from('hello'));
      expect(await verifyChecksum(f, hex)).toBe(true);
      expect(await verifyChecksum(f, `sha256:${  hex}`)).toBe(true);
      expect(await verifyChecksum(f, `sha256:${  '0'.repeat(64)}`)).toBe(false);
    });
  });

  describe('installFromEntry', () => {
    test('throws when entry missing downloadUrl', async () => {
      await expect(installFromEntry({ id: 'x', version: '1' }, tempDir, tempDir)).rejects.toThrow('缺少 downloadUrl');
    });

    test('downloads, verifies and extracts a local package', async () => {
      const pkgDir = path.join(tempDir, '_pkg');
      await fs.ensureDir(path.join(pkgDir, 'src'));
      await fs.writeFile(path.join(pkgDir, 'plugin.json'), JSON.stringify({ id: 'demo', version: '1.0.0' }));
      await fs.writeFile(path.join(pkgDir, 'src', 'index.cjs'), 'module.exports = {};');

      const tarPath = path.join(tempDir, 'demo-1.0.0.tar.gz');
      await tar.create({ gzip: true, file: tarPath, cwd: pkgDir }, ['plugin.json', 'src']);
      const checksum = sha256Hex(await fs.readFile(tarPath));

      const destDir = path.join(tempDir, '_dest');
      const result = await installFromEntry(
        { id: 'demo', version: '1.0.0', downloadUrl: 'demo-1.0.0.tar.gz', checksum },
        path.join(tempDir, 'index.json'),
        destDir
      );
      expect(result.tarPath).toBe(path.join(destDir, 'demo-1.0.0.tar.gz'));
      expect(await fs.pathExists(path.join(destDir, 'plugin.json'))).toBe(true);
      expect(await fs.pathExists(path.join(destDir, 'src', 'index.cjs'))).toBe(true);
    });

    test('rejects on checksum mismatch', async () => {
      const pkgDir = path.join(tempDir, '_pkg');
      await fs.ensureDir(pkgDir);
      await fs.writeFile(path.join(pkgDir, 'plugin.json'), '{}');
      const tarPath = path.join(tempDir, 'x-1.tar.gz');
      await tar.create({ gzip: true, file: tarPath, cwd: pkgDir }, ['plugin.json']);

      await expect(installFromEntry(
        { id: 'x', version: '1', downloadUrl: 'x-1.tar.gz', checksum: 'f'.repeat(64) },
        path.join(tempDir, 'index.json'),
        path.join(tempDir, '_dest')
      )).rejects.toThrow('校验失败');
    });
  });

  describe('extractPackage', () => {
    test('extracts tar.gz into dest dir', async () => {
      const srcDir = path.join(tempDir, 'src');
      await fs.ensureDir(srcDir);
      await fs.writeFile(path.join(srcDir, 'a.txt'), 'a');
      const tarPath = path.join(tempDir, 'a.tar.gz');
      await tar.create({ gzip: true, file: tarPath, cwd: srcDir }, ['a.txt']);

      const destDir = path.join(tempDir, 'out');
      await extractPackage(tarPath, destDir);
      expect(await fs.readFile(path.join(destDir, 'a.txt'), 'utf8')).toBe('a');
    });
  });
});
